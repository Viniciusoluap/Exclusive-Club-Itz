/**
 * Progresso do backup em andamento.
 *
 * POR QUE EXISTE: enquanto o backup rodava, a tela mostrava apenas
 * "Em Execução". Isso não distingue "trabalhando normalmente" de "travado" —
 * e travar é justamente o que já aconteceu aqui mais de uma vez. Um percentual
 * que avança é a diferença entre acompanhar e torcer.
 *
 * O PERCENTUAL É REAL, NÃO CRONÔMETRO. Cada faixa corresponde a uma etapa que
 * de fato terminou, e dentro da exportação o avanço é por tabela concluída.
 * Uma barra baseada em tempo médio andaria bonitinho enquanto o processo está
 * morto — exatamente o problema que ela deveria denunciar.
 *
 * Os pesos abaixo vêm das durações observadas: a exportação domina (~20s de um
 * backup de ~25s), o resto é rápido.
 */

import { sql } from "drizzle-orm";

export const FASES = {
  INICIO: { percent: 2, step: "Preparando" },
  EXPORT_INICIO: { percent: 5, step: "Exportando o banco" },
  /** Fim da exportação; o miolo (5→70) é distribuído entre as tabelas. */
  EXPORT_FIM: { percent: 70, step: "Banco exportado" },
  ZIP: { percent: 78, step: "Compactando" },
  CRIPTOGRAFIA: { percent: 86, step: "Criptografando" },
  UPLOAD: { percent: 92, step: "Enviando ao armazenamento" },
  LIMPEZA: { percent: 98, step: "Finalizando" },
} as const;

/** Percentual dentro da exportação, proporcional às tabelas já concluídas. */
export function percentualDaExportacao(tabelasFeitas: number, tabelasTotal: number): number {
  if (tabelasTotal <= 0) return FASES.EXPORT_INICIO.percent;
  const inicio = FASES.EXPORT_INICIO.percent;
  const fim = FASES.EXPORT_FIM.percent;
  const fracao = Math.min(1, Math.max(0, tabelasFeitas / tabelasTotal));
  return Math.round(inicio + (fim - inicio) * fracao);
}

/**
 * Garante as colunas de progresso, sem depender da migração ter sido aplicada.
 *
 * Mesma razão do CREATE TABLE IF NOT EXISTS em backupAttachmentsArchive.ts: a
 * hospedagem publica o código novo mas não roda as migrações do banco. Sem
 * isto, a primeira gravação de progresso derrubaria o backup inteiro por causa
 * de uma coluna ausente — trocando um incômodo visual por uma falha real.
 *
 * `ADD COLUMN IF NOT EXISTS` não é portável (o TiDB aceita, o MySQL não), então
 * a existência é conferida no information_schema antes.
 */
export async function ensureProgressColumns(db: any): Promise<void> {
  const raw = (await db.execute(sql`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'backup_history'
      AND COLUMN_NAME IN ('progress_percent', 'progress_step')
  `)) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  const existentes = new Set(
    (Array.isArray(rows) ? rows : []).map((r: any) => String(r.COLUMN_NAME ?? r.column_name ?? "")),
  );

  if (!existentes.has("progress_percent")) {
    await db.execute(sql`ALTER TABLE backup_history ADD COLUMN progress_percent int`);
  }
  if (!existentes.has("progress_step")) {
    await db.execute(sql`ALTER TABLE backup_history ADD COLUMN progress_step varchar(120)`);
  }
}

/**
 * Grava o progresso. Nunca derruba o backup.
 *
 * Um percentual que não foi salvo é um incômodo; um backup interrompido porque
 * o percentual não pôde ser salvo é um estrago. A ordem de importância entre
 * as duas coisas não é ambígua.
 */
export async function setProgress(
  db: any,
  backupId: number | null,
  percent: number,
  step: string,
): Promise<void> {
  if (!db || !backupId) return;
  try {
    await db.execute(sql`
      UPDATE backup_history
      SET progress_percent = ${percent}, progress_step = ${step}
      WHERE id = ${backupId}
    `);
  } catch (error) {
    console.warn("[backupProgress] Não gravou o progresso:", error);
  }
}
