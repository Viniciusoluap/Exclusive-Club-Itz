/**
 * Job: reattachAttachments
 *
 * POR QUE ESTE JOB EXISTE: recolocar 243 anexos clicando um botão no celular
 * não é confiável — pela mesma razão que arquivar não era. Cada lote é uma
 * requisição HTTP com prazo, e cada anexo custa uma verificação de rede mais,
 * quando está quebrado, um download e um upload. Em produção (05/09/2026) a
 * tela ficou seis minutos em "0 recolocado(s)" e terminou em "Load failed":
 * o trabalho não cabia dentro de uma requisição.
 *
 * Aqui não há requisição para estourar nem tela para manter aberta. O servidor
 * drena o acervo sozinho, e o progresso é natural: um anexo recolocado deixa
 * de ser referenciado pela URL antiga, então não volta a ser processado.
 *
 * O botão da tela continua existindo para quem quiser forçar — mas ninguém
 * precisa dele.
 */

import cron from "node-cron";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { reattachAttachmentsBatch } from "../backupAttachmentsReattach";

/**
 * Orçamento por execução. Folgado como o do arquivamento, e pela mesma razão:
 * sem requisição HTTP no caminho, a rodada pode dar conta do acervo inteiro de
 * uma vez em vez de andar de pouquinho.
 */
const TICK_BUDGET_MS = 10 * 60 * 1000;

/** Um backup em andamento já consome a instância — não competir com ele. */
async function backupEmAndamento(db: any): Promise<boolean> {
  const raw = (await db.execute(sql`
    SELECT COUNT(*) AS total FROM backup_history WHERE status = 'running'
  `)) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  return Number(rows?.[0]?.total ?? 0) > 0;
}

export async function runReattachAttachmentsTick(): Promise<{
  skipped: boolean;
  reason?: string;
  reattached?: number;
  stillWorking?: number;
}> {
  const db = await getDb();
  if (!db) return { skipped: true, reason: "banco indisponível" };

  try {
    if (await backupEmAndamento(db)) {
      return { skipped: true, reason: "backup em andamento" };
    }

    const progresso = await reattachAttachmentsBatch(db, 0, TICK_BUDGET_MS);

    if (progresso.reattachedNow > 0 || progresso.failures.length > 0) {
      console.log(
        `[reattachAttachments] ${progresso.reattachedNow} anexo(s) recolocado(s), ` +
          `${progresso.stillWorkingNow} ainda funcionando, ${progresso.failures.length} falha(s).`,
      );
    }

    for (const f of progresso.failures) {
      console.warn(`[reattachAttachments] Falha em ${f.arquivo}: ${f.motivo}`);
    }

    return {
      skipped: false,
      reattached: progresso.reattachedNow,
      stillWorking: progresso.stillWorkingNow,
    };
  } catch (error) {
    // Uma rodada que falha não é motivo de alerta: a próxima tenta de novo e
    // nada se perde. Só registra, para não virar falha silenciosa.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[reattachAttachments] Rodada falhou:", message);
    return { skipped: true, reason: message };
  }
}

export function scheduleReattachAttachments(): void {
  // Domingo às 05:00 de São Paulo — uma hora depois do arquivamento (04:00),
  // que por sua vez vem depois do backup diário (03:00). A ordem importa:
  // recolocar depende de haver cópia arquivada, então roda por último.
  cron.schedule("0 5 * * 0", async () => {
    await runReattachAttachmentsTick();
  }, { timezone: "America/Sao_Paulo" });

  console.log("[reattachAttachments] 📅 Job agendado: domingos às 05:00 America/Sao_Paulo");
}
