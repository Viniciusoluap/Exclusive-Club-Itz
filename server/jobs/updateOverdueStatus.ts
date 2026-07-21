/**
 * Job: updateOverdueStatus
 *
 * Executa diariamente às 00:05 (horário de São Paulo) e atualiza o status de
 * cobranças vencidas (due_date < hoje e status = 'pending') para 'overdue'
 * nas tabelas:
 *   - inspection_charges  (cobranças de danos e reparos)
 *   - bpo_charges         (mensalidades, abastecimentos e outras cobranças BPO)
 *   - fuel_records        (registros de abastecimento)
 *
 * Isso garante que o status exibido nas telas do Admin e do cliente
 * reflita a realidade financeira sem depender de cálculo dinâmico no frontend.
 *
 * Story 10 (Fase 1, SYS-23): as 3 UPDATEs rodam dentro de uma única transação
 * (antes eram independentes — uma falha no meio deixava as tabelas
 * dessincronizadas, ex.: bpo_charges marcada como vencida mas fuel_records
 * não); a fronteira de "vencido" é calculada em America/Sao_Paulo em vez de
 * CURDATE() (fuso do servidor de banco, tipicamente UTC — adiantava a
 * marcação de vencido em até 3h em relação à meia-noite real em São Paulo);
 * e uma falha agora dispara um alerta para o proprietário em vez de só
 * logar e retornar zeros silenciosamente (indistinguível de "nada vencido").
 */

import cron from "node-cron";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

function todayInSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function runUpdateOverdueStatus(): Promise<{
  inspectionCharges: number;
  bpoCharges: number;
  fuelRecords: number;
  total: number;
  success: boolean;
}> {
  const db = await getDb();
  if (!db) {
    console.warn("[updateOverdueStatus] Banco de dados não disponível — job ignorado.");
    return { inspectionCharges: 0, bpoCharges: 0, fuelRecords: 0, total: 0, success: false };
  }

  const today = todayInSaoPaulo();
  let inspectionChargesUpdated = 0;
  let bpoChargesUpdated = 0;
  let fuelRecordsUpdated = 0;

  try {
    // Transação única: se qualquer UPDATE falhar no meio, os anteriores
    // revertem também — nenhuma tabela fica marcada como vencida sozinha.
    await db.transaction(async (tx) => {
      // 1. Cobranças de danos e reparos
      const [icResult] = (await tx.execute(sql`
        UPDATE inspection_charges
        SET payment_status = 'overdue'
        WHERE payment_status = 'pending'
          AND due_date < ${today}
      `)) as any;
      inspectionChargesUpdated = icResult?.affectedRows ?? 0;

      // 2. Cobranças BPO (mensalidades, abastecimentos, outros)
      const [bpoResult] = (await tx.execute(sql`
        UPDATE bpo_charges
        SET status = 'overdue'
        WHERE status = 'pending'
          AND due_date < ${today}
      `)) as any;
      bpoChargesUpdated = bpoResult?.affectedRows ?? 0;

      // 3. Registros de abastecimento
      const [frResult] = (await tx.execute(sql`
        UPDATE fuel_records
        SET payment_status = 'overdue'
        WHERE payment_status = 'pending'
          AND due_date < ${today}
      `)) as any;
      fuelRecordsUpdated = frResult?.affectedRows ?? 0;
    });

    const total = inspectionChargesUpdated + bpoChargesUpdated + fuelRecordsUpdated;

    if (total > 0) {
      console.log(
        `[updateOverdueStatus] ✅ ${total} registro(s) marcado(s) como vencido(s):` +
        ` inspection_charges=${inspectionChargesUpdated},` +
        ` bpo_charges=${bpoChargesUpdated},` +
        ` fuel_records=${fuelRecordsUpdated}`
      );
    } else {
      console.log("[updateOverdueStatus] ✅ Nenhum registro novo para marcar como vencido.");
    }

    return { inspectionCharges: inspectionChargesUpdated, bpoCharges: bpoChargesUpdated, fuelRecords: fuelRecordsUpdated, total, success: true };
  } catch (error) {
    console.error("[updateOverdueStatus] ❌ Erro ao atualizar status:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    await notifyOwner({
      title: "Falha no job de inadimplência (updateOverdueStatus)",
      content:
        `O job diário que marca cobranças vencidas falhou e a transação foi revertida por completo — ` +
        `nenhuma cobrança foi marcada como vencida nesta execução (nem inspection_charges, nem bpo_charges, ` +
        `nem fuel_records ficaram dessincronizadas entre si).\n\nErro: ${errorMessage}`,
    });
    return { inspectionCharges: 0, bpoCharges: 0, fuelRecords: 0, total: 0, success: false };
  }
}

/**
 * Registra o job no scheduler do node-cron.
 * Chamado uma vez na inicialização do servidor.
 */
export function scheduleUpdateOverdueStatus(): void {
  // Executa todo dia às 00:05 horário de São Paulo (timezone explícito —
  // sem isso, node-cron usa o fuso do processo, tipicamente UTC, e o job
  // roda 3h "adiantado" em relação à meia-noite real local).
  cron.schedule("5 0 * * *", async () => {
    console.log("[updateOverdueStatus] 🕐 Iniciando atualização diária de status...");
    await runUpdateOverdueStatus();
  }, { timezone: "America/Sao_Paulo" });

  console.log("[updateOverdueStatus] 📅 Job agendado: todo dia às 00:05 America/Sao_Paulo");
}
