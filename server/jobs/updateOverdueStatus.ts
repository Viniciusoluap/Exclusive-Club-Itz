/**
 * Job: updateOverdueStatus
 *
 * Executa diariamente às 00:05 e atualiza o status de cobranças vencidas
 * (due_date < hoje e status = 'pending') para 'overdue' nas tabelas:
 *   - inspection_charges  (cobranças de danos e reparos)
 *   - bpo_charges         (mensalidades, abastecimentos e outras cobranças BPO)
 *   - fuel_records        (registros de abastecimento)
 *
 * Isso garante que o status exibido nas telas do Admin e do cliente
 * reflita a realidade financeira sem depender de cálculo dinâmico no frontend.
 */

import cron from "node-cron";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export async function runUpdateOverdueStatus(): Promise<{
  inspectionCharges: number;
  bpoCharges: number;
  fuelRecords: number;
  total: number;
}> {
  const db = await getDb();
  if (!db) {
    console.warn("[updateOverdueStatus] Banco de dados não disponível — job ignorado.");
    return { inspectionCharges: 0, bpoCharges: 0, fuelRecords: 0, total: 0 };
  }

  let inspectionChargesUpdated = 0;
  let bpoChargesUpdated = 0;
  let fuelRecordsUpdated = 0;

  try {
    // 1. Cobranças de danos e reparos
    const [icResult] = await db.execute(sql.raw(`
      UPDATE inspection_charges
      SET payment_status = 'overdue'
      WHERE payment_status = 'pending'
        AND due_date < CURDATE()
    `)) as any;
    inspectionChargesUpdated = icResult?.affectedRows ?? 0;

    // 2. Cobranças BPO (mensalidades, abastecimentos, outros)
    const [bpoResult] = await db.execute(sql.raw(`
      UPDATE bpo_charges
      SET status = 'overdue'
      WHERE status = 'pending'
        AND due_date < CURDATE()
    `)) as any;
    bpoChargesUpdated = bpoResult?.affectedRows ?? 0;

    // 3. Registros de abastecimento
    const [frResult] = await db.execute(sql.raw(`
      UPDATE fuel_records
      SET payment_status = 'overdue'
      WHERE payment_status = 'pending'
        AND due_date < CURDATE()
    `)) as any;
    fuelRecordsUpdated = frResult?.affectedRows ?? 0;

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

    return { inspectionCharges: inspectionChargesUpdated, bpoCharges: bpoChargesUpdated, fuelRecords: fuelRecordsUpdated, total };
  } catch (error) {
    console.error("[updateOverdueStatus] ❌ Erro ao atualizar status:", error);
    return { inspectionCharges: 0, bpoCharges: 0, fuelRecords: 0, total: 0 };
  }
}

/**
 * Registra o job no scheduler do node-cron.
 * Chamado uma vez na inicialização do servidor.
 */
export function scheduleUpdateOverdueStatus(): void {
  // Executa todo dia às 00:05 (horário UTC do servidor)
  cron.schedule("5 0 * * *", async () => {
    console.log("[updateOverdueStatus] 🕐 Iniciando atualização diária de status...");
    await runUpdateOverdueStatus();
  });

  console.log("[updateOverdueStatus] 📅 Job agendado: todo dia às 00:05 UTC");
}
