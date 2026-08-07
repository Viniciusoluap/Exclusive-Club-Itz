/**
 * Job: backup automático DIÁRIO do banco de dados.
 *
 * POR QUE ESTE JOB EXISTE: a tela promete "backups automáticos", mas não havia
 * nenhum agendamento dentro do servidor. O único agendador do projeto
 * (`schedule-backup.ts`) é um script solto, que ninguém executa em produção.
 * O que produzia backups era um efeito colateral acidental: um bloco de
 * execução por linha de comando em `backup.ts` cuja condição virava sempre
 * verdadeira depois do empacotamento, disparando um backup a cada start do
 * servidor. Como a hospedagem recicla a instância com frequência, isso gerou
 * 313 backups numa única noite.
 *
 * Aqui o agendamento é explícito: uma vez por dia, às 03:00 de São Paulo. E há
 * uma trava independente do relógio — se já existe backup bem-sucedido hoje,
 * a rodada é ignorada. Assim, mesmo que a instância reinicie no meio da
 * madrugada e o cron dispare de novo, não nasce um segundo backup do dia.
 *
 * O botão da tela continua livre: quantos backups manuais o usuário quiser.
 */

import cron from "node-cron";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { todayInSaoPaulo } from "../_core/dateBR";

/** Já houve backup concluído com sucesso hoje (data de São Paulo)? */
export async function jaFezBackupHoje(db: any): Promise<boolean> {
  const hoje = todayInSaoPaulo();
  const raw = (await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM backup_history
    WHERE status = 'success'
      AND DATE(CONVERT_TZ(started_at, '+00:00', '-03:00')) = ${hoje}
  `)) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  return Number(rows?.[0]?.total ?? 0) > 0;
}

export async function runScheduledBackup(): Promise<{ ran: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) return { ran: false, reason: "banco indisponível" };

  try {
    if (await jaFezBackupHoje(db)) {
      return { ran: false, reason: "já existe backup bem-sucedido hoje" };
    }

    const { runBackup } = await import("../backup");
    await runBackup();
    return { ran: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[backupDiario] Falhou:", message);
    return { ran: false, reason: message };
  }
}

export function scheduleDailyBackup(): void {
  cron.schedule(
    "0 3 * * *",
    async () => {
      const r = await runScheduledBackup();
      console.log(
        r.ran ? "[backupDiario] ✅ Backup diário concluído." : `[backupDiario] Ignorado: ${r.reason}`,
      );
    },
    { timezone: "America/Sao_Paulo" },
  );

  console.log("[backupDiario] 📅 Job agendado: todo dia às 03:00 America/Sao_Paulo");
}
