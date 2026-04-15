/**
 * Cron Jobs do Servidor — Exclusive Club
 *
 * Tarefas agendadas que rodam automaticamente em background:
 *
 * 06:00 — syncIncremental BPO: Sincroniza cobranças recentes do Asaas para bpo_charges
 */

import cron from "node-cron";
import { getDb } from "./db";
import { listAllAsaasCharges } from "./_core/asaasService";
import { bpoCharges } from "../drizzle/schema";
import { normalizeBpoStatus } from "./routers/bpoRouter";
import { eq } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Registro dos cron jobs
// ─────────────────────────────────────────────────────────────────────────────

export function registerCronJobs(): void {
  // ── 06:00 — Sync Incremental BPO: Sincroniza cobranças recentes do Asaas ──
  cron.schedule("0 6 * * *", async () => {
    console.log("[CronJob] 06:00 — Executando Sync Incremental BPO...");
    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Buscar cobranças dos últimos 90 dias
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const sinceStr = since.toISOString().split("T")[0];

      let offset = 0;
      let hasMore = true;
      let updated = 0;
      let errors = 0;

      while (hasMore) {
        const { charges: batch, hasMore: more } = await listAllAsaasCharges({
          limit: 100,
          offset,
          dueDateGte: sinceStr,
        });
        if (batch.length === 0) { hasMore = false; break; }
        if (!more || batch.length < 100) hasMore = false;
        offset += 100;

        for (const charge of batch) {
          try {
            const newStatus = normalizeBpoStatus(charge.status);
            await db
              .update(bpoCharges)
              .set({
                status: newStatus,
                paidDate: (charge as any).paymentDate || null,
                syncedAt: new Date(),
              })
              .where(eq(bpoCharges.asaasChargeId, charge.id));
            updated++;
          } catch (err) {
            errors++;
          }
        }
      }

      console.log(`[CronJob syncIncremental] Concluído: ${updated} atualizadas, ${errors} erros`);
    } catch (err) {
      console.error("[CronJob syncIncremental] Erro:", err);
    }
  }, { timezone: "America/Sao_Paulo" });

  console.log("[CronJobs] Registrados: syncIncremental BPO (06:00) — Fuso: America/Sao_Paulo");
}
