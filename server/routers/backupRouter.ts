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
import { sql } from 'drizzle-orm';
import { toIsoUtc } from '../_core/dateBR';

const execAsync = promisify(exec);

/**
 * Normaliza as datas de um registro de backup para ISO-8601 UTC explícito.
 * Sem isso, o front recebe "2026-08-03 01:13:46" (sem fuso) e o navegador
 * interpreta como horário local, exibindo o backup como se fosse no futuro.
 */
function withNormalizedDates<T extends { startedAt?: any; completedAt?: any }>(row: T): T {
  return {
    ...row,
    startedAt: toIsoUtc(row.startedAt),
    completedAt: toIsoUtc(row.completedAt),
  };
}

/** Minutos após os quais um backup "running" é considerado travado. */
const STALE_RUNNING_MINUTES = 30;

/**
 * Marca como falha os backups presos em "running".
 *
 * `runNow` dispara runBackup() sem aguardar (fire-and-forget) para não estourar
 * o timeout do gateway. Em hospedagem autoscale, quando a requisição HTTP
 * termina a instância pode ser suspensa e o trabalho de fundo morre no meio —
 * deixando a linha em "running" para sempre. A tela então mostrava backups
 * eternamente "Em Execução" e uma taxa de sucesso enganosa.
 */
async function failStaleRunningBackups(db: any): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE backup_history
      SET status = 'failed',
          completed_at = NOW(),
          error_message = COALESCE(error_message, 'Backup interrompido: o processo foi encerrado antes de concluir (execução em segundo plano não sobreviveu ao ciclo de vida da instância).')
      WHERE status = 'running'
        AND started_at < DATE_SUB(NOW(), INTERVAL ${STALE_RUNNING_MINUTES} MINUTE)
    `);
  } catch (e: any) {
    console.warn('[backup] Falha ao marcar backups travados:', e?.message);
  }
}

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

      await failStaleRunningBackups(db);

      const history = await db
        .select()
        .from(backupHistory)
        .orderBy(desc(backupHistory.startedAt))
        .limit(limit);

      return history.map(withNormalizedDates);
    }),

  /**
   * Obtém estatísticas de backups
   */
  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      throw new Error('Database not available');
    }

    await failStaleRunningBackups(db);

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
      lastBackup: lastBackup ? withNormalizedDates(lastBackup) : null,
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

    return latest.length > 0 ? withNormalizedDates(latest[0]) : null;
  }),

  /**
   * Executa backup manualmente (fire-and-forget para evitar timeout de gateway)
   */
  runNow: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (db) {
      // Não deixa empilhar: com anexos, cada execução baixa todos os arquivos
      // do storage. Duas ao mesmo tempo dobram o custo e se atropelam.
      await failStaleRunningBackups(db);
      const runningRaw = (await db.execute(
        sql`SELECT COUNT(*) AS total FROM backup_history WHERE status = 'running'`
      )) as any;
      const runningRow = (Array.isArray(runningRaw[0]) ? runningRaw[0] : runningRaw)[0];
      if (Number(runningRow?.total ?? 0) > 0) {
        return {
          success: false,
          message: 'Já existe um backup em andamento. Aguarde a conclusão antes de iniciar outro.',
        };
      }
    }

    const { runBackup } = await import('../backup');

    // Dispara em background para não estourar o timeout do gateway. Falhas são
    // registradas no histórico pelo próprio runBackup; o que ficar preso é
    // marcado como falha por failStaleRunningBackups.
    runBackup().catch((error: any) => {
      console.error('[Backup Manual] Erro durante execução em background:', error);
    });

    return {
      success: true,
      message: 'Backup iniciado. Acompanhe o progresso no histórico.',
    };
  }),

  /**
   * Progresso do arquivamento de anexos (sem processar nada).
   */
  getAttachmentsProgress: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const { getArchiveProgress } = await import('../backupAttachmentsArchive');
    return getArchiveProgress(db);
  }),

  /**
   * Arquiva UM LOTE de anexos ainda não salvos.
   *
   * Cada chamada é curta de propósito: o trabalho em segundo plano não
   * sobrevive ao ciclo de vida da instância nesta hospedagem, então a tela
   * chama repetidamente até `done`, em vez de uma única execução longa que
   * morreria no meio.
   */
  archiveAttachmentsBatch: adminProcedure
    // `limit` é só uma trava superior — o que fecha o lote é o orçamento de
    // tempo do próprio arquivamento, para a requisição nunca durar mais do que
    // o proxy tolera (ver BUDGET_MS em backupAttachmentsArchive.ts).
    .input(z.object({ limit: z.number().min(1).max(100).default(25) }).optional())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const { archiveAttachmentsBatch } = await import('../backupAttachmentsArchive');
      return archiveAttachmentsBatch(db, input?.limit ?? 25);
    }),

  /** Quantos backups redundantes existem (sem remover nada). */
  getCleanupPreview: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const { previewCleanup } = await import('../backupCleanup');
    return previewCleanup(db);
  }),

  /**
   * Remove os backups redundantes: mantém o mais recente de cada dia e apaga
   * as repetições do mesmo dia, além de registros de falha antigos. Nasceu da
   * enxurrada gerada pelo backup que disparava a cada start do servidor.
   */
  cleanupRedundant: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const { runCleanup } = await import('../backupCleanup');
    return runCleanup(db);
  }),

  /**
   * Apaga TODO o histórico e inicia um backup limpo em seguida.
   *
   * O backup novo não é um extra: entre o DELETE e ele, o sistema fica sem
   * nenhum ponto de restauração. Disparar aqui fecha essa janela sem depender
   * de alguém lembrar de clicar.
   */
  cleanupAll: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const { runFullCleanup } = await import('../backupCleanup');
    const resultado = await runFullCleanup(db);

    // Fire-and-forget, como em `runNow`: o backup leva ~30s e a resposta HTTP
    // não pode esperar por ele. O progresso aparece no próprio histórico.
    const { runBackup } = await import('../backup');
    runBackup().catch((error: any) => {
      console.error('[cleanupAll] Backup inicial falhou:', error?.message ?? error);
    });

    return resultado;
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
