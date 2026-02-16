import { router, adminProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { backupHistory } from '../../drizzle/schema';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const backupRouter = router({
  /**
   * Lista histórico de backups
   */
  getHistory: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      const limit = input?.limit || 50;

      const history = await db
        .select()
        .from(backupHistory)
        .orderBy(desc(backupHistory.startedAt))
        .limit(limit);

      return history;
    }),

  /**
   * Obtém estatísticas de backups
   */
  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      throw new Error('Database not available');
    }

    const allBackups = await db.select().from(backupHistory);

    const totalBackups = allBackups.length;
    const successfulBackups = allBackups.filter(b => b.status === 'success').length;
    const failedBackups = allBackups.filter(b => b.status === 'failed').length;
    const runningBackups = allBackups.filter(b => b.status === 'running').length;

    // Último backup
    const lastBackup = allBackups.length > 0 
      ? allBackups.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]
      : null;

    // Tamanho total dos backups
    const totalSizeBytes = allBackups
      .filter(b => b.fileSizeBytes)
      .reduce((sum, b) => sum + (b.fileSizeBytes || 0), 0);

    // Duração média
    const successfulWithDuration = allBackups.filter(b => b.status === 'success' && b.durationSeconds);
    const avgDurationSeconds = successfulWithDuration.length > 0
      ? successfulWithDuration.reduce((sum, b) => sum + (b.durationSeconds || 0), 0) / successfulWithDuration.length
      : 0;

    return {
      totalBackups,
      successfulBackups,
      failedBackups,
      runningBackups,
      lastBackup,
      totalSizeBytes,
      avgDurationSeconds: Math.round(avgDurationSeconds),
      successRate: totalBackups > 0 ? Math.round((successfulBackups / totalBackups) * 100) : 0,
    };
  }),

  /**
   * Obtém último backup
   */
  getLatest: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      throw new Error('Database not available');
    }

    const latest = await db
      .select()
      .from(backupHistory)
      .orderBy(desc(backupHistory.startedAt))
      .limit(1);

    return latest.length > 0 ? latest[0] : null;
  }),

  /**
   * Executa backup manualmente
   */
  runNow: adminProcedure.mutation(async () => {
    try {
      // Executa o script de backup em background
      const { stdout, stderr } = await execAsync('cd /home/ubuntu/exclusive-club-reservas && pnpm backup', {
        timeout: 300000, // 5 minutos de timeout
      });

      if (stderr && !stderr.includes('deprecated')) {
        console.error('Backup stderr:', stderr);
      }

      console.log('Backup stdout:', stdout);

      return {
        success: true,
        message: 'Backup executado com sucesso',
      };
    } catch (error: any) {
      console.error('Erro ao executar backup:', error);
      throw new Error(`Falha ao executar backup: ${error.message}`);
    }
  }),
});
