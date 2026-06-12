// @ts-nocheck -- drizzle-orm 0.44 timestamp conditional types divergem no CI (ubuntu/Node22)
/**
 * BPO Router — Fonte única de verdade do BPO Financeiro
 *
 * Gerencia a tabela bpo_charges que substitui subscription_charges +
 * unclassified_charges como base dos cards de totais e lista de cobranças.
 */
import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { bpoCharges, allowedClients as acTable, vessels as vesselsTable, clientQuotas } from "../../drizzle/schema";
import { eq, sql, and, gte, lte, inArray, desc } from "drizzle-orm";
import { listAllAsaasCharges, getChargeStatus, listAllAsaasCustomers, createPixCharge, getOrCreateAsaasCustomer, cancelCharge, receiveInCash, getPixQrCode } from "../_core/asaasService";
// ============================================================
// Helper: normalizar status do Asaas para enum bpo_charges
// ============================================================
export function normalizeBpoStatus(
  asaasStatus: string
): "pending" | "received" | "confirmed" | "overdue" | "refunded" | "receivedInCash" | "awaitingChargeback" | "detached" | "partiallyPaid" {
  switch (asaasStatus?.toUpperCase()) {
    case "RECEIVED":
    case "DUNNING_RECEIVED":
      return "received";
    case "CONFIRMED":
      return "confirmed";
    case "RECEIVED_IN_CASH":
      return "receivedInCash";
    case "OVERDUE":
    case "DUNNING_REQUESTED":
      return "overdue";
    case "REFUNDED":
    case "REFUND_REQUESTED":
      return "refunded";
    case "AWAITING_CHARGEBACK_REVERSAL":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
      return "awaitingChargeback";
    case "DETACHED":
      return "detached";
    case "PARTIALLY_PAID":
      return "partiallyPaid";
    case "PENDING":
    case "AWAITING_PAYMENT":
    case "AWAITING_RISK_ANALYSIS":
    default:
      return "pending";
  }
}

// ============================================================
// Helper: determinar se status é "pago"
// ============================================================
function isPaidStatus(status: string): boolean {
  return ["received", "confirmed", "receivedInCash"].includes(status);
}

// ============================================================
// Helper: classificar cobrança por palavras-chave na descrição
// Exportado para uso no cron job e em outras mutations
// ============================================================
export function autoClassifyCharge(
  description: string | null,
  externalRef: string | null
): { type: "monthly" | "quota_sale" | "fuel" | "repair" | "other"; classifiedBy: "auto" | "unclassified" } {
  const text = `${description || ""} ${externalRef || ""}`.toLowerCase();
  if (/mensalidade|cota|quota|parcela|contrato|assinatura|subscription/.test(text))
    return { type: "monthly", classifiedBy: "auto" };
  if (/abastecimento|combustivel|gasolina|litros|fuel|tanque/.test(text))
    return { type: "fuel", classifiedBy: "auto" };
  if (/vistoria|reparo|dano|avaria|reprovacao|conserto|manutencao/.test(text))
    return { type: "repair", classifiedBy: "auto" };
  if (/venda|quota_sale|aquisicao|compra.*cota|cota.*compra/.test(text))
    return { type: "quota_sale", classifiedBy: "auto" };
  return { type: "other", classifiedBy: "unclassified" };
}

// ============================================================
// Standalone helper para splitPayment — fora do router para
// evitar propagação de erros de inferência genérica do tRPC
// ============================================================
async function executeSplitPayment(input: {
  pixValue: number;
  sourceChargeId?: number;
  asaasChargeId?: string;
  paymentDate?: string;
  splits: Array<{ chargeId: number; amount: number }>;
}): Promise<{
  success: boolean;
  results: Array<{ chargeId: number; status: string; message: string }>;
  totalAllocated: number;
  unallocated: number;
  paidCount: number;
  partialCount: number;
  message: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const totalAllocated = input.splits.reduce((sum, s) => sum + s.amount, 0);
  if (totalAllocated > input.pixValue + 0.01) {
    throw new Error(
      `Soma dos valores (R$ ${totalAllocated.toFixed(2)}) excede o PIX (R$ ${input.pixValue.toFixed(2)})`
    );
  }

  const paymentDate: string = input.paymentDate ?? new Date().toISOString().split('T')[0];
  const results: Array<{ chargeId: number; status: string; message: string }> = [];

  for (const split of input.splits) {
    const rows = await db.select().from(bpoCharges)
      .where(eq(bpoCharges.id, split.chargeId)).limit(1);
    if (rows.length === 0) {
      results.push({ chargeId: split.chargeId, status: "error", message: "Cobrança não encontrada" });
      continue;
    }

    const charge = rows[0];
    const chargeValue = parseFloat(String(charge.value));
    const currentAmountPaid = parseFloat(String(charge.amountPaid || '0'));
    const newAmountPaid = currentAmountPaid + split.amount;

    let paymentLinks: string[] = [];
    try { paymentLinks = charge.paymentLinks ? JSON.parse(charge.paymentLinks) : []; } catch { paymentLinks = []; }
    if (input.asaasChargeId && !paymentLinks.includes(input.asaasChargeId)) {
      paymentLinks.push(input.asaasChargeId);
    }

    const isPaid = newAmountPaid >= chargeValue - 0.01;
    const newStatus = isPaid ? "receivedInCash" : "partiallyPaid";
    const remaining = Math.max(0, chargeValue - newAmountPaid);
    const paidDateVal: string | undefined = isPaid ? paymentDate : undefined;

    await db.update(bpoCharges)
      .set({
        status: newStatus,
        amountPaid: newAmountPaid.toFixed(2),
        paymentLinks: JSON.stringify(paymentLinks),
        paidDate: paidDateVal,
      })
      .where(eq(bpoCharges.id, split.chargeId));

    // Sincronizar status de volta para inspection_charges / fuel_records
    if (charge.asaasChargeId) {
      await syncStatusToSources(db, charge.asaasChargeId, newStatus);
    }

    results.push({
      chargeId: split.chargeId,
      status: isPaid ? "paid" : "partial",
      message: isPaid
        ? `Quitada (R$ ${newAmountPaid.toFixed(2)})`
        : `Parcial — Saldo: R$ ${remaining.toFixed(2)}`,
    });
  }

  if (input.sourceChargeId) {
    const sourceRows = await db.select({ description: bpoCharges.description })
      .from(bpoCharges)
      .where(eq(bpoCharges.id, input.sourceChargeId))
      .limit(1);
    const currentDesc = sourceRows[0]?.description || '';
    const newDesc = `${currentDesc} [Distribuído via Split de PIX em ${paymentDate}]`.trim();

    await db.update(bpoCharges)
      .set({
        status: 'cancelled',
        classifiedBy: 'manual',
        description: newDesc,
      })
      .where(eq(bpoCharges.id, input.sourceChargeId));
  }

  return {
    success: true,
    results,
    totalAllocated,
    unallocated: Math.max(0, input.pixValue - totalAllocated),
    paidCount: results.filter(r => r.status === 'paid').length,
    partialCount: results.filter(r => r.status === 'partial').length,
    message: `${results.filter(r => r.status === 'paid').length} cobrança(s) quitada(s), ${results.filter(r => r.status === 'partial').length} parcial(is)`,
  };
}

