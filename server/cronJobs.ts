/**
 * Cron Jobs do Servidor — Exclusive Club
 *
 * Tarefas agendadas que rodam automaticamente em background:
 *
 * 03:00 — syncBpoCache: Sincroniza cobranças do Asaas para o cache local (unclassified_charges)
 * 04:00 — runMaintenanceTasks: Reconciliação, expiração de PIX, atualização de vencidos
 * 00:30 — generateMonthlyCharges: Gera mensalidades do mês corrente para assinaturas ativas
 */

import cron from "node-cron";
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { runMaintenanceTasks } from "./_core/paymentReconciliation";
import { generateMonthlyCharges } from "./automations";
import { listAllAsaasCharges } from "./_core/asaasService";
import { fuelRecords, inspectionCharges, excludedAsaasCharges } from "../drizzle/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

function mapAsaasStatusToUnclassified(status: string): string {
  const s = status.toUpperCase();
  if (s === "RECEIVED" || s === "CONFIRMED") return "paid";
  if (s === "OVERDUE") return "overdue";
  if (s === "PENDING") return "pending";
  return "pending";
}

/**
 * Executa a sincronização do cache BPO (unclassified_charges) com o Asaas.
 * Equivalente ao botão "Sincronizar Cache BPO" no painel admin.
 */
