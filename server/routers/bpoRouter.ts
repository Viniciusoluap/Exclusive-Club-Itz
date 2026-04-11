/**
 * BPO Router — Fonte única de verdade do BPO Financeiro
 * 
 * Gerencia a tabela bpo_charges que substitui subscription_charges +
 * unclassified_charges como base dos cards de totais e lista de cobranças.
 */
import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { bpoCharges, unclassifiedCharges } from "../../drizzle/schema";
import { eq, sql, and, gte, lte, inArray } from "drizzle-orm";
import { listAllAsaasCharges, getChargeStatus } from "../_core/asaasService";

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

    // Montar mapa asaas_customer_id → cliente local via unclassified_charges
    const ucLinks = await db.select({
      asaasCustomerId: unclassifiedCharges.asaasCustomerId,
      linkedClientId: unclassifiedCharges.linkedClientId,
      asaasCustomerName: unclassifiedCharges.asaasCustomerName,
      asaasCustomerEmail: unclassifiedCharges.asaasCustomerEmail,
    }).from(unclassifiedCharges);

    const clientMap = new Map<string, { id: number; name: string; email: string }>();
    for (const uc of ucLinks) {
      if (uc.asaasCustomerId && uc.linkedClientId && !clientMap.has(uc.asaasCustomerId)) {
        clientMap.set(uc.asaasCustomerId, {
          id: uc.linkedClientId,
          name: uc.asaasCustomerName || "",
          email: uc.asaasCustomerEmail || "",
        });
      }
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

          if (existing.length > 0) {
            // Atualizar apenas campos que podem ter mudado
            await db
              .update(bpoCharges)
              .set({
                status: normalizedStatus,
                paidDate: charge.paymentDate || null,
                amountPaid: paid ? String(charge.value) : "0",
                netValue: charge.netValue != null ? String(charge.netValue) : null,
                syncedAt: new Date(),
                source: "asaas_import",
              })
              .where(eq(bpoCharges.asaasChargeId, charge.id));
            report.updated++;
          } else {
            // Inserir novo registro
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
              billingType: charge.billingType || null,
              description: charge.description || null,
              externalReference: charge.externalReference || null,
              paymentLink: charge.invoiceUrl || null,
              invoiceUrl: charge.invoiceUrl || null,
              bankSlipUrl: charge.bankSlipUrl || null,
              source: "asaas_import",
              syncedAt: new Date(),
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
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const year = input?.year || new Date().getFullYear().toString();
      const dateFrom = input?.dateFrom || `${year}-01-01`;
      const dateTo = input?.dateTo || `${year}-12-31`;

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
        WHERE due_date BETWEEN '${dateFrom}' AND '${dateTo}'
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
          limit: z.number().optional().default(50),
          offset: z.number().optional().default(0),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const statusFilter = input?.status ?? "all";
      const typeFilter = input?.type ?? "all";
      const monthFilter = input?.month;
      const yearFilter = input?.year ?? new Date().getFullYear().toString();
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
        conditions.push(`due_date LIKE '${yearFilter}-${m}-%'`);
      } else {
        conditions.push(`due_date LIKE '${yearFilter}-%'`);
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

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = (await db.execute(sql.raw(`
        SELECT * FROM bpo_charges
        ${whereClause}
        ORDER BY due_date DESC
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
            syncedAt: new Date(),
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
          syncedAt: new Date(),
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
      types: z.array(z.enum(["monthly", "quota_sale", "fuel", "repair", "other"])).optional(),
      status: z.array(z.enum(["pending", "received", "confirmed", "overdue", "refunded", "receivedInCash", "awaitingChargeback", "detached", "partiallyPaid"])).optional(),
      year: z.number().optional(),
      month: z.number().min(1).max(12).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { charges: [] };

      const userEmail = ctx.user.email;
      if (!userEmail) return { charges: [] };

      const conditions = [
        eq(bpoCharges.clientEmail, userEmail),
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
      }

      const rows = await db
        .select()
        .from(bpoCharges)
        .where(and(...conditions))
        .orderBy(bpoCharges.dueDate);

      return { charges: rows };
    }),
});
