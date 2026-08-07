/**
 * Job: archiveAttachments
 *
 * POR QUE ESTE JOB EXISTE: arquivar 238 anexos clicando um botão no celular
 * nunca ia ser confiável. Cada lote é uma requisição HTTP, e requisição HTTP
 * tem prazo: o proxy da hospedagem devolveu HTTP 503 no meio do caminho porque
 * a instância estava ocupada — havia um backup rodando ao mesmo tempo. Não
 * adianta encurtar o lote: enquanto o trabalho estiver DENTRO de uma requisição,
 * ele disputa espaço com o resto do sistema e depende do navegador ficar aberto.
 *
 * A saída é tirar o navegador e o proxy do caminho. O próprio servidor drena o
 * acervo aos poucos, sozinho. Não há requisição para estourar, não há tela para
 * manter aberta, e o trabalho é retomado a cada execução porque cada anexo
 * arquivado já fica gravado.
 *
 * O botão da tela continua existindo para quem quiser forçar — mas ninguém
 * precisa dele.
 */

import cron from "node-cron";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { archiveAttachmentsBatch } from "../backupAttachmentsArchive";

/**
 * Orçamento por execução. Muito mais folgado que o do botão (12s) porque aqui
 * não há requisição HTTP para estourar, e a rodada acontece de madrugada, uma
 * vez por semana — é para dar conta do acervo inteiro de uma vez, não para
 * andar de pouquinho.
 */
const TICK_BUDGET_MS = 10 * 60 * 1000;
const TICK_MAX_FILES = 2000;

/** Um backup em andamento já consome a instância. Foi essa disputa que gerou o 503. */
async function backupEmAndamento(db: any): Promise<boolean> {
  const raw = (await db.execute(sql`
    SELECT COUNT(*) AS total FROM backup_history WHERE status = 'running'
  `)) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  return Number(rows?.[0]?.total ?? 0) > 0;
}

export async function runArchiveAttachmentsTick(): Promise<{
  skipped: boolean;
  reason?: string;
  archived?: number;
  remaining?: number;
}> {
  const db = await getDb();
  if (!db) {
    return { skipped: true, reason: "banco indisponível" };
  }

  try {
    if (await backupEmAndamento(db)) {
      return { skipped: true, reason: "backup em andamento" };
    }

    const progress = await archiveAttachmentsBatch(db, TICK_MAX_FILES, TICK_BUDGET_MS);

    if (progress.processedNow > 0) {
      console.log(
        `[archiveAttachments] ${progress.processedNow} anexo(s) nesta rodada — ` +
          `${progress.archived}/${progress.total} arquivados, ${progress.remaining} restantes.`,
      );
    }

    return {
      skipped: false,
      archived: progress.archived,
      remaining: progress.remaining,
    };
  } catch (error) {
    // Uma rodada que falha não é motivo de alerta: a próxima tenta de novo e
    // nada se perde. Só registra, para não virar falha silenciosa.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[archiveAttachments] Rodada falhou:", message);
    return { skipped: true, reason: message };
  }
}

export function scheduleArchiveAttachments(): void {
  // Domingo às 04:00 de São Paulo — uma vez por semana, depois do backup
  // diário do banco (03:00), para as duas coisas não competirem pela
  // instância. Foi essa disputa que gerou o HTTP 503 quando o arquivamento
  // rodava junto de um backup.
  //
  // Fotos e documentos são estáticos: uma foto de abastecimento de julho não
  // muda mais. Uma vez por semana é suficiente para recolher o que entrou no
  // período, e o botão da tela continua livre para quem quiser antecipar.
  cron.schedule("0 4 * * 0", async () => {
    await runArchiveAttachmentsTick();
  }, { timezone: "America/Sao_Paulo" });

  console.log("[archiveAttachments] 📅 Job agendado: domingos às 04:00 America/Sao_Paulo");
}