async function runSyncBpoCache(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error("[CronJob syncBpoCache] Database não disponível");
    return;
  }

  console.log("[CronJob syncBpoCache] Iniciando sincronização automática...");

  try {
    // 1. Buscar clientes do Asaas para montar mapa de lookup
    const { listAllAsaasCustomers } = await import("./_core/asaasService");
    const customers = await listAllAsaasCustomers();
    const asaasCustomerMap = new Map<string, { name: string; email: string; cpfCnpj: string }>();
    for (const c of customers) {
      asaasCustomerMap.set(c.id, {
        name: c.name || "",
        email: c.email || "",
        cpfCnpj: c.cpfCnpj || "",
      });
    }

    // 2. Cobranças já classificadas (subscription_charges com asaas_payment_id)
    const classifiedResult = await db.execute(sql`
      SELECT asaas_payment_id FROM subscription_charges
      WHERE asaas_payment_id IS NOT NULL
    `) as any;
    const classifiedRows = Array.isArray(classifiedResult[0]) ? classifiedResult[0] : [];
    const classifiedIds = new Set<string>(classifiedRows.map((r: any) => r.asaas_payment_id));

    // 3. Cobranças excluídas manualmente
    const excludedData = await db.select({ asaasChargeId: excludedAsaasCharges.asaasChargeId }).from(excludedAsaasCharges);
    const excludedIds = new Set<string>(excludedData.map(r => r.asaasChargeId ?? "").filter(Boolean));

    // 4. IDs de outros módulos (combustível e vistorias — não entram no BPO)
    const fuelData = await db.select({ asaasChargeId: fuelRecords.asaasChargeId }).from(fuelRecords);
    const inspData = await db.select({ asaasChargeId: inspectionCharges.asaasChargeId }).from(inspectionCharges);
    const otherModuleIds = new Set<string>();
    fuelData.forEach(r => { if (r.asaasChargeId) otherModuleIds.add(r.asaasChargeId); });
    inspData.forEach(r => { if (r.asaasChargeId) otherModuleIds.add(r.asaasChargeId); });

    // 5. Buscar TODAS as cobranças do Asaas em lotes e upsert no cache
    let offset = 0;
    let hasMore = true;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    while (hasMore) {
      const { charges: batch, hasMore: more } = await listAllAsaasCharges({ limit: 100, offset });
      if (batch.length === 0) { hasMore = false; break; }
      if (!more || batch.length < 100) hasMore = false;
      offset += 100;

      for (const charge of batch) {
        if (charge.status === "DELETED" || charge.status === "CANCELLED") { skipped++; continue; }
        if (otherModuleIds.has(charge.id) || excludedIds.has(charge.id)) { skipped++; continue; }

        const customer = asaasCustomerMap.get((charge as any).customer ?? "");
        const isClassified = classifiedIds.has(charge.id) ? 1 : 0;
        const mappedStatus = mapAsaasStatusToUnclassified(charge.status);

        try {
          await db.execute(sql.raw(`
            INSERT INTO unclassified_charges
              (asaas_payment_id, asaas_customer_id, asaas_customer_name, asaas_customer_email, asaas_customer_cpf_cnpj,
               description, value, due_date, paid_date, asaas_status, status, classified, last_synced_at)
            VALUES (
              '${charge.id.replace(/'/g, "''")}',
              '${((charge as any).customer ?? "").replace(/'/g, "''")}',
              '${(customer?.name ?? "").replace(/'/g, "''")}',
              '${(customer?.email ?? "").replace(/'/g, "''")}',
              '${(customer?.cpfCnpj ?? "").replace(/'/g, "''")}',
              '${(charge.description ?? "").replace(/'/g, "''")}',
              ${charge.value},
              '${charge.dueDate}',
              ${(charge as any).paymentDate ? `'${(charge as any).paymentDate}'` : "NULL"},
              '${charge.status}',
              '${mappedStatus}',
              ${isClassified},
              NOW()
            )
            ON DUPLICATE KEY UPDATE
              asaas_customer_id = VALUES(asaas_customer_id),
              asaas_customer_name = COALESCE(NULLIF(VALUES(asaas_customer_name), ''), asaas_customer_name),
              asaas_customer_email = COALESCE(NULLIF(VALUES(asaas_customer_email), ''), asaas_customer_email),
              asaas_customer_cpf_cnpj = COALESCE(NULLIF(VALUES(asaas_customer_cpf_cnpj), ''), asaas_customer_cpf_cnpj),
              description = COALESCE(NULLIF(VALUES(description), ''), description),
              value = VALUES(value),
              due_date = VALUES(due_date),
              paid_date = VALUES(paid_date),
              asaas_status = VALUES(asaas_status),
              status = VALUES(status),
              classified = VALUES(classified),
              last_synced_at = NOW()
          `));
          if (isClassified) updated++; else inserted++;
        } catch (err) {
          console.error(`[CronJob syncBpoCache] Erro ao upsert ${charge.id}:`, err);
          skipped++;
        }
      }
    }

    // 6. Marcar classified=1 para cobranças já vinculadas
    if (classifiedIds.size > 0) {
      const arr = Array.from(classifiedIds);
      for (let i = 0; i < arr.length; i += 500) {
        const chunk = arr.slice(i, i + 500).map(id => `'${id.replace(/'/g, "''")}'`).join(",");
        await db.execute(sql.raw(
          `UPDATE unclassified_charges SET classified = 1 WHERE asaas_payment_id IN (${chunk}) AND classified = 0`
        ));
      }
    }

    console.log(
      `[CronJob syncBpoCache] Concluído: ${inserted} inseridas, ${updated} atualizadas, ${skipped} ignoradas.`
    );
  } catch (err) {
    console.error("[CronJob syncBpoCache] Erro:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro dos cron jobs
// ─────────────────────────────────────────────────────────────────────────────

export function registerCronJobs(): void {
  // ── 00:30 — Gerar mensalidades do mês corrente ──────────────────────────
  cron.schedule("30 0 * * *", async () => {
    console.log("[CronJob] 00:30 — Gerando mensalidades mensais...");
    try {
      const result = await generateMonthlyCharges();
      console.log("[CronJob generateMonthlyCharges]", result);
    } catch (err) {
      console.error("[CronJob generateMonthlyCharges] Erro:", err);
    }
  }, { timezone: "America/Sao_Paulo" });

  // ── 03:00 — Sincronizar cache BPO com Asaas ─────────────────────────────
  cron.schedule("0 3 * * *", async () => {
    console.log("[CronJob] 03:00 — Sincronizando cache BPO...");
    await runSyncBpoCache();
  }, { timezone: "America/Sao_Paulo" });

  // ── 04:00 — Reconciliação, expiração de PIX, vencidos ───────────────────
  cron.schedule("0 4 * * *", async () => {
    console.log("[CronJob] 04:00 — Executando manutenção e reconciliação...");
    try {
      const result = await runMaintenanceTasks();
      console.log("[CronJob runMaintenanceTasks] Resultado:", {
        reconciliation: result.reconciliation
          ? `${result.reconciliation.totalChecked} verificados, ${result.reconciliation.totalFixed} corrigidos`
          : "skipped",
        expiration: result.expiration ? `${result.expiration.expired} expirados` : "skipped",
        overdue: result.overdue ? `${result.overdue.updated} atualizados` : "skipped",
      });
    } catch (err) {
      console.error("[CronJob runMaintenanceTasks] Erro:", err);
    }
  }, { timezone: "America/Sao_Paulo" });

  console.log("[CronJobs] Registrados: syncBpoCache (03:00), manutenção (04:00), mensalidades (00:30) — Fuso: America/Sao_Paulo");
}
