/**
 * Cron Jobs do Servidor — Exclusive Club
 *
 * Tarefas agendadas que rodam automaticamente em background:
 *
 * A cada 4h (0,4,8,12,16,20h) — syncIncremental BPO: Sincroniza cobranças recentes do Asaas para bpo_charges
 * 07:00 — syncExpenses: Importa transferências e taxas dos últimos 7 dias para expense_records
 */

import cron from "node-cron";
import { getDb } from "./db";
import { listAllAsaasCharges } from "./_core/asaasService";
import { bpoCharges } from "../drizzle/schema";
import { normalizeBpoStatus, autoClassifyCharge } from "./routers/bpoRouter";
import { eq, sql, and } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: auto-classificar despesa por palavras-chave
// ─────────────────────────────────────────────────────────────────────────────
function autoClassifyExpense(desc: string): string {
  const d = desc.toLowerCase();
  if (/sal[aá]rio|folha|pagamento.*func|func.*pagamento|clt|holerite/.test(d)) return "salary";
  if (/pr[oó].?labore|prolabore|pro labore/.test(d)) return "pro_labore";
  if (/aluguel|loca[çc][aã]o|arrendamento/.test(d)) return "rent";
  if (/combust[ií]vel|gasolina|diesel|etanol|abastec/.test(d)) return "fuel_operational";
  if (/reparo|manuten[çc][aã]o|conserto|reforma/.test(d)) return "repair";
  if (/taxa|tarifa|fee|asaas|whatsapp|sms|notifica[çc][aã]o|boleto|pix.*taxa|cobran[çc]a.*taxa/.test(d)) return "operational";
  if (/fornecedor|compra|material|insumo|estoque/.test(d)) return "supplies";
  return "other";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Incremental BPO — atualiza status de cobranças recentes
// ─────────────────────────────────────────────────────────────────────────────
async function runSyncIncrementalBPO(): Promise<void> {
  console.log("[CronJob] syncIncremental BPO — Iniciando...");
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Buscar cobranças dos últimos 30 dias (janela maior para pegar pagamentos atrasados)
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().split("T")[0];

    let offset = 0;
    let hasMore = true;
    let updated = 0;
    let inserted = 0;
    let errors = 0;

    const { listAllAsaasCustomers } = await import("./_core/asaasService");
    const { allowedClients: acTable } = await import("../drizzle/schema");

    // Montar mapa asaasCustomerId → email
    const asaasCustomers = await listAllAsaasCustomers({ limit: 100 });
    const asaasIdToEmail = new Map<string, string>();
    for (const ac of asaasCustomers) {
      if (ac.id && ac.email) asaasIdToEmail.set(ac.id, ac.email.toLowerCase());
    }
    const localClients = await db.select().from(acTable);
    const emailToClient = new Map<string, { id: number; name: string; email: string }>();
    for (const c of localClients) {
      emailToClient.set(c.email.toLowerCase(), { id: c.id, name: c.name, email: c.email });
    }
    const clientMap = new Map<string, { id: number; name: string; email: string }>();
    for (const [asaasId, email] of Array.from(asaasIdToEmail.entries())) {
      const client = emailToClient.get(email);
      if (client) clientMap.set(asaasId, client);
    }

    // Clientes cujas TODAS as cobranças foram canceladas manualmente pelo admin.
    // Novas cobranças desses clientes (novos IDs de assinatura Asaas) são
    // inseridas automaticamente como cancelled+manual para não reaparecer no BPO.
    const fullyRemovedCustomers = new Set<string>();
    try {
      const removedRaw = await db.execute(sql.raw(`
        SELECT asaas_customer_id
        FROM bpo_charges
        WHERE asaas_customer_id IS NOT NULL
        GROUP BY asaas_customer_id
        HAVING
          SUM(CASE WHEN status != 'cancelled' THEN 1 ELSE 0 END) = 0
          AND SUM(CASE WHEN status = 'cancelled' AND classified_by = 'manual' THEN 1 ELSE 0 END) > 0
      `)) as any;
      const removedRows = Array.isArray(removedRaw[0]) ? removedRaw[0] : removedRaw;
      for (const row of (Array.isArray(removedRows) ? removedRows : [])) {
        if (row?.asaas_customer_id) fullyRemovedCustomers.add(row.asaas_customer_id);
      }
      if (fullyRemovedCustomers.size > 0) {
        console.log(`[CronJob syncIncremental] ${fullyRemovedCustomers.size} clientes completamente removidos — novas cobranças serão auto-canceladas`);
      }
    } catch (e) { /* non-critical */ }

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
          const isPaid = ["received", "confirmed", "receivedInCash"].includes(newStatus);

          // Verificar se já existe
          const existing = await db
            .select({ id: bpoCharges.id })
            .from(bpoCharges)
            .where(eq(bpoCharges.asaasChargeId, charge.id))
            .limit(1);

          if (existing.length > 0) {
            // Atualizar status + datas APENAS se não foi classificado/excluído manualmente
            await db
              .update(bpoCharges)
              .set({
                status: newStatus,
                paidDate: (charge as any).paymentDate || null,
                amountPaid: isPaid ? String(charge.value) : "0",
                netValue: (charge as any).netValue != null ? String((charge as any).netValue) : null,
                syncedAt: sql`NOW()`,
                source: "asaas_webhook",
              })
              .where(and(
                eq(bpoCharges.asaasChargeId, charge.id),
                sql`(${bpoCharges.classifiedBy} IS NULL OR ${bpoCharges.classifiedBy} != 'manual')`
              ));
            updated++;
          } else {
            // Inserir nova cobrança com tipo e classificação já definidos
            const clientInfo = clientMap.get(charge.customer);
            const isConsolidated = typeof charge.externalReference === 'string' &&
              charge.externalReference.startsWith('consolidated-');
            const { type: chargeType, classifiedBy: chargeClassifiedBy } = isConsolidated
              ? { type: 'other' as const, classifiedBy: 'manual' as const }
              : autoClassifyCharge(charge.description ?? null, charge.externalReference ?? null);

            // Se o cliente foi completamente removido pelo admin (todas as cobranças
            // anteriores estão cancelled+manual), inserir esta nova cobrança também
            // como cancelled+manual para que não reapareça no BPO.
            const customerFullyRemoved = fullyRemovedCustomers.has(charge.customer);
            const insertStatus = customerFullyRemoved ? 'cancelled' : newStatus;
            const insertClassifiedBy = customerFullyRemoved ? 'manual' : chargeClassifiedBy;

            await db.insert(bpoCharges).values({
              asaasChargeId: charge.id,
              asaasCustomerId: charge.customer,
              clientId: clientInfo?.id ?? null,
              clientName: clientInfo?.name ?? null,
              clientEmail: clientInfo?.email ?? null,
              value: String(charge.value),
              netValue: (charge as any).netValue != null ? String((charge as any).netValue) : null,
              amountPaid: isPaid ? String(charge.value) : "0",
              dueDate: charge.dueDate,
              paidDate: (charge as any).paymentDate || null,
              status: insertStatus,
              type: chargeType,
              classifiedBy: insertClassifiedBy,
              billingType: charge.billingType || null,
              description: charge.description || null,
              externalReference: charge.externalReference || null,
              paymentLink: (charge as any).invoiceUrl || null,
              invoiceUrl: (charge as any).invoiceUrl || null,
              bankSlipUrl: (charge as any).bankSlipUrl || null,
              source: "asaas_import",
              syncedAt: sql`NOW()`,
            });
            inserted++;
          }
        } catch (err) {
          errors++;
        }
      }

      // Rate limiting
      if (hasMore) await new Promise((r) => setTimeout(r, 150));
    }

    console.log(`[CronJob syncIncremental] Concluído: ${updated} atualizadas, ${inserted} inseridas, ${errors} erros`);
  } catch (err) {
    console.error("[CronJob syncIncremental] Erro:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    await notifyOwner({
      title: "Falha no cron syncIncremental BPO",
      content:
        `A sincronização automática de cobranças com o Asaas (roda a cada 4h) falhou. ` +
        `Cobranças recentes podem estar desatualizadas até a próxima execução.\n\nErro: ${errorMessage}`,
    }).catch((notifyErr) => console.error("[CronJob syncIncremental] Falha ao notificar owner:", notifyErr));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Incremental Despesas — importa transferências e taxas dos últimos 7 dias
