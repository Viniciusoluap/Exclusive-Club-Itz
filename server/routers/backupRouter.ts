import { router, adminProcedure } from '../_core/trpc';
import { getDb } from '../db';
import { backupHistory } from '../../drizzle/schema';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';

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
   * Executa backup manualmente (fire-and-forget para evitar timeout de gateway)
   */
  runNow: adminProcedure.mutation(async () => {
    // Importa a função de backup
    const { runBackup } = await import('../backup');

    // Dispara o backup em background sem aguardar — evita timeout do gateway
    runBackup().catch((error: any) => {
      console.error('[Backup Manual] Erro durante execução em background:', error);
    });

    return {
      success: true,
      message: 'Backup iniciado. Acompanhe o progresso no histórico.',
    };
  }),

  /**
   * Obtém informações de um backup específico para download
   */
  getBackupFile: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      const backup = await db
        .select()
        .from(backupHistory)
        .where(eq(backupHistory.id, input.id))
        .limit(1);

      if (backup.length === 0) {
        throw new Error('Backup não encontrado');
      }

      const backupData = backup[0];

      // Verifica se existe URL S3 ou arquivo local
      const hasS3 = !!backupData.s3Url;
      const hasLocal = !!(backupData.localFilePath && fs.existsSync(backupData.localFilePath));

      if (!hasS3 && !hasLocal) {
        throw new Error('Arquivo de backup não encontrado. O arquivo pode ter sido removido.');
      }

      return {
        id: backupData.id,
        fileName: backupData.fileName,
        filePath: backupData.localFilePath,
        s3Url: backupData.s3Url,
        fileSizeBytes: backupData.fileSizeBytes,
        createdAt: backupData.startedAt,
      };
    }),

  /**
   * Exclui um backup (arquivo e registro do banco)
   */
  deleteBackup: adminProcedure
    .input(z.object({ backupId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      // Busca o backup
      const backup = await db
        .select()
        .from(backupHistory)
        .where(eq(backupHistory.id, input.backupId))
        .limit(1);

      if (backup.length === 0) {
        throw new Error('Backup não encontrado');
      }

      const backupData = backup[0];

      // Remove o arquivo físico se existir
      if (backupData.localFilePath && fs.existsSync(backupData.localFilePath)) {
        try {
          fs.unlinkSync(backupData.localFilePath);
        } catch (error: any) {
          console.error('Erro ao excluir arquivo de backup:', error);
          throw new Error(`Erro ao excluir arquivo: ${error.message}`);
        }
      }

      // Remove o registro do banco
      await db.delete(backupHistory).where(eq(backupHistory.id, input.backupId));

      return {
        success: true,
        message: 'Backup excluído com sucesso',
      };
    }),

  /**
   * Restaura um backup (importa o SQL do ZIP para o banco de dados)
   */
  restoreBackup: adminProcedure
    .input(z.object({ backupId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      // Busca o backup
      const backup = await db
        .select()
        .from(backupHistory)
        .where(eq(backupHistory.id, input.backupId))
        .limit(1);

      if (backup.length === 0) {
        throw new Error('Backup não encontrado');
      }

      const backupData = backup[0];

      // Verifica se o arquivo existe
      if (!backupData.localFilePath || !fs.existsSync(backupData.localFilePath)) {
        throw new Error('Arquivo de backup não encontrado no servidor');
      }

      try {
        // Extrai o SQL do ZIP
        const backupDir = path.dirname(backupData.localFilePath);
        const extractDir = path.join(backupDir, `restore-${Date.now()}`);
        fs.mkdirSync(extractDir, { recursive: true });

        // Descompacta o ZIP
        await execAsync(`unzip -q "${backupData.localFilePath}" -d "${extractDir}"`);

        // Procura o arquivo SQL
        const files = fs.readdirSync(extractDir);
        const sqlFile = files.find(f => f.endsWith('.sql'));

        if (!sqlFile) {
          throw new Error('Arquivo SQL não encontrado no backup');
        }

        const sqlFilePath = path.join(extractDir, sqlFile);

        // Importa o SQL para o banco
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
          throw new Error('DATABASE_URL não configurada');
        }

        // Parse da URL do banco
        const dbUrlObj = new URL(dbUrl);
        const host = dbUrlObj.hostname;
        const port = dbUrlObj.port || '4000';
        const user = dbUrlObj.username;
        const password = dbUrlObj.password;
        const database = dbUrlObj.pathname.slice(1);

        // Executa o restore
        await execAsync(
          `mysql -h ${host} -P ${port} -u ${user} -p${password} ${database} < "${sqlFilePath}"`,
          {
            timeout: 300000, // 5 minutos
          }
        );

        // Limpa o diretório temporário
        await execAsync(`rm -rf "${extractDir}"`);

        return {
          success: true,
          message: 'Backup restaurado com sucesso',
        };
      } catch (error: any) {
        console.error('Erro ao restaurar backup:', error);
        throw new Error(`Falha ao restaurar backup: ${error.message}`);
      }
    }),
});