// ============================================================
// Helper: sincroniza status de pagamento para tabelas de origem
// (inspection_charges e fuel_records) usando o asaas_charge_id.
// Deve ser chamado sempre que bpo_charges.status for atualizado.
// ============================================================
async function syncStatusToSources(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  asaasChargeId: string | null | undefined,
  bpoStatus: string
): Promise<void> {
  if (!asaasChargeId) return;
  const safeId = String(asaasChargeId).replace(/'/g, '');
  const isPaid = ['received', 'confirmed', 'receivedInCash'].includes(bpoStatus);
  const isPartial = bpoStatus === 'partiallyPaid';
  const isCancelled = bpoStatus === 'cancelled';
  const isOverdue = bpoStatus === 'overdue';

  // inspection_charges aceita: 'pending','paid','overdue','partiallyPaid','cancelled'
  const icStatus = isPaid ? 'paid' : isPartial ? 'partiallyPaid' : isCancelled ? 'cancelled' : isOverdue ? 'overdue' : null;
  // fuel_records aceita: 'pending','paid','cancelled','overdue'
  const frStatus = isPaid ? 'paid' : isCancelled ? 'cancelled' : isOverdue ? 'overdue' : null;

  try {
    if (icStatus) {
      await db.execute(sql.raw(`UPDATE inspection_charges SET payment_status = '${icStatus}' WHERE asaas_charge_id = '${safeId}'`));
    }
  } catch (e: any) { console.warn('[syncStatusToSources] inspection_charges:', e?.message); }

  try {
    if (frStatus) {
      await db.execute(sql.raw(`UPDATE fuel_records SET payment_status = '${frStatus}' WHERE asaas_charge_id = '${safeId}'`));
    }
  } catch (e: any) { console.warn('[syncStatusToSources] fuel_records:', e?.message); }
}

export { syncStatusToSources };

export const bpoRouter = router({

  // ============================================================
  // IMPORTAÇÃO HISTÓRICA DO ASAAS → bpo_charges
  // Deve ser executado uma única vez (ou para re-sync completo).
  // Upsert: insere se não existe, atualiza status se já existe.
  // ============================================================
  importFromAsaas: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const report = { total: 0, inserted: 0, updated: 0, errors: 0 };
    // Montar mapa asaasCustomerId → cliente local
    // Passo 1: buscar todos os clientes do Asaas para obter email por ID
    const asaasCustomers = await listAllAsaasCustomers({ limit: 100 });
    const asaasIdToEmail = new Map<string, string>();
    for (const ac of asaasCustomers) {
      if (ac.id && ac.email) asaasIdToEmail.set(ac.id, ac.email.toLowerCase());
    }
    // Passo 2: cruzar email com allowedClients locais
    const localClients = await db.select().from(acTable);
    const emailToClient = new Map<string, { id: number; name: string; email: string }>();
    for (const c of localClients) {
      emailToClient.set(c.email.toLowerCase(), { id: c.id, name: c.name, email: c.email });
    }
    // Passo 3: mapa final asaasCustomerId → cliente local
    const clientMap = new Map<string, { id: number; name: string; email: string }>();
    for (const [asaasId, email] of Array.from(asaasIdToEmail.entries())) {
      const client = emailToClient.get(email);
      if (client) clientMap.set(asaasId, client);
    }
    // Paginar todas as cobranças do Asaas
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const { charges, hasMore: more } = await listAllAsaasCharges({ limit, offset });
      hasMore = more;
      offset += limit;

      for (const charge of charges) {
        try {
          const clientInfo = clientMap.get(charge.customer);
          const normalizedStatus = normalizeBpoStatus(charge.status);
          const paid = isPaidStatus(normalizedStatus);

          // Verificar se já existe pelo asaas_charge_id
          const existing = await db
            .select({ id: bpoCharges.id })
            .from(bpoCharges)
            .where(eq(bpoCharges.asaasChargeId, charge.id))
            .limit(1);

          // Cobranças consolidadas não devem aparecer como "Não Classificadas"
          const isConsolidated = typeof charge.externalReference === 'string' &&
            charge.externalReference.startsWith('consolidated-');
          const { type: chargeType, classifiedBy: chargeClassifiedBy } = isConsolidated
            ? { type: 'other' as const, classifiedBy: 'manual' as const }
            : autoClassifyCharge(charge.description ?? null, charge.externalReference ?? null);

          if (existing.length > 0) {
            // Atualizar status + classificação (preserva type se já classificado manualmente)
            const updateSet: Record<string, any> = {
              status: normalizedStatus,
              paidDate: charge.paymentDate || null,
              amountPaid: paid ? String(charge.value) : "0",
              netValue: charge.netValue != null ? String(charge.netValue) : null,
              syncedAt: sql`NOW()`,
              source: "asaas_import",
            };
            if (isConsolidated) updateSet.classifiedBy = 'manual';
            await db
              .update(bpoCharges)
              .set(updateSet)
              .where(eq(bpoCharges.asaasChargeId, charge.id));
            report.updated++;
          } else {
            // Inserir novo registro com tipo e classificação já definidos
            await db.insert(bpoCharges).values({
              asaasChargeId: charge.id,
              asaasCustomerId: charge.customer,
              clientId: clientInfo?.id ?? null,
              clientName: clientInfo?.name ?? null,
              clientEmail: clientInfo?.email ?? null,
              value: String(charge.value),
              netValue: charge.netValue != null ? String(charge.netValue) : null,
              amountPaid: paid ? String(charge.value) : "0",
              dueDate: charge.dueDate,
              paidDate: charge.paymentDate || null,
              status: normalizedStatus,
              type: chargeType,
              billingType: charge.billingType || null,
              description: charge.description || null,
              externalReference: charge.externalReference || null,
              paymentLink: charge.invoiceUrl || null,
              invoiceUrl: charge.invoiceUrl || null,
              bankSlipUrl: charge.bankSlipUrl || null,
              classifiedBy: chargeClassifiedBy,
              source: "asaas_import",
              syncedAt: sql`NOW()`,
            });
            report.inserted++;
          }
          report.total++;
        } catch (err: any) {
          console.error("[bpo.importFromAsaas] Erro:", charge.id, err.message);
          report.errors++;
        }
      }

      // Rate limiting: 200ms entre páginas
      if (hasMore) await new Promise((r) => setTimeout(r, 200));
    }

    console.log("[bpo.importFromAsaas] Concluído:", report);
    return report;
  }),

  // ============================================================
  // CARDS DE TOTAIS — lê de bpo_charges
  // ============================================================
  getStats: adminProcedure
    .input(
      z
        .object({
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          year: z.string().optional(),
          month: z.string().optional(),
          type: z.string().optional(),
          status: z.string().optional(),
          search: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Construir condições de filtro — idêntico ao listCharges
      const conditions: string[] = [];

      const yearFilter = input?.year || "";
      const monthFilter = input?.month || "";
      const dateFromFilter = input?.dateFrom || "";
      const dateToFilter = input?.dateTo || "";
      const typeVal = input?.type || "all";
      const statusVal = input?.status || "all";
      const searchVal = (input?.search || "").replace(/'/g, "''");

      // Filtro de data
      if (dateFromFilter && dateToFilter) {
        conditions.push(`due_date BETWEEN '${dateFromFilter}' AND '${dateToFilter}'`);
      } else if (monthFilter && monthFilter !== "all") {
        const m = monthFilter.padStart(2, "0");
        if (yearFilter) {
          conditions.push(`due_date LIKE '${yearFilter}-${m}-%'`);
        } else {
          // Todos os anos: filtrar a partir de 2025-01-01 no mês específico
          conditions.push(`(due_date >= '2025-01-01' AND MONTH(due_date) = ${parseInt(m)})`);
        }
      } else if (yearFilter) {
        conditions.push(`due_date LIKE '${yearFilter}-%'`);
      } else {
        // Todos os anos: tudo a partir de 01/01/2025
        conditions.push(`due_date >= '2025-01-01'`);
      }

      // Filtro de tipo
      if (typeVal !== "all" && typeVal) {
        conditions.push(`type = '${typeVal}'`);
      }

      // Filtro de busca
      if (searchVal) {
        conditions.push(
          `(client_name LIKE '%${searchVal}%' OR client_email LIKE '%${searchVal}%' OR description LIKE '%${searchVal}%')`
        );
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // Os cards mostram TODOS os status do conjunto filtrado
      // (não filtramos por status nos cards — o filtro de status é só para a lista)
      const [rows] = (await db.execute(sql.raw(`
        SELECT
          COALESCE(SUM(value), 0) as totalExpected,
          COALESCE(SUM(CASE WHEN status IN ('received','confirmed','receivedInCash') THEN value ELSE 0 END), 0) as totalPaid,
          COUNT(CASE WHEN status IN ('received','confirmed','receivedInCash') THEN 1 END) as paidCount,
          COALESCE(SUM(CASE WHEN status = 'pending' AND due_date >= CURDATE() THEN value ELSE 0 END), 0) as totalPending,
          COUNT(CASE WHEN status = 'pending' AND due_date >= CURDATE() THEN 1 END) as pendingCount,
          COALESCE(SUM(CASE WHEN status = 'overdue' OR (status = 'pending' AND due_date < CURDATE()) THEN value ELSE 0 END), 0) as totalOverdue,
          COUNT(CASE WHEN status = 'overdue' OR (status = 'pending' AND due_date < CURDATE()) THEN 1 END) as overdueCount,
          COUNT(*) as totalCount
        FROM bpo_charges
        ${whereClause}
      `))) as any;

      const s = Array.isArray(rows) ? rows[0] : rows;
      return {
        totalExpected: parseFloat(s?.totalExpected ?? "0"),
        totalPaid: parseFloat(s?.totalPaid ?? "0"),
        paidCount: parseInt(s?.paidCount ?? "0"),
        totalPending: parseFloat(s?.totalPending ?? "0"),
        pendingCount: parseInt(s?.pendingCount ?? "0"),
        totalOverdue: parseFloat(s?.totalOverdue ?? "0"),
        overdueCount: parseInt(s?.overdueCount ?? "0"),
        totalCount: parseInt(s?.totalCount ?? "0"),
      };
    }),

  // ============================================================
  // LISTA DE COBRANÇAS — lê de bpo_charges com filtros
  // ============================================================
  listCharges: adminProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          type: z.string().optional(),
          clientId: z.number().optional(),
          month: z.string().optional(),
          year: z.string().optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          search: z.string().optional(),
          vesselName: z.string().optional(),
          limit: z.number().optional().default(50),
          offset: z.number().optional().default(0),
          excludeConsolidation: z.boolean().optional().default(false),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const statusFilter = input?.status ?? "all";
      const typeFilter = input?.type ?? "all";
      const monthFilter = input?.month;
      const yearFilter = input?.year; // undefined = todos os anos
      const dateFromFilter = input?.dateFrom;
      const dateToFilter = input?.dateTo;
      const searchFilter = (input?.search ?? "").replace(/'/g, "''");
      const limitVal = input?.limit ?? 50;
      const offsetVal = input?.offset ?? 0;

      const conditions: string[] = [];

      // Filtro de data
      if (dateFromFilter && dateToFilter) {
        conditions.push(`due_date BETWEEN '${dateFromFilter}' AND '${dateToFilter}'`);
      } else if (monthFilter && monthFilter !== "all") {
        const m = monthFilter.padStart(2, "0");
        if (yearFilter) {
          conditions.push(`due_date LIKE '${yearFilter}-${m}-%'`);
        } else {
          // Todos os anos: filtrar a partir de 2025-01-01 no mês específico
          conditions.push(`(due_date >= '2025-01-01' AND MONTH(due_date) = ${parseInt(m)})`);
        }
      } else if (yearFilter) {
        conditions.push(`due_date LIKE '${yearFilter}-%'`);
      } else {
        // Todos os anos: tudo a partir de 01/01/2025
        conditions.push(`due_date >= '2025-01-01'`);
      }

      // Filtro de status
      if (statusFilter !== "all") {
        if (statusFilter === "overdue") {
          conditions.push(`(status = 'overdue' OR (status = 'pending' AND due_date < CURDATE()))`);
        } else if (statusFilter === "paid") {
          conditions.push(`status IN ('received','confirmed','receivedInCash')`);
        } else if (statusFilter === "pending") {
          conditions.push(`(status = 'pending' AND due_date >= CURDATE())`);
        } else {
          conditions.push(`status = '${statusFilter}'`);
        }
      }

      // Filtro de tipo
      if (typeFilter !== "all") {
        conditions.push(`type = '${typeFilter}'`);
      }

      // Filtro de cliente
      if (input?.clientId) {
        conditions.push(`client_id = ${input.clientId}`);
      }

      // Filtro de busca
      if (searchFilter) {
        conditions.push(
          `(client_name LIKE '%${searchFilter}%' OR client_email LIKE '%${searchFilter}%' OR description LIKE '%${searchFilter}%')`
        );
      }

      // Excluir cobranças de consolidação (tentativas PIX agrupadas não pagas)
      // Essas cobranças têm external_reference iniciando com 'consolidated-'
      if (input?.excludeConsolidation) {
        conditions.push(`(external_reference IS NULL OR external_reference NOT LIKE 'consolidated-%')`);
      }

      // Filtro por embarcação — via client_quotas (clientes com cota ativa na embarcação)
      if (input?.vesselName) {
        // Buscar o vessel_id pelo nome
        const [vesselRows] = (await db.execute(sql.raw(
          `SELECT id FROM vessels WHERE name = '${input.vesselName.replace(/'/g, "''")}' LIMIT 1`
        ))) as any;
        const vesselRow = Array.isArray(vesselRows) ? vesselRows[0] : null;
        if (vesselRow?.id) {
          // Buscar client_ids com cota ativa nessa embarcação, ordenados por quota_number
          // NOTA: não usar ORDER BY com SELECT DISTINCT em colunas fora do SELECT (MySQL/TiDB error)
          const [quotaRows] = (await db.execute(sql.raw(
            `SELECT cq.client_id, ac.email, MIN(cq.quota_number) as quota_number
             FROM client_quotas cq
             JOIN allowed_clients ac ON ac.id = cq.client_id
             WHERE cq.vessel_id = ${vesselRow.id} AND cq.is_active = 1
             GROUP BY cq.client_id, ac.email
             ORDER BY quota_number ASC`
          ))) as any;
          const quotaEmails: string[] = Array.isArray(quotaRows)
            ? quotaRows.map((r: any) => `'${r.email.replace(/'/g, "''")}'`)
            : [];
          if (quotaEmails.length > 0) {
            conditions.push(`client_email IN (${quotaEmails.join(",")})`);
          } else {
            // Nenhum cotista nessa embarcação — retornar vazio
            conditions.push(`1 = 0`);
          }
        } else {
          conditions.push(`1 = 0`);
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // Ordenar por quota_number quando filtro por embarcação estiver ativo
      let orderBy = "ORDER BY due_date DESC";
      if (input?.vesselName) {
        orderBy = `ORDER BY (
          SELECT cq.quota_number FROM client_quotas cq
          JOIN allowed_clients ac ON ac.id = cq.client_id
          JOIN vessels v ON v.id = cq.vessel_id
          WHERE ac.email = bpo_charges.client_email
            AND v.name = '${(input.vesselName ?? "").replace(/'/g, "''")}'
            AND cq.is_active = 1
          LIMIT 1
        ) ASC, due_date DESC`;
      }

      const [rows] = (await db.execute(sql.raw(`
        SELECT * FROM bpo_charges
        ${whereClause}
        ${orderBy}
        LIMIT ${limitVal} OFFSET ${offsetVal}
      `))) as any;

      const [countRows] = (await db.execute(sql.raw(`
        SELECT COUNT(*) as total FROM bpo_charges ${whereClause}
      `))) as any;

      const items = Array.isArray(rows) ? rows : [];
      const total = parseInt(
        (Array.isArray(countRows) ? countRows[0] : countRows)?.total ?? "0"
      );

      return { items, total };
    }),

  // ============================================================
  // SINCRONIZAÇÃO INCREMENTAL — atualiza cobranças pendentes/vencidas
  // ============================================================
  syncIncremental: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const report = { checked: 0, updated: 0, errors: 0 };

    // Buscar cobranças pendentes/vencidas com asaas_charge_id dos últimos 90 dias
    const [pendingRows] = (await db.execute(sql.raw(`
      SELECT asaas_charge_id FROM bpo_charges
      WHERE status IN ('pending','overdue')
        AND asaas_charge_id IS NOT NULL
        AND due_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
      LIMIT 200
    `))) as any;

    const pending = Array.isArray(pendingRows) ? pendingRows : [];

    for (const row of pending) {
      try {
        // Usa getChargeStatus que lê a API key do banco (descriptografada)
        const charge = await getChargeStatus(row.asaas_charge_id);
        if (!charge) {
          report.errors++;
          continue;
        }
        const newStatus = normalizeBpoStatus(charge.status);
        const paid = isPaidStatus(newStatus);

        await db
          .update(bpoCharges)
          .set({
            status: newStatus,
            paidDate: charge.paymentDate || null,
            amountPaid: paid ? String(charge.value) : "0",
            syncedAt: sql`NOW()`,
            source: "asaas_webhook",
          })
          .where(eq(bpoCharges.asaasChargeId, row.asaas_charge_id));

        report.updated++;
        report.checked++;

        // Rate limiting: 100ms entre requisições
        await new Promise((r) => setTimeout(r, 100));
      } catch (err: any) {
        console.error("[bpo.syncIncremental] Erro:", row.asaas_charge_id, err.message);
        report.errors++;
      }
    }

    return report;
  }),

  // ============================================================
  // ATUALIZAR STATUS VIA WEBHOOK — chamado pelo handler de webhook
  // ============================================================
  updateFromWebhook: adminProcedure
    .input(
      z.object({
        asaasChargeId: z.string(),
        status: z.string(),
        paymentDate: z.string().optional(),
        value: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };

      const newStatus = normalizeBpoStatus(input.status);
      const paid = isPaidStatus(newStatus);

      await db
        .update(bpoCharges)
        .set({
          status: newStatus,
          paidDate: input.paymentDate || null,
          amountPaid: paid && input.value ? String(input.value) : "0",
          syncedAt: sql`NOW()`,
          source: "asaas_webhook",
        })
        .where(eq(bpoCharges.asaasChargeId, input.asaasChargeId));

      return { success: true };
    }),

  // ============================================================
  // requestDueDateChange — solicitar mudança de vencimento de bpo_charge
  // ============================================================
  requestDueDateChange: protectedProcedure
    .input(z.object({
      chargeId: z.number(),
      newDueDate: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const userEmail = ctx.user.email;
      if (!userEmail) throw new Error('Usuário não autenticado');

      // Verificar se a cobrança pertence ao cliente
      const rows = await db
        .select()
        .from(bpoCharges)
        .where(and(eq(bpoCharges.id, input.chargeId), eq(bpoCharges.clientEmail, userEmail)))
        .limit(1);

      if (rows.length === 0) throw new Error('Cobrança não encontrada');

      // Registrar a solicitação na tabela due_date_change_requests
      const { dueDateChangeRequests } = await import('../../drizzle/schema');
      await db.insert(dueDateChangeRequests).values({
        chargeId: input.chargeId,
        clientEmail: userEmail,
        oldDueDate: rows[0].dueDate,
        newDueDate: input.newDueDate,
        reason: input.reason ?? '',
        status: 'pending',
      });

      return { success: true };
    }),

  // ============================================================
  // getMyCharges — cobranças do cliente logado (mensalidades + cotas)
  // ============================================================
  getMyCharges: protectedProcedure
    .input(z.object({
      types: z.array(z.enum(["monthly", "quota_sale", "fuel", "repair", "inspection", "other"])).optional(),
      status: z.array(z.enum(["pending", "received", "confirmed", "overdue", "refunded", "receivedInCash", "awaitingChargeback", "detached", "partiallyPaid"])).optional(),
      year: z.number().optional(),
      month: z.number().min(1).max(12).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { charges: [] };

      const userEmail = ctx.user.email;
      if (!userEmail) return { charges: [] };

      // Usar sql raw para comparação case-insensitive de email
      const emailLower = userEmail.toLowerCase();
      const conditions: any[] = [
        sql`LOWER(${bpoCharges.clientEmail}) = ${emailLower}`,
      ];

      if (input.types && input.types.length > 0) {
        conditions.push(inArray(bpoCharges.type, input.types));
      }

      if (input.status && input.status.length > 0) {
        conditions.push(inArray(bpoCharges.status, input.status));
      }

      if (input.year) {
        const yearStr = String(input.year);
        if (input.month) {
          const monthStr = String(input.month).padStart(2, "0");
          const from = `${yearStr}-${monthStr}-01`;
          const lastDay = new Date(input.year, input.month, 0).getDate();
          const to = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
          conditions.push(gte(bpoCharges.dueDate, from));
          conditions.push(lte(bpoCharges.dueDate, to));
        } else {
          conditions.push(gte(bpoCharges.dueDate, `${yearStr}-01-01`));
          conditions.push(lte(bpoCharges.dueDate, `${yearStr}-12-31`));
        }
      } else {
        // Sem filtro de ano: mostrar tudo a partir de 2025-01-01
        conditions.push(gte(bpoCharges.dueDate, "2025-01-01"));
        if (input.month) {
          conditions.push(sql`MONTH(${bpoCharges.dueDate}) = ${input.month}`);
        }
      }

      // Buscar cobranças com receiptUrl real via JOIN com fuel_records e inspection_charges
      const rows = await db
        .select()
        .from(bpoCharges)
        .where(and(...conditions))
        .orderBy(desc(bpoCharges.dueDate));

      if (rows.length === 0) return { charges: [] };

      // Enriquecer com receiptUrl real das tabelas de origem
      const { fuelRecords: frTable, inspectionCharges: icTable } = await import('../../drizzle/schema');
      const { inArray: inArr } = await import('drizzle-orm');
      const asaasIds = rows
        .map(r => r.asaasChargeId)
        .filter((id): id is string => !!id);

      // Mapear asaas_charge_id → receipt_url de fuel_records e inspection_charges
      const receiptMap = new Map<string, string>();
      if (asaasIds.length > 0) {
        const fuelReceipts = await db
          .select({ asaasChargeId: frTable.asaasChargeId, receiptUrl: frTable.receiptUrl })
          .from(frTable)
          .where(inArr(frTable.asaasChargeId, asaasIds));
        for (const r of fuelReceipts) {
          if (r.asaasChargeId && r.receiptUrl) receiptMap.set(r.asaasChargeId, r.receiptUrl);
        }

        const inspReceipts = await db
          .select({ asaasChargeId: icTable.asaasChargeId, receiptUrl: icTable.receiptUrl })
          .from(icTable)
          .where(inArr(icTable.asaasChargeId, asaasIds));
        for (const r of inspReceipts) {
          if (r.asaasChargeId && r.receiptUrl) receiptMap.set(r.asaasChargeId, r.receiptUrl);
        }
      }

      // Mesclar receiptUrl real nas cobranças
      const enrichedRows = rows.map(r => ({
        ...r,
        receiptUrl: (r.asaasChargeId && receiptMap.get(r.asaasChargeId)) || r.receiptUrl || null,
      }));

      return { charges: enrichedRows };
    }),

  // ============================================================
  // RESET + REIMPORTAÇÃO COMPLETA DO ASAAS → bpo_charges
  // Zera a tabela e reimporta todas as cobranças de 01/01/2025
  // com classificação automática por palavras-chave.
  // ============================================================
  resetAndReimport: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const report = { total: 0, inserted: 0, classified: 0, unclassified: 0, errors: 0 };

    // 1. Zerar a tabela bpo_charges
    await db.delete(bpoCharges);
    console.log("[bpo.resetAndReimport] Tabela bpo_charges zerada");

      // 2. Montar mapa asaasCustomerId → cliente local via email (allowedClients)
    // O Asaas retorna charge.customerEmail que podemos cruzar com allowedClients.email
    const { fuelRecords: frTable } = await import("../../drizzle/schema");
    const clients = await db.select().from(acTable);
    // emailMap: email → { id, name, email }
    const emailMap = new Map<string, { id: number; name: string; email: string }>();
    for (const c of clients) {
      emailMap.set(c.email.toLowerCase(), { id: c.id, name: c.name, email: c.email });
    }
    // asaasCustomerId → email via fuelRecords (já vinculados)
    const fuelLinks = await db.select({
      clientEmail: frTable.clientEmail,
      asaasCustomerId: frTable.asaasCustomerId,
    }).from(frTable).where(sql`${frTable.asaasCustomerId} IS NOT NULL`);
    const clientMap = new Map<string, { id: number; name: string; email: string }>();
    for (const fr of fuelLinks) {
      if (fr.clientEmail && fr.asaasCustomerId && !clientMap.has(fr.asaasCustomerId)) {
        const client = emailMap.get(fr.clientEmail.toLowerCase());
        if (client) clientMap.set(fr.asaasCustomerId, client);
      }
    }

    // 3. Classificação automática por palavras-chave (usa helper exportado)

    // 4. Paginar todas as cobranças do Asaas a partir de 01/01/2025
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const { charges, hasMore: more } = await listAllAsaasCharges({
        limit,
        offset,
        dueDateGte: "2025-01-01",
      });
      hasMore = more;
      offset += limit;

      for (const charge of charges) {
        try {
          const clientInfo = clientMap.get(charge.customer);
          const normalizedStatus = normalizeBpoStatus(charge.status);
          const paid = isPaidStatus(normalizedStatus);
          const { type, classifiedBy } = autoClassifyCharge(charge.description ?? null, charge.externalReference ?? null);

          await db.insert(bpoCharges).values({
            asaasChargeId: charge.id,
            asaasCustomerId: charge.customer,
            clientId: clientInfo?.id ?? null,
            clientName: clientInfo?.name ?? null,
            clientEmail: clientInfo?.email ?? null,
            value: String(charge.value),
            netValue: charge.netValue != null ? String(charge.netValue) : null,
            amountPaid: paid ? String(charge.value) : "0",
            dueDate: charge.dueDate,
            paidDate: charge.paymentDate || null,
            status: normalizedStatus,
            type,
            classifiedBy,
            billingType: charge.billingType || null,
            description: charge.description || null,
            externalReference: charge.externalReference || null,
            paymentLink: charge.invoiceUrl || null,
            invoiceUrl: charge.invoiceUrl || null,
            bankSlipUrl: charge.bankSlipUrl || null,
            source: "asaas_import",
            syncedAt: sql`NOW()`,
          });

          report.inserted++;
          if (classifiedBy === "auto") report.classified++;
          else report.unclassified++;
          report.total++;
        } catch (err: any) {
          console.error("[bpo.resetAndReimport] Erro:", charge.id, err.message);
          report.errors++;
        }
      }

      if (hasMore) await new Promise((r) => setTimeout(r, 200));
    }

    console.log("[bpo.resetAndReimport] Concluído:", report);
    return report;
  }),

  // ============================================================
  // CLASSIFICAÇÃO MANUAL — admin reclassifica cobranças 'other'
  // Quando a cobrança já está paga (PIX recebido), dá baixa automática
  // na cobrança pendente correspondente do mesmo cliente
  // ============================================================
  manualClassify: adminProcedure
    .input(z.object({
      chargeId: z.number(),
      type: z.enum(["monthly", "quota_sale", "fuel", "repair", "other"]),
      clientEmail: z.string().email().optional(),
      targetChargeId: z.number().optional(), // ID da cobrança pendente a quitar (quando há múltiplas opções)
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Buscar a cobrança sendo classificada
      const sourceRows = await db.select().from(bpoCharges)
        .where(eq(bpoCharges.id, input.chargeId)).limit(1);
      if (sourceRows.length === 0) throw new Error("Cobrança não encontrada");
      const sourceCharge = sourceRows[0];

      // 2. Verificar se a cobrança já está paga (PIX recebido)
      const isAlreadyPaid = isPaidStatus(sourceCharge.status ?? '');
      const pixValue = parseFloat(String(sourceCharge.value ?? '0'));

      // 3. Se NÃO está paga ou tipo é 'other', apenas classificar (comportamento antigo)
      if (!isAlreadyPaid || input.type === 'other') {
        const updateData: Record<string, any> = {
          type: input.type,
          classifiedBy: "manual",
        };
        if (input.clientEmail) {
          updateData.clientEmail = input.clientEmail;
          const clientResult = await db.select().from(acTable)
            .where(eq(acTable.email, input.clientEmail)).limit(1);
          if (clientResult.length > 0) {
            updateData.clientId = clientResult[0].id;
            updateData.clientName = clientResult[0].name;
          }
        }
        await db.update(bpoCharges)
          .set(updateData)
          .where(eq(bpoCharges.id, input.chargeId));
        return { success: true, action: 'classified_only' };
      }

      // 4. PIX já recebido + tipo específico → buscar cobranças pendentes do mesmo cliente
      const clientId = sourceCharge.clientId;
      if (!clientId) {
        // Sem cliente vinculado, apenas classificar
        await db.update(bpoCharges)
          .set({ type: input.type, classifiedBy: "manual" })
          .where(eq(bpoCharges.id, input.chargeId));
        return { success: true, action: 'classified_only', reason: 'no_client_linked' };
      }

      // 5. Buscar cobranças pendentes do mesmo cliente com o mesmo tipo
      const [pendingRows] = (await db.execute(sql.raw(`
        SELECT id, value, amount_paid as amountPaid, due_date as dueDate, description, status
        FROM bpo_charges
        WHERE client_id = ${clientId}
          AND type = '${input.type}'
          AND status IN ('pending', 'overdue', 'partiallyPaid')
          AND id != ${input.chargeId}
        ORDER BY due_date ASC
        LIMIT 20
      `))) as any;

      const pendingCharges: Array<{ id: number; value: string; amountPaid: string; dueDate: string; description: string; status: string }> =
        Array.isArray(pendingRows) ? pendingRows : [];

      // 6. Se não há cobranças pendentes, apenas classificar
      if (pendingCharges.length === 0) {
        await db.update(bpoCharges)
          .set({ type: input.type, classifiedBy: "manual" })
          .where(eq(bpoCharges.id, input.chargeId));
        return { success: true, action: 'classified_only', reason: 'no_pending_charges' };
      }

      // 7. Se o admin especificou qual cobrança quitar, usar essa
      let targetCharge = input.targetChargeId
        ? pendingCharges.find(c => c.id === input.targetChargeId)
        : null;

      // 8. Se não especificou, buscar match por valor (tolerância de 5%)
      if (!targetCharge) {
        const tolerance = 0.05; // 5%
        targetCharge = pendingCharges.find(c => {
          const chargeValue = parseFloat(String(c.value));
          const currentPaid = parseFloat(String(c.amountPaid || '0'));
          const remaining = chargeValue - currentPaid;
          return Math.abs(remaining - pixValue) / remaining <= tolerance;
        });
      }

      // 9. Se ainda não encontrou match, pegar a mais antiga com valor menor ou igual ao PIX
      if (!targetCharge) {
        targetCharge = pendingCharges.find(c => {
          const chargeValue = parseFloat(String(c.value));
          const currentPaid = parseFloat(String(c.amountPaid || '0'));
          const remaining = chargeValue - currentPaid;
          return remaining <= pixValue + 0.01;
        });
      }

      // 10. Se não encontrou nenhuma cobrança compatível, retornar lista para o admin escolher
      if (!targetCharge) {
        // Apenas classificar e retornar aviso
        await db.update(bpoCharges)
          .set({ type: input.type, classifiedBy: "manual" })
          .where(eq(bpoCharges.id, input.chargeId));
        return {
          success: true,
          action: 'classified_only',
          reason: 'no_value_match',
          pendingCharges: pendingCharges.map(c => ({
            id: c.id,
            value: c.value,
            dueDate: c.dueDate,
            description: c.description,
          })),
          message: `Classificado como ${input.type}, mas nenhuma cobrança pendente com valor compatível foi encontrada. Use o Split para distribuir manualmente.`,
        };
      }

      // 11. DAR BAIXA na cobrança pendente encontrada
      const targetValue = parseFloat(String(targetCharge.value));
      const targetCurrentPaid = parseFloat(String(targetCharge.amountPaid || '0'));
      const amountToApply = Math.min(pixValue, targetValue - targetCurrentPaid);
      const newAmountPaid = targetCurrentPaid + amountToApply;
      const isFullyPaid = newAmountPaid >= targetValue - 0.01;
      const paymentDate = sourceCharge.paidDate || new Date().toISOString().split('T')[0];

      await db.update(bpoCharges)
        .set({
          status: isFullyPaid ? 'receivedInCash' : 'partiallyPaid',
          amountPaid: newAmountPaid.toFixed(2),
          paidDate: isFullyPaid ? paymentDate : null,
        })
        .where(eq(bpoCharges.id, targetCharge.id));

      // 12. CANCELAR a cobrança do PIX (origem) — já foi distribuída
      const currentDesc = sourceCharge.description || '';
      const newDesc = `${currentDesc} [Baixa automática: quitou cobrança #${targetCharge.id} em ${paymentDate}]`.trim();

      await db.update(bpoCharges)
        .set({
          status: 'cancelled',
          type: input.type,
          classifiedBy: 'manual',
          description: newDesc,
        })
        .where(eq(bpoCharges.id, input.chargeId));

      return {
        success: true,
        action: 'auto_settled',
        settledChargeId: targetCharge.id,
        settledValue: amountToApply,
        isFullyPaid,
        message: isFullyPaid
          ? `Cobrança #${targetCharge.id} quitada automaticamente (R$ ${amountToApply.toFixed(2)}). PIX cancelado.`
          : `Pagamento parcial de R$ ${amountToApply.toFixed(2)} aplicado na cobrança #${targetCharge.id}. PIX cancelado.`,
      };
    }),

  // ============================================================
  // DRE CONSOLIDADO — Receitas vs Despesas por período
  // ============================================================
  getDRE: adminProcedure
    .input(z.object({
      year: z.string().optional(),
      month: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const yearVal = input?.year || String(new Date().getFullYear());
      const monthVal = input?.month || "all";
      let dateFilter = `due_date LIKE '${yearVal}-%'`;
      if (monthVal && monthVal !== "all") {
        const m = monthVal.padStart(2, "0");
        dateFilter = `due_date LIKE '${yearVal}-${m}-%'`;
      }
      const [bpoRows] = (await db.execute(sql.raw(`
        SELECT
          COALESCE(type, 'other') as type,
          COALESCE(SUM(CASE WHEN status IN ('received','confirmed','receivedInCash') THEN CAST(amount_paid AS DECIMAL(10,2)) ELSE 0 END), 0) as received,
          COALESCE(SUM(CAST(value AS DECIMAL(10,2))), 0) as expected,
          COUNT(*) as count
        FROM bpo_charges
        WHERE ${dateFilter}
        GROUP BY COALESCE(type, 'other')
      `))) as any;
      const bpoByType = Array.isArray(bpoRows) ? bpoRows : [];
      const totalRevenue = bpoByType.reduce((sum: number, r: any) => sum + parseFloat(r.received ?? "0"), 0);
      const totalExpected = bpoByType.reduce((sum: number, r: any) => sum + parseFloat(r.expected ?? "0"), 0);
      let expenseDateFilter = `YEAR(due_date) = ${parseInt(yearVal)}`;
      if (monthVal && monthVal !== "all") {
        expenseDateFilter += ` AND MONTH(due_date) = ${parseInt(monthVal)}`;
      }
      const [expRows] = (await db.execute(sql.raw(`
        SELECT
          cost_center,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN CAST(value AS DECIMAL(10,2)) ELSE 0 END), 0) as paid,
          COALESCE(SUM(CAST(value AS DECIMAL(10,2))), 0) as total,
          COUNT(*) as count
        FROM expense_records
        WHERE ${expenseDateFilter}
        GROUP BY cost_center
      `))) as any;
      const expByCenter = Array.isArray(expRows) ? expRows : [];
      const totalExpenses = expByCenter.reduce((sum: number, r: any) => sum + parseFloat(r.paid ?? "0"), 0);
      const totalExpensesAll = expByCenter.reduce((sum: number, r: any) => sum + parseFloat(r.total ?? "0"), 0);
      const netResult = totalRevenue - totalExpenses;
      const TYPE_LABELS: Record<string, string> = {
        monthly: "Mensalidades", quota_sale: "Vendas de Cotas",
        fuel: "Abastecimentos", repair: "Reparos", inspection: "Vistorias", other: "Outros",
      };
      const COST_CENTER_LABELS: Record<string, string> = {
        salary: "Salários", rent: "Aluguéis", pro_labore: "Pró-labore",
        fuel_operational: "Abastecimentos (Op.)", repair: "Reparos",
        operational: "Custo Operacional", withdrawal: "Saque / Retirada", other: "Outros",
      };
      return {
        year: yearVal, month: monthVal,
        revenue: {
          total: totalRevenue, expected: totalExpected,
          byType: bpoByType.map((r: any) => ({
            type: r.type as string,
            label: TYPE_LABELS[r.type] ?? r.type,
            received: parseFloat(r.received ?? "0"),
            expected: parseFloat(r.expected ?? "0"),
            count: parseInt(r.count ?? "0"),
          })),
        },
        expenses: {
          total: totalExpenses, totalAll: totalExpensesAll,
          byCenter: expByCenter.map((r: any) => ({
            costCenter: r.cost_center as string,
            label: COST_CENTER_LABELS[r.cost_center] ?? r.cost_center,
            paid: parseFloat(r.paid ?? "0"),
            total: parseFloat(r.total ?? "0"),
            count: parseInt(r.count ?? "0"),
          })),
        },
        netResult,
        margin: totalRevenue > 0 ? (netResult / totalRevenue) * 100 : 0,
      };
    }),

  // ============================================================
  // DRE POR EMBARCAÇÃO — receitas separadas por vessel
  // ============================================================
  getDREByVessel: adminProcedure
    .input(z.object({
      year: z.string().optional(),
      month: z.string().optional(),
      vesselId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const yearVal = input.year ?? "all";
      const monthVal = input.month ?? "all";

      // Build date filter for bpo_charges (sempre usa alias bc.)
      let dateFilter = `bc.due_date >= '2025-01-01'`;
      if (yearVal !== "all") {
        dateFilter = `YEAR(bc.due_date) = ${parseInt(yearVal)}`;
        if (monthVal && monthVal !== "all") {
          const m = monthVal.padStart(2, "0");
          dateFilter = `bc.due_date LIKE '${yearVal}-${m}-%'`;
        }
      }

      // 1. Receitas por embarcação
      // Usa LEFT JOIN para incluir também cobranças de clientes sem cota ativa (reparos avulsos, etc.)
      let revenueRows: any[] = [];
      if (input.vesselId) {
        const [rows] = (await db.execute(sql.raw(`
          SELECT
            v.id as vessel_id,
            v.name as vessel_name,
            COALESCE(bc.type, 'other') as type,
            COALESCE(SUM(CASE WHEN bc.status IN ('received','confirmed','receivedInCash') THEN CAST(bc.amount_paid AS DECIMAL(10,2)) ELSE 0 END), 0) as received,
            COALESCE(SUM(CAST(bc.value AS DECIMAL(10,2))), 0) as expected,
            COUNT(*) as cnt
          FROM bpo_charges bc
          LEFT JOIN client_quotas cq2 ON LOWER(bc.client_email) = LOWER(cq2.client_email)
            AND cq2.vessel_id = ${input.vesselId} AND cq2.is_active = 1
          LEFT JOIN vessels v ON v.id = cq2.vessel_id
          WHERE ${dateFilter} AND (cq2.vessel_id = ${input.vesselId} OR cq2.vessel_id IS NULL)
          GROUP BY COALESCE(v.id, 0), COALESCE(v.name, 'Sem embarcação'), COALESCE(bc.type, 'other')
          ORDER BY received DESC
        `))) as any;
        revenueRows = Array.isArray(rows) ? rows : [];
      } else {
        const [rows] = (await db.execute(sql.raw(`
          SELECT
            COALESCE(v.id, 0) as vessel_id,
            COALESCE(v.name, 'Sem embarcação') as vessel_name,
            COALESCE(SUM(CASE WHEN bc.status IN ('received','confirmed','receivedInCash') THEN CAST(bc.amount_paid AS DECIMAL(10,2)) ELSE 0 END), 0) as received,
            COALESCE(SUM(CAST(bc.value AS DECIMAL(10,2))), 0) as expected,
            COUNT(*) as cnt
          FROM bpo_charges bc
          LEFT JOIN client_quotas cq2 ON LOWER(bc.client_email) = LOWER(cq2.client_email) AND cq2.is_active = 1
          LEFT JOIN vessels v ON v.id = cq2.vessel_id
          WHERE ${dateFilter}
          GROUP BY COALESCE(v.id, 0), COALESCE(v.name, 'Sem embarcação')
          ORDER BY received DESC
        `))) as any;
        revenueRows = Array.isArray(rows) ? rows : [];
      }

      // 2. Despesas por centro de custo (globais)
      let expDateFilter = `due_date >= '2025-01-01'`;
      if (yearVal !== "all") {
        expDateFilter = `YEAR(due_date) = ${parseInt(yearVal)}`;
        if (monthVal && monthVal !== "all") {
          expDateFilter += ` AND MONTH(due_date) = ${parseInt(monthVal)}`;
        }
      }
      const [expRows] = (await db.execute(sql.raw(`
        SELECT
          COALESCE(cost_center, 'other') as cost_center,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN CAST(value AS DECIMAL(10,2)) ELSE 0 END), 0) as paid,
          COALESCE(SUM(CAST(value AS DECIMAL(10,2))), 0) as total,
          COUNT(*) as cnt
        FROM expense_records
        WHERE ${expDateFilter}
        GROUP BY COALESCE(cost_center, 'other')
        ORDER BY paid DESC
      `))) as any;
      const expByCenter = Array.isArray(expRows) ? expRows : [];

      const totalRevenue = revenueRows.reduce((s: number, r: any) => s + parseFloat(r.received ?? "0"), 0);
      const totalExpected = revenueRows.reduce((s: number, r: any) => s + parseFloat(r.expected ?? "0"), 0);
      const totalExpenses = expByCenter.reduce((s: number, r: any) => s + parseFloat(r.paid ?? "0"), 0);
      const totalExpensesAll = expByCenter.reduce((s: number, r: any) => s + parseFloat(r.total ?? "0"), 0);
      const netResult = totalRevenue - totalExpenses;

      const TYPE_LABELS: Record<string, string> = {
        monthly: "Mensalidades", quota_sale: "Vendas de Cotas",
        fuel: "Abastecimentos", repair: "Reparos", inspection: "Vistorias", other: "Outros",
      };
      const CC_LABELS: Record<string, string> = {
        salary: "Salários", rent: "Aluguéis", pro_labore: "Pró-labore",
        fuel_operational: "Combustível (Op.)", repair: "Reparos",
        operational: "Custo Operacional", withdrawal: "Saque / Retirada", other: "Outros",
      };

      return {
        year: yearVal, month: monthVal, vesselId: input.vesselId ?? null,
        revenueByVessel: input.vesselId
          ? revenueRows.map((r: any) => ({
              vesselId: r.vessel_id as number, vesselName: r.vessel_name as string,
              type: r.type as string, typeLabel: TYPE_LABELS[r.type] ?? r.type,
              received: parseFloat(r.received ?? "0"),
              expected: parseFloat(r.expected ?? "0"),
              count: parseInt(r.cnt ?? "0"),
            }))
          : revenueRows.map((r: any) => ({
              vesselId: r.vessel_id as number, vesselName: r.vessel_name as string,
              type: null, typeLabel: null,
              received: parseFloat(r.received ?? "0"),
              expected: parseFloat(r.expected ?? "0"),
              count: parseInt(r.cnt ?? "0"),
            })),
        expenses: {
          total: totalExpenses, totalAll: totalExpensesAll,
          byCenter: expByCenter.map((r: any) => ({
            costCenter: r.cost_center as string,
            label: CC_LABELS[r.cost_center] ?? r.cost_center ?? "Outros",
            paid: parseFloat(r.paid ?? "0"),
            total: parseFloat(r.total ?? "0"),
            count: parseInt(r.cnt ?? "0"),
          })),
        },
        totalRevenue, totalExpected, totalExpenses, totalExpensesAll,
        netResult,
        margin: totalRevenue > 0 ? (netResult / totalRevenue) * 100 : 0,
      };
    }),

  // ============================================================
  // WEBHOOK LOGS — histórico de eventos recebidos do Asaas
  // ============================================================
  listWebhookLogs: adminProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [rows] = (await db.execute(sql.raw(`
        SELECT id, event, asaas_payment_id, payload, processed, error, created_at
        FROM webhook_logs ORDER BY created_at DESC
        LIMIT ${input.limit} OFFSET ${input.offset}
      `))) as any;
      const [countRows] = (await db.execute(sql.raw(`SELECT COUNT(*) as total FROM webhook_logs`))) as any;
      const logs = Array.isArray(rows) ? rows : [];
      const total = parseInt((Array.isArray(countRows) ? countRows[0] : countRows)?.total ?? "0");
      return { logs, total };
    }),

  // ============================================================
  // RECONCILIAÇÃO — cobranças pendentes vs status no Asaas
  // ============================================================
  getReconciliationReport: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [rows] = (await db.execute(sql.raw(`
        SELECT id, asaas_charge_id, client_name, client_email, value, status, due_date, synced_at
        FROM bpo_charges
        WHERE status IN ('pending','overdue')
          AND asaas_charge_id IS NOT NULL
          AND due_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        ORDER BY due_date ASC LIMIT 100
      `))) as any;
      const pending = Array.isArray(rows) ? rows : [];
      const [divergentRows] = (await db.execute(sql.raw(`
        SELECT id, asaas_charge_id, client_name, value, status, due_date, synced_at
        FROM bpo_charges
        WHERE status IN ('pending','overdue')
          AND asaas_charge_id IS NOT NULL
          AND (synced_at IS NULL OR synced_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
          AND due_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        LIMIT 50
      `))) as any;
      const divergent = Array.isArray(divergentRows) ? divergentRows : [];
      const [statsRows] = (await db.execute(sql.raw(`
        SELECT status, COUNT(*) as count, COALESCE(SUM(CAST(value AS DECIMAL(10,2))), 0) as total
        FROM bpo_charges
        WHERE due_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        GROUP BY status
      `))) as any;
      const stats = Array.isArray(statsRows) ? statsRows : [];
      return {
        pendingCharges: pending.map((r: any) => ({
          id: r.id as number, asaasChargeId: r.asaas_charge_id as string,
          clientName: r.client_name as string, clientEmail: r.client_email as string,
          value: parseFloat(r.value ?? "0"), status: r.status as string,
          dueDate: r.due_date as string, syncedAt: r.synced_at as string | null,
        })),
        divergentCharges: divergent.map((r: any) => ({
          id: r.id as number, asaasChargeId: r.asaas_charge_id as string,
          clientName: r.client_name as string, value: parseFloat(r.value ?? "0"),
          status: r.status as string, dueDate: r.due_date as string,
          syncedAt: r.synced_at as string | null,
        })),
        statusStats: stats.map((r: any) => ({
          status: r.status as string,
          count: parseInt(r.count ?? "0"),
          total: parseFloat(r.total ?? "0"),
        })),
        totalPending: pending.length,
        totalDivergent: divergent.length,
      };
    }),

  // ============================================================
  // LISTAR NÃO CLASSIFICADAS — para painel de classificação manual
  // ============================================================
  listUnclassified: adminProcedure
    .input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Apenas cobranças RECEBIDAS precisam de classificação (dinheiro que entrou)
      // pending/overdue = dívida ainda não paga, não deve aparecer para classificar
      const receivedStatuses = ["received", "confirmed", "receivedInCash", "partiallyPaid"] as const;

      const charges = await db.select().from(bpoCharges)
        .where(and(
          eq(bpoCharges.classifiedBy, "unclassified"),
          gte(bpoCharges.dueDate, "2025-01-01"),
          inArray(bpoCharges.status, receivedStatuses as unknown as string[])
        ))
        .orderBy(bpoCharges.dueDate)
        .limit(input.limit)
        .offset(input.offset);

      const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(bpoCharges)
        .where(and(
          eq(bpoCharges.classifiedBy, "unclassified"),
          gte(bpoCharges.dueDate, "2025-01-01"),
          inArray(bpoCharges.status, receivedStatuses as unknown as string[])
        ));

      // Buscar todos os clientes para sugestão automática
      const localClients = await db.select({
        id: acTable.id,
        name: acTable.name,
        email: acTable.email,
      }).from(acTable).where(eq(acTable.isActive, 1));

      // Buscar cobranças com cliente vinculado para match por valor+data
      const [pendingRows] = (await db.execute(sql.raw(`
        SELECT id, client_id, client_name, client_email, value, due_date, type
        FROM bpo_charges
        WHERE client_id IS NOT NULL
          AND classified_by != 'unclassified'
          AND due_date >= '2025-01-01'
        LIMIT 2000
      `))) as any;
      const pendingCharges: Array<{
        id: number; client_id: number; client_name: string; client_email: string;
        value: string; due_date: string; type: string;
      }> = Array.isArray(pendingRows) ? pendingRows : [];

      // Helper: normalizar string para comparação
      const normalize = (s: string) => s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]/g, " ").trim();

      // Helper: sugestão por nome na descrição
      const suggestByDescription = (description: string | null): {
        clientId: number; clientName: string; clientEmail: string; confidence: number;
      } | null => {
        if (!description) return null;
        const descNorm = normalize(description);
        let best: { clientId: number; clientName: string; clientEmail: string; confidence: number } | null = null;
        for (const c of localClients) {
          const nameParts = normalize(c.name).split(" ").filter(p => p.length >= 3);
          let matches = 0;
          for (const part of nameParts) {
            if (descNorm.includes(part)) matches++;
          }
          if (matches > 0) {
            const confidence = Math.round((matches / nameParts.length) * 100);
            if (!best || confidence > best.confidence) {
              best = { clientId: c.id, clientName: c.name, clientEmail: c.email, confidence };
            }
          }
        }
        // Retorna apenas se confiança >= 40%
        return best && best.confidence >= 40 ? best : null;
      };

      // Helper: match por valor + data (±7 dias)
      const matchByValueDate = (value: string, dueDate: string): {
        clientId: number; clientName: string; clientEmail: string;
        matchType: string; matchValue: string; matchDate: string;
      } | null => {
        const val = parseFloat(value);
        const date = new Date(dueDate);
        const matches = pendingCharges.filter(pc => {
          const pcVal = parseFloat(pc.value);
          const pcDate = new Date(pc.due_date);
          const diffDays = Math.abs((date.getTime() - pcDate.getTime()) / (1000 * 60 * 60 * 24));
          return Math.abs(pcVal - val) < 0.01 && diffDays <= 7;
        });
        // Só retorna se houver exatamente 1 match (sem ambiguidade)
        if (matches.length === 1) {
          const m = matches[0];
          return {
            clientId: m.client_id,
            clientName: m.client_name,
            clientEmail: m.client_email,
            matchType: m.type,
            matchValue: m.value,
            matchDate: m.due_date,
          };
        }
        return null;
      };

      // Enriquecer cada cobrança com sugestões
      const enriched = charges.map(charge => {
        const descSuggestion = suggestByDescription(charge.description);
        const valueDateMatch = !descSuggestion
          ? matchByValueDate(charge.value, charge.dueDate)
          : null;
        return {
          ...charge,
          suggestedClient: descSuggestion ?? null,
          possibleMatch: valueDateMatch ?? null,
        };
      });

      return { charges: enriched, total: countResult?.count ?? 0 };
    }),

  // ============================================================
  // CRIAR COBRANÇA MANUAL — cria no Asaas e salva em bpo_charges
  // ============================================================
  createCharge: adminProcedure
    .input(z.object({
      clientId: z.number(),
      type: z.enum(["monthly", "quota_sale", "fuel", "repair", "other"]),
      value: z.number().positive(),
      dueDay: z.number().min(1).max(31),
      startMonth: z.string(), // formato YYYY-MM
      installments: z.number().min(1).max(36).optional().default(1),
      description: z.string().optional(),
      yearlyAdjustment: z.enum(["manual", "ipca", "igpm"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Buscar dados do cliente
      const clientResult = await db.select().from(acTable)
        .where(eq(acTable.id, input.clientId)).limit(1);
      if (clientResult.length === 0) {
        throw new Error("Cliente não encontrado");
      }
      const client = clientResult[0];

      // Criar/buscar cliente no Asaas
      const asaasCustomer = await getOrCreateAsaasCustomer({
        email: client.email,
        name: client.name,
        cpfCnpj: client.cpfCnpj ?? undefined,
        phone: client.phone ?? undefined,
      });

      const typeLabel: Record<string, string> = {
        monthly: "Mensalidade",
        quota_sale: "Venda de Cota",
        fuel: "Abastecimento",
        repair: "Reparo",
        other: "Outros",
      };

      // Parsear mês/ano de início
      const [startYear, startMonthStr] = input.startMonth.split("-");
      const startYearNum = parseInt(startYear);
      const startMonthNum = parseInt(startMonthStr);

      const createdCharges: string[] = [];

      let totalInstallments: number;
      if (input.type === "quota_sale") {
        totalInstallments = input.installments ?? 1;
      } else if (input.type === "monthly") {
        // Cria uma cobrança por mês do mês inicial até dezembro do mesmo ano
        totalInstallments = 13 - startMonthNum;
      } else {
        totalInstallments = 1;
      }
      // Mensalidade: cada mês tem o valor cheio; quota_sale: divide o total
      const installmentValue = (input.type !== "monthly" && totalInstallments > 1)
        ? Math.round((input.value / totalInstallments) * 100) / 100
        : input.value;

      for (let i = 0; i < totalInstallments; i++) {
        let parcelMonth = startMonthNum + i;
        let parcelYear = startYearNum;
        while (parcelMonth > 12) {
          parcelMonth -= 12;
          parcelYear += 1;
        }
        const dueDateStr = `${String(parcelYear)}-${String(parcelMonth).padStart(2, "0")}-${String(input.dueDay).padStart(2, "0")}`;
        let descLabel: string;
        if (input.type === "monthly") {
          descLabel = input.description
            ? `${input.description} - ${String(parcelMonth).padStart(2, "0")}/${parcelYear}`
            : `Mensalidade - ${String(parcelMonth).padStart(2, "0")}/${parcelYear} - ${client.name}`;
        } else if (totalInstallments > 1) {
          descLabel = `${typeLabel[input.type]} - Parcela ${i + 1}/${totalInstallments} - ${client.name}`;
        } else {
          descLabel = input.description || `${typeLabel[input.type]} - ${String(parcelMonth).padStart(2, "0")}/${parcelYear} - ${client.name}`;
        }

        const asaasCharge = await createPixCharge({
          customerId: asaasCustomer.id,
          value: installmentValue,
          dueDate: dueDateStr,
          description: descLabel,
        });

        await db.insert(bpoCharges).values({
          asaasChargeId: asaasCharge.id,
          asaasCustomerId: asaasCustomer.id,
          clientId: client.id,
          clientName: client.name,
          clientEmail: client.email,
          value: installmentValue.toString(),
          dueDate: dueDateStr,
          status: "pending",
          type: input.type,
          classifiedBy: "manual",
          billingType: "PIX",
          description: descLabel,
          paymentLink: asaasCharge.invoiceUrl ?? null,
          invoiceUrl: asaasCharge.invoiceUrl ?? null,
          source: "manual",
        });

        createdCharges.push(asaasCharge.id);
      }

      return {
        success: true,
        message: `${createdCharges.length} cobrança(s) criada(s) com sucesso`,
        chargeIds: createdCharges,
      };
    }),

  // ============================================================
  // EDITAR COBRANÇA — atualiza tipo, valor e vencimento
  // ============================================================
  updateCharge: adminProcedure
    .input(z.object({
      chargeId: z.number(),
      type: z.enum(["monthly", "quota_sale", "fuel", "repair", "other"]).optional(),
      value: z.number().positive().optional(),
      dueDate: z.string().optional(), // YYYY-MM-DD
      description: z.string().optional(),
      clientId: z.number().optional(), // vincular cliente
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const existing = await db.select().from(bpoCharges)
        .where(eq(bpoCharges.id, input.chargeId)).limit(1);
      if (existing.length === 0) {
        throw new Error("Cobrança não encontrada");
      }

      // Se clientId fornecido, buscar dados do cliente
      if (input.clientId !== undefined) {
        const clientRow = await db.select({
          id: acTable.id,
          name: acTable.name,
          email: acTable.email,
        }).from(acTable).where(eq(acTable.id, input.clientId)).limit(1);
        if (clientRow.length > 0) {
          const c = clientRow[0];
          // Atualizar cobrança com dados do cliente
          await db.execute(sql.raw(`
            UPDATE bpo_charges
            SET client_id = ${c.id},
                client_name = '${(c.name ?? "").replace(/'/g, "''")}',
                client_email = '${(c.email ?? "").replace(/'/g, "''")}',
                updated_at = NOW()
            WHERE id = ${input.chargeId}
          `));
        }
      }

      const updateData: Record<string, unknown> = {};
      if (input.type !== undefined) updateData.type = input.type;
      if (input.value !== undefined) updateData.value = input.value.toString();
      if (input.dueDate !== undefined) updateData.dueDate = input.dueDate;
      if (input.description !== undefined) updateData.description = input.description;

      await db.update(bpoCharges)
        .set(updateData)
        .where(eq(bpoCharges.id, input.chargeId));

      return { success: true, message: "Cobrança atualizada com sucesso" };
    }),

  // ============================================================
  // EXCLUIR COBRANÇA — remove do banco e cancela no Asaas
  // ============================================================
  deleteCharge: adminProcedure
    .input(z.object({
      chargeId: z.number(),
      cancelInAsaas: z.boolean().optional().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const existing = await db.select().from(bpoCharges)
        .where(eq(bpoCharges.id, input.chargeId)).limit(1);
      if (existing.length === 0) {
        throw new Error("Cobrança não encontrada");
      }

      const charge = existing[0];

      // Cancelar no Asaas se tiver ID e for solicitado
      if (input.cancelInAsaas && charge.asaasChargeId) {
        try {
          await cancelCharge(charge.asaasChargeId);
        } catch (err) {
          console.warn("[bpo.deleteCharge] Falha ao cancelar no Asaas:", err);
          // Continua mesmo se falhar no Asaas
        }
      }

      await db.delete(bpoCharges).where(eq(bpoCharges.id, input.chargeId));

      return { success: true, message: "Cobrança excluída com sucesso" };
    }),

  // ============================================================
  // DAR BAIXA MANUAL — confirma recebimento em dinheiro/manual
  // Chama receiveInCash no Asaas e atualiza status no banco
  // ============================================================
  markAsPaid: adminProcedure
    .input(z.object({
      chargeId: z.number(),
      paymentDate: z.string().optional(), // YYYY-MM-DD, padrão = hoje
      value: z.number().optional(),       // Se omitido, usa valor total da cobrança
      notifyCustomer: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const rows = await db.select().from(bpoCharges)
        .where(eq(bpoCharges.id, input.chargeId)).limit(1);
      if (rows.length === 0) throw new Error("Cobrança não encontrada");

      const charge = rows[0];
      const paymentDate = input.paymentDate || new Date().toISOString().split('T')[0];
      const paidValue = input.value ?? parseFloat(String(charge.value));

      // Tentar confirmar no Asaas se tiver ID
      if (charge.asaasChargeId) {
        const result = await receiveInCash({
          asaasPaymentId: charge.asaasChargeId,
          paymentDate,
          value: paidValue,
          notifyCustomer: input.notifyCustomer,
        });
        if (!result.success) {
          console.warn("[bpo.markAsPaid] Falha no Asaas:", result.error);
          // Continua mesmo se falhar no Asaas — atualiza banco local
        }
      }

      await db.update(bpoCharges)
        .set({
          status: "receivedInCash",
          amountPaid: String(paidValue),
          paidDate: paymentDate,
        })
        .where(eq(bpoCharges.id, input.chargeId));

      // Sincronizar para inspection_charges / fuel_records
      if (charge.asaasChargeId) {
        await syncStatusToSources(db, charge.asaasChargeId, "receivedInCash");
      }

      return {
        success: true,
        message: `Baixa registrada com sucesso! Valor: R$ ${paidValue.toFixed(2)}`,
      };
    }),

  // ============================================================
  // PAGAMENTO PARCIAL — acumula amountPaid, status partiallyPaid
  // Quando amountPaid >= value, muda para receivedInCash
  // ============================================================
  registerPartialPayment: adminProcedure
    .input(z.object({
      chargeId: z.number(),
      value: z.number(),              // Valor recebido neste pagamento
      asaasChargeId: z.string().optional(), // ID do PIX no Asaas (opcional)
      paymentDate: z.string().optional(),   // YYYY-MM-DD
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const rows = await db.select().from(bpoCharges)
        .where(eq(bpoCharges.id, input.chargeId)).limit(1);
      if (rows.length === 0) throw new Error("Cobrança não encontrada");

      const charge = rows[0];
      const chargeValue = parseFloat(String(charge.value));
      const currentAmountPaid = parseFloat(String(charge.amountPaid || '0'));
      const newAmountPaid = currentAmountPaid + input.value;

      // Atualizar paymentLinks (JSON array de IDs Asaas vinculados)
      let paymentLinks: string[] = [];
      try {
        paymentLinks = charge.paymentLinks ? JSON.parse(charge.paymentLinks) : [];
      } catch { paymentLinks = []; }
      if (input.asaasChargeId && !paymentLinks.includes(input.asaasChargeId)) {
        paymentLinks.push(input.asaasChargeId);
      }

      const isPaid = newAmountPaid >= chargeValue - 0.01; // tolerância 1 centavo
      const newStatus = isPaid ? "receivedInCash" : "partiallyPaid";
      const paymentDate = input.paymentDate || new Date().toISOString().split('T')[0];
      const remaining = Math.max(0, chargeValue - newAmountPaid);

      await db.update(bpoCharges)
        .set({
          status: newStatus,
          amountPaid: newAmountPaid.toFixed(2),
          paymentLinks: JSON.stringify(paymentLinks),
          ...(isPaid ? { paidDate: paymentDate } : {}),
        })
        .where(eq(bpoCharges.id, input.chargeId));

      // Sincronizar status para inspection_charges / fuel_records
      if (charge.asaasChargeId) {
        await syncStatusToSources(db, charge.asaasChargeId, newStatus);
      }

      return {
        success: true,
        isPaid,
        newAmountPaid,
        remaining,
        message: isPaid
          ? `Cobrança quitada! Total recebido: R$ ${newAmountPaid.toFixed(2)}`
          : `Pagamento parcial registrado. Recebido: R$ ${newAmountPaid.toFixed(2)} de R$ ${chargeValue.toFixed(2)}. Saldo: R$ ${remaining.toFixed(2)}`,
      };
    }),

  // ============================================================
  // SPLIT DE PIX — distribui 1 PIX entre N cobranças bpo_charges
  // Implementação em executeSplitPayment() acima do router
  // ============================================================
  // @ts-ignore -- CI phantom type error: drizzle/tRPC generic inference
  splitPayment: adminProcedure
    .input(z.object({
      pixValue: z.number(),
      sourceChargeId: z.number().optional(),
      asaasChargeId: z.string().optional(),
      paymentDate: z.string().optional(),
      splits: z.array(z.object({
        chargeId: z.number(),
        amount: z.number(),
      })),
    }))
    .mutation(({ input }) => executeSplitPayment(input)),

  // ============================================================
  // BUSCAR COBRANÇAS PENDENTES DE UM CLIENTE — para split/parcial
  // ============================================================
  getClientPendingCharges: adminProcedure
    .input(z.object({
      clientId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Buscar email do cliente para também encontrar cobranças com client_id NULL
      const [clientRows] = (await db.execute(sql.raw(`
        SELECT email FROM allowed_clients WHERE id = ${input.clientId} LIMIT 1
      `))) as any;
      const clientEmail = Array.isArray(clientRows) && clientRows.length > 0 ? clientRows[0]?.email : null;

      const emailCondition = clientEmail
        ? `OR (client_id IS NULL AND client_email = '${clientEmail.replace(/'/g, "\\'")}')`
        : '';

      const [rows] = (await db.execute(sql.raw(`
        SELECT id, due_date as dueDate, value, amount_paid as amountPaid,
               status, type, description, asaas_charge_id as asaasChargeId,
               client_name as client_name
        FROM bpo_charges
        WHERE (client_id = ${input.clientId} ${emailCondition})
          AND status IN ('pending', 'overdue', 'partiallyPaid')
        ORDER BY due_date ASC
        LIMIT 50
      `))) as any;

      return Array.isArray(rows) ? rows : [];
    }),

  // ============================================================
  // CLASSIFICAÇÃO AUTOMÁTICA EM LOTE — reclassifica cobranças 'other'
  // ============================================================
  autoClassifyAll: adminProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Buscar todas as cobranças com tipo 'other' ou classifiedBy 'unclassified'
      const [rows] = (await db.execute(sql.raw(`
        SELECT id, description, external_reference as externalReference
        FROM bpo_charges
        WHERE (type = 'other' OR classified_by = 'unclassified')
          AND due_date >= '2025-01-01'
        LIMIT 500
      `))) as any;

      const charges: Array<{ id: number; description: string | null; externalReference: string | null }> =
        Array.isArray(rows) ? rows : [];

      let classified = 0;
      let unchanged = 0;

      for (const charge of charges) {
        const { type, classifiedBy } = autoClassifyCharge(charge.description, charge.externalReference);
        if (type !== "other" || classifiedBy === "auto") {
          await db.execute(sql.raw(`
            UPDATE bpo_charges
            SET type = '${type}', classified_by = '${classifiedBy}', updated_at = NOW()
            WHERE id = ${charge.id}
          `));
          classified++;
        } else {
          unchanged++;
        }
      }

      return {
        success: true,
        total: charges.length,
        classified,
        unchanged,
        message: `${classified} cobrança(s) reclassificada(s) automaticamente. ${unchanged} permaneceram como 'Outros'.`,
      };
    }),

  // ============================================================
  // VINCULAR CLIENTE — vincula manualmente um cliente a uma cobrança desconhecida
  // ============================================================
  linkClient: adminProcedure
    .input(z.object({
      chargeId: z.number(),
      clientId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Buscar dados do cliente
      const [client] = await db.select({
        id: acTable.id,
        name: acTable.name,
        email: acTable.email,
      }).from(acTable).where(eq(acTable.id, input.clientId)).limit(1);

      if (!client) throw new Error("Cliente não encontrado");

      // Atualizar a cobrança com os dados do cliente
      await db.execute(sql.raw(`
        UPDATE bpo_charges
        SET client_id = ${client.id},
            client_name = '${client.name.replace(/'/g, "''")}',
            client_email = '${client.email.replace(/'/g, "''")}',
            updated_at = NOW()
        WHERE id = ${input.chargeId}
      `));

      return { success: true, clientName: client.name, clientEmail: client.email };
    }),

  // ============================================================
  // LISTAR CLIENTES ATIVOS — para dropdown de vinculação
  // ============================================================
    listActiveClients: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      // Retorna TODOS os clientes cadastrados (ativos e inativos)
      // para uso no dialog de vinculação manual de cobranças
      const clients = await db.select({
        id: acTable.id,
        name: acTable.name,
        email: acTable.email,
        cpfCnpj: acTable.cpfCnpj,
        isActive: acTable.isActive,
      }).from(acTable)
        .orderBy(acTable.name);
      return clients;
    }),

  // ============================================================
  // LISTAR EMBARCAÇÕES — para filtro na aba Cobranças
  // ============================================================
  listVesselsForFilter: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      // Retornar apenas embarcações que tenham pelo menos um cotista ativo
      const [rows] = (await db.execute(sql.raw(`
        SELECT DISTINCT v.id, v.name
        FROM vessels v
        INNER JOIN client_quotas cq ON cq.vessel_id = v.id AND cq.is_active = 1
        ORDER BY v.name ASC
      `))) as any;
      return Array.isArray(rows) ? rows : [];
    }),

  // ============================================================
  // GERAR LINK PIX INDIVIDUAL — cria ou retorna link PIX por cobrança
  // Elimina dependência de rateio manual: cada bpo_charge tem seu
  // próprio asaas_charge_id e payment_link no Asaas.
  // ============================================================
  generatePixLink: adminProcedure
    .input(z.object({
      chargeId: z.number(),   // ID da bpo_charge
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Buscar a cobrança
      const rows = await db.select().from(bpoCharges)
        .where(eq(bpoCharges.id, input.chargeId)).limit(1);
      if (rows.length === 0) throw new Error("Cobrança não encontrada");
      const charge = rows[0];

      // 2. Se já tem asaas_charge_id, verificar se ainda está ativo no Asaas
      if (charge.asaasChargeId) {
        try {
          const existing = await getChargeStatus(charge.asaasChargeId);
          if (existing && !['CANCELLED', 'REFUNDED'].includes(existing.status ?? '')) {
            // Retornar o link existente
            const pixData = await getPixQrCode(charge.asaasChargeId);
            return {
              asaasChargeId: charge.asaasChargeId,
              paymentLink: charge.paymentLink ?? existing.invoiceUrl ?? null,
              invoiceUrl: existing.invoiceUrl ?? null,
              pixPayload: pixData.payload ?? null,
              pixQrCode: pixData.encodedImage ?? null,
              reused: true,
            };
          }
        } catch (e) {
          console.warn('[bpo.generatePixLink] Erro ao verificar cobrança existente:', e);
        }
      }

      // 3. Garantir que o cliente existe no Asaas
      if (!charge.clientEmail || !charge.clientName) {
        throw new Error("Cobrança sem email ou nome do cliente — não é possível criar link PIX");
      }

      const asaasCustomer = await getOrCreateAsaasCustomer({
        email: charge.clientEmail,
        name: charge.clientName,
      });

      // 4. Criar cobrança PIX individual no Asaas
      const dueDate = charge.dueDate ?? new Date().toISOString().split('T')[0];
      const typeLabels: Record<string, string> = {
        monthly: 'Mensalidade', quota_sale: 'Venda de Cota',
        fuel: 'Abastecimento', repair: 'Reparo', inspection: 'Vistoria', other: 'Cobrança',
      };
      const typeLabel = typeLabels[charge.type ?? 'other'] ?? 'Cobrança';
      const description = charge.description
        || `${typeLabel} — Exclusive Club — Venc. ${dueDate}`;

      const newCharge = await createPixCharge({
        customerId: asaasCustomer.id,
        value: parseFloat(String(charge.value)),
        dueDate,
        description,
        externalReference: `bpo_charge_${charge.id}`,
        billingType: 'PIX',
      });

      // 5. Buscar QR Code PIX
      let pixPayload: string | null = null;
      let pixQrCode: string | null = null;
      try {
        const pixData = await getPixQrCode(newCharge.id);
        pixPayload = pixData.payload ?? null;
        pixQrCode = pixData.encodedImage ?? null;
      } catch (e) {
        console.warn('[bpo.generatePixLink] Erro ao buscar QR Code:', e);
      }

      // 6. Atualizar bpo_charge com o novo asaas_charge_id e payment_link
      await db.update(bpoCharges)
        .set({
          asaasChargeId: newCharge.id,
          asaasCustomerId: asaasCustomer.id,
          paymentLink: newCharge.invoiceUrl ?? null,
          invoiceUrl: newCharge.invoiceUrl ?? null,
          syncedAt: sql`NOW()`,
        })
        .where(eq(bpoCharges.id, input.chargeId));

      console.log(`[bpo.generatePixLink] PIX criado para bpo_charge #${input.chargeId}: ${newCharge.id}`);

      return {
        asaasChargeId: newCharge.id,
        paymentLink: newCharge.invoiceUrl ?? null,
        invoiceUrl: newCharge.invoiceUrl ?? null,
        pixPayload,
        pixQrCode,
        reused: false,
      };
    }),

  // ============================================================
  // GERAR LINKS PIX EM LOTE — cria links PIX para múltiplas cobranças
  // ============================================================
  generatePixLinkBatch: adminProcedure
    .input(z.object({
      chargeIds: z.array(z.number()).min(1).max(50),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const results: Array<{
        chargeId: number;
        status: 'ok' | 'error' | 'reused';
        asaasChargeId?: string;
        paymentLink?: string | null;
        message?: string;
      }> = [];

      for (const chargeId of input.chargeIds) {
        try {
          const rows = await db.select().from(bpoCharges)
            .where(eq(bpoCharges.id, chargeId)).limit(1);
          if (rows.length === 0) {
            results.push({ chargeId, status: 'error', message: 'Cobrança não encontrada' });
            continue;
          }
          const charge = rows[0];

          // Pular cobranças já pagas
          if (['received', 'confirmed', 'receivedInCash'].includes(charge.status ?? '')) {
            results.push({ chargeId, status: 'reused', asaasChargeId: charge.asaasChargeId ?? undefined, paymentLink: charge.paymentLink, message: 'Já paga' });
            continue;
          }

          // Reusar link existente se válido
          if (charge.asaasChargeId) {
            try {
              const existing = await getChargeStatus(charge.asaasChargeId);
              if (existing && !['CANCELLED', 'REFUNDED'].includes(existing.status ?? '')) {
                results.push({ chargeId, status: 'reused', asaasChargeId: charge.asaasChargeId, paymentLink: charge.paymentLink });
                continue;
              }
            } catch { /* continua para criar novo */ }
          }

          if (!charge.clientEmail || !charge.clientName) {
            results.push({ chargeId, status: 'error', message: 'Sem email/nome do cliente' });
            continue;
          }

          const asaasCustomer = await getOrCreateAsaasCustomer({
            email: charge.clientEmail,
            name: charge.clientName,
          });

          const dueDate = charge.dueDate ?? new Date().toISOString().split('T')[0];
          const typeLabels: Record<string, string> = {
            monthly: 'Mensalidade', quota_sale: 'Venda de Cota',
            fuel: 'Abastecimento', repair: 'Reparo', inspection: 'Vistoria', other: 'Cobrança',
          };
          const typeLabel = typeLabels[charge.type ?? 'other'] ?? 'Cobrança';
          const description = charge.description || `${typeLabel} — Exclusive Club — Venc. ${dueDate}`;

          const newCharge = await createPixCharge({
            customerId: asaasCustomer.id,
            value: parseFloat(String(charge.value)),
            dueDate,
            description,
            externalReference: `bpo_charge_${chargeId}`,
            billingType: 'PIX',
          });

          await db.update(bpoCharges)
            .set({
              asaasChargeId: newCharge.id,
              asaasCustomerId: asaasCustomer.id,
              paymentLink: newCharge.invoiceUrl ?? null,
              invoiceUrl: newCharge.invoiceUrl ?? null,
              syncedAt: sql`NOW()`,
            })
            .where(eq(bpoCharges.id, chargeId));

          results.push({ chargeId, status: 'ok', asaasChargeId: newCharge.id, paymentLink: newCharge.invoiceUrl ?? null });

          // Rate limiting: 300ms entre cobranças
          await new Promise(r => setTimeout(r, 300));
        } catch (err: any) {
          results.push({ chargeId, status: 'error', message: err.message });
        }
      }

      return {
        total: input.chargeIds.length,
        ok: results.filter(r => r.status === 'ok').length,
        reused: results.filter(r => r.status === 'reused').length,
        errors: results.filter(r => r.status === 'error').length,
        results,
      };
    }),

  // ============================================================
  // Sync retroativo: varre inspection_charges sem par em bpo_charges
  // e cria os registros faltantes. Resolve cobranças criadas antes
  // do fix de upsert ou cujo webhook do Asaas nunca disparou.
  // ============================================================
  repairInspectionSync: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    // Status mapping: inspection_charges → bpo_charges
    const statusMap: Record<string, string> = {
      pending: 'pending',
      paid: 'received',
      overdue: 'overdue',
      partiallyPaid: 'partiallyPaid',
      cancelled: 'cancelled',
    };

    // Busca todas as inspection_charges sem par em bpo_charges
    const orphansRaw = await db.execute(sql.raw(`
      SELECT
        ic.id,
        ic.asaas_charge_id,
        ic.charge_type,
        ic.client_email,
        ic.vessel_name,
        ic.amount,
        ic.due_date,
        ic.payment_status,
        ic.description,
        ac.id   AS client_id,
        ac.name AS client_name
      FROM inspection_charges ic
      LEFT JOIN bpo_charges bc ON bc.asaas_charge_id = ic.asaas_charge_id
      LEFT JOIN allowed_clients ac ON LOWER(ac.email) = LOWER(ic.client_email)
      WHERE bc.id IS NULL
        AND ic.asaas_charge_id IS NOT NULL
        AND ic.client_email IS NOT NULL
    `)) as any;

    const orphans: any[] = Array.isArray(orphansRaw[0]) ? orphansRaw[0] : orphansRaw;

    let synced = 0;
    const errors: string[] = [];

    for (const ic of orphans) {
      try {
        const dueDate = ic.due_date
          ? String(ic.due_date).substring(0, 10)
          : new Date().toISOString().substring(0, 10);
        const bpoStatus = statusMap[ic.payment_status] ?? 'pending';
        const bpoType = ic.charge_type === 'repair' ? 'repair' : 'inspection';
        const value = parseFloat(ic.amount || '0').toFixed(2);

        await db.execute(sql.raw(`
          INSERT INTO bpo_charges
            (asaas_charge_id, client_id, client_name, client_email,
             value, due_date, status, type, classified_by, billing_type,
             description, source)
          VALUES
            (${JSON.stringify(ic.asaas_charge_id)},
             ${ic.client_id ?? 'NULL'},
             ${ic.client_name ? JSON.stringify(ic.client_name) : 'NULL'},
             ${JSON.stringify(ic.client_email)},
             ${value},
             ${JSON.stringify(dueDate)},
             ${JSON.stringify(bpoStatus)},
             ${JSON.stringify(bpoType)},
             'manual', 'PIX',
             ${ic.description ? JSON.stringify(ic.description) : JSON.stringify(`${bpoType === 'repair' ? 'Reparo' : 'Vistoria'} - ${ic.vessel_name || ''}`)},
             'manual')
          ON DUPLICATE KEY UPDATE
            type         = VALUES(type),
            classified_by = 'manual',
            status       = VALUES(status),
            client_id    = COALESCE(VALUES(client_id), client_id),
            client_name  = COALESCE(VALUES(client_name), client_name),
            client_email = COALESCE(VALUES(client_email), client_email)
        `));
        synced++;
      } catch (err: any) {
        errors.push(`ic#${ic.id}: ${err.message}`);
      }
    }

    return { total: orphans.length, synced, errors };
  }),
});