// ─────────────────────────────────────────────────────────────────────────────
export async function runSyncExpenses(): Promise<void> {
  console.log("[CronJob] syncExpenses — Iniciando importação incremental de despesas...");
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const { resolveAsaasApiKey, resolveAsaasApiUrl } = await import("./_core/asaas");
    const apiKey = await resolveAsaasApiKey();
    if (!apiKey) {
      console.warn("[CronJob syncExpenses] ASAAS_API_KEY não configurada — pulando.");
      return;
    }
    const apiUrl = resolveAsaasApiUrl(apiKey);

    // Janela: últimos 60 dias (ampliada para capturar despesas mais antigas)
    const since = new Date();
    since.setDate(since.getDate() - 60);
    const sinceStr = since.toISOString().split("T")[0];

    let imported = 0;
    let skipped = 0;

    // ── Fonte 1: Transferências (PIX/TED saídos) ──────────────────────────
    {
      let offset = 0;
      const limit = 100;
      while (true) {
        const res = await fetch(
          `${apiUrl}/transfers?startDate=${sinceStr}&limit=${limit}&offset=${offset}`,
          { headers: { access_token: apiKey } }
        );
        if (!res.ok) break;
        const data = await res.json();
        const items: any[] = data.data || [];
        if (items.length === 0) break;

        for (const tx of items) {
          if (tx.status === "CANCELLED" || tx.status === "FAILED") continue;

          // tx.id/tx.description vêm da API Asaas (dado externo, não confiável —
          // SQLi de 2ª ordem se interpolado direto em SQL). Bind params abaixo
          // (sql`` do drizzle) em vez de sql.raw() com template string.
          const txId = `transfer_${tx.id}`;
          const existing = (await db.execute(
            sql`SELECT id FROM expense_records WHERE asaas_payment_id = ${txId} LIMIT 1`
          )) as any;
          const rows = Array.isArray(existing[0]) ? existing[0] : existing;
          if (rows.length > 0) { skipped++; continue; }

          const desc = tx.description || tx.operationType || "Transferência Asaas";
          const costCenter = autoClassifyExpense(desc);
          const dateStr = (tx.dateCreated || tx.scheduledDate || new Date().toISOString()).split("T")[0];
          const value = Math.abs(tx.value || tx.netValue || 0);
          if (value <= 0) continue;

          const bankName: string | null = tx.bankAccount?.bank?.name ?? null;

          await db.execute(sql`
            INSERT INTO expense_records (cost_center, description, recipient_name, value, due_date, paid_date, status, asaas_payment_id, source_type, manually_classified, created_at, updated_at)
            VALUES (
              ${costCenter},
              ${desc},
              ${bankName},
              ${value},
              ${dateStr},
              ${dateStr},
              'paid',
              ${txId},
              'transfer',
              0,
              NOW(),
              NOW()
            )
          `);
          imported++;
        }

        if (items.length < limit) break;
        offset += limit;
      }
    }

    // ── Fonte 2: Taxas Asaas (financialTransactions DEBIT — fees) ──────────
    {
      const FEE_TYPES = new Set([
        "PHONE_CALL_NOTIFICATION_FEE", "INSTANT_TEXT_MESSAGE_FEE", "SMS_FEE",
        "WHATSAPP_FEE", "NOTIFICATION_FEE", "MONTHLY_FEE", "PAYMENT_FEE",
        "TRANSFER_FEE", "ANTICIPATION_FEE", "CREDIT_CARD_FEE", "BANK_SLIP_FEE",
        "PIX_FEE", "SUBSCRIPTION_FEE", "PLATFORM_FEE",
      ]);

      let offset = 0;
      const limit = 100;
      while (true) {
        const res = await fetch(
          `${apiUrl}/financialTransactions?type=DEBIT&startDate=${sinceStr}&limit=${limit}&offset=${offset}`,
          { headers: { access_token: apiKey } }
        );
        if (!res.ok) break;
        const data = await res.json();
        const items: any[] = data.data || [];
        if (items.length === 0) break;

        for (const tx of items) {
          if (!FEE_TYPES.has(tx.type)) continue;

          const txId = `fee_${tx.id}`;
          const existing = (await db.execute(
            sql`SELECT id FROM expense_records WHERE asaas_payment_id = ${txId} LIMIT 1`
          )) as any;
          const rows = Array.isArray(existing[0]) ? existing[0] : existing;
          if (rows.length > 0) { skipped++; continue; }

          const desc = tx.description || `Taxa Asaas: ${tx.type}`;
          const dateStr = (tx.date || new Date().toISOString()).split("T")[0];
          const value = Math.abs(tx.value || 0);
          if (value <= 0) continue;

          await db.execute(sql`
            INSERT INTO expense_records (cost_center, description, recipient_name, value, due_date, paid_date, status, asaas_payment_id, source_type, manually_classified, created_at, updated_at)
            VALUES (
              'operational',
              ${desc},
              'Asaas',
              ${value},
              ${dateStr},
              ${dateStr},
              'paid',
              ${txId},
              'fee',
              0,
              NOW(),
              NOW()
            )
          `);
          imported++;
        }

        if (items.length < limit) break;
        offset += limit;
      }
    }

    // ── Fonte 3: Saques e Antecipações (financialTransactions DEBIT — outros) ──
    {
      const WITHDRAWAL_TYPES = new Set([
        "WITHDRAWAL", "ANTICIPATION_CREDIT_DEDUCTION", "CHARGEBACK_DISPUTE",
        "CHARGEBACK_REVERSAL", "REFUND", "REFUND_REVERSAL",
      ]);

      let offset = 0;
      const limit = 100;
      while (true) {
        const res = await fetch(
          `${apiUrl}/financialTransactions?type=DEBIT&startDate=${sinceStr}&limit=${limit}&offset=${offset}`,
          { headers: { access_token: apiKey } }
        );
        if (!res.ok) break;
        const data = await res.json();
        const items: any[] = data.data || [];
        if (items.length === 0) break;

        for (const tx of items) {
          if (!WITHDRAWAL_TYPES.has(tx.type)) continue;

          const txId = `withdrawal_${tx.id}`;
          const existing = (await db.execute(
            sql`SELECT id FROM expense_records WHERE asaas_payment_id = ${txId} LIMIT 1`
          )) as any;
          const rows = Array.isArray(existing[0]) ? existing[0] : existing;
          if (rows.length > 0) { skipped++; continue; }

          const desc = tx.description || `Saque/Antecipação: ${tx.type}`;
          const dateStr = (tx.date || new Date().toISOString()).split("T")[0];
          const value = Math.abs(tx.value || 0);
          if (value <= 0) continue;

          const costCenter = tx.type === "WITHDRAWAL" ? "withdrawal" : "operational";

          await db.execute(sql`
            INSERT INTO expense_records (cost_center, description, recipient_name, value, due_date, paid_date, status, asaas_payment_id, source_type, manually_classified, created_at, updated_at)
            VALUES (
              ${costCenter},
              ${desc},
              'Asaas',
              ${value},
              ${dateStr},
              ${dateStr},
              'paid',
              ${txId},
              'withdrawal',
              0,
              NOW(),
              NOW()
            )
          `);
          imported++;
        }

        if (items.length < limit) break;
        offset += limit;
      }
    }

    console.log(`[CronJob syncExpenses] Concluído: ${imported} importadas, ${skipped} já existiam`);
  } catch (err) {
    console.error("[CronJob syncExpenses] Erro:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    await notifyOwner({
      title: "Falha no cron syncExpenses",
      content:
        `A importação diária de despesas (transferências, taxas e saques do Asaas, roda às 07:00) falhou. ` +
        `Despesas recentes podem não ter sido importadas para expense_records.\n\nErro: ${errorMessage}`,
    }).catch((notifyErr) => console.error("[CronJob syncExpenses] Falha ao notificar owner:", notifyErr));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro dos cron jobs
// ─────────────────────────────────────────────────────────────────────────────

export function registerCronJobs(): void {
  // ── A cada 4h (0h, 4h, 8h, 12h, 16h, 20h) — Sync Incremental BPO ──────
  cron.schedule("0 0,4,8,12,16,20 * * *", async () => {
    await runSyncIncrementalBPO();
  }, { timezone: "America/Sao_Paulo" });

  // ── 07:00 diário — Sync Incremental Despesas ────────────────────────────
  cron.schedule("0 7 * * *", async () => {
    await runSyncExpenses();
  }, { timezone: "America/Sao_Paulo" });

  console.log("[CronJobs] Registrados: syncIncremental BPO (a cada 4h) + syncExpenses (07:00) — Fuso: America/Sao_Paulo");
}
