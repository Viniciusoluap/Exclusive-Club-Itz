/**
 * BPO Router — Fonte única de verdade do BPO Financeiro
 * 
 * Gerencia a tabela bpo_charges que substitui subscription_charges +
 * unclassified_charges como base dos cards de totais e lista de cobranças.
 */
import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { bpoCharges, allowedClients as acTable } from "../../drizzle/schema";
import { eq, sql, and, gte, lte, inArray } from "drizzle-orm";import { listAllAsaasCharges, getChargeStatus, listAllAsaasCustomers, createPixCharge, getOrCreateAsaasCustomer, cancelCharge, receiveInCash } from "../_core/asaasService";// ============================================================
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
          conditions.push(`MONTH(due_date) = ${parseInt(monthFilter)}`);
        }
      } else if (yearFilter) {
        conditions.push(`due_date LIKE '${yearFilter}-%'`);
      }
      // Se não há filtro de data, retorna TODOS os registros

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

    // 3. Classificação automática por palavras-chave
    const autoClassify = (description: string | null, externalRef: string | null): {
      type: "monthly" | "quota_sale" | "fuel" | "repair" | "other";
      classifiedBy: "auto" | "unclassified";
    } => {
      const text = `${description || ""} ${externalRef || ""}`.toLowerCase();
      if (/mensalidade|cota|quota|parcela|contrato|assinatura|subscription/.test(text)) {
        return { type: "monthly", classifiedBy: "auto" };
      }
      if (/abastecimento|combustivel|gasolina|litros|fuel|tanque/.test(text)) {
        return { type: "fuel", classifiedBy: "auto" };
      }
      if (/vistoria|reparo|dano|avaria|reprovacao|conserto|manutencao/.test(text)) {
        return { type: "repair", classifiedBy: "auto" };
      }
      if (/venda|quota_sale|aquisicao|compra.*cota|cota.*compra/.test(text)) {
        return { type: "quota_sale", classifiedBy: "auto" };
      }
      return { type: "other", classifiedBy: "unclassified" };
    }

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
          const { type, classifiedBy } = autoClassify(charge.description ?? null, charge.externalReference ?? null);

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
            syncedAt: new Date(),
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
  // ============================================================
  manualClassify: adminProcedure
    .input(z.object({
      chargeId: z.number(),
      type: z.enum(["monthly", "quota_sale", "fuel", "repair", "other"]),
      clientEmail: z.string().email().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const updateData: Record<string, any> = {
        type: input.type,
        classifiedBy: "manual",
      };

      if (input.clientEmail) {
        updateData.clientEmail = input.clientEmail;
        const { allowedClients: acTable } = await import("../../drizzle/schema");
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

      return { success: true };
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
        fuel: "Abastecimentos", repair: "Reparos", other: "Outros",
      };
      const COST_CENTER_LABELS: Record<string, string> = {
        salary: "Salários", rent: "Aluguéis", pro_labore: "Pró-labore",
        fuel_operational: "Abastecimentos (Op.)", repair: "Reparos",
        operational: "Custo Operacional", other: "Outros",
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

      const charges = await db.select().from(bpoCharges)
        .where(and(
          eq(bpoCharges.classifiedBy, "unclassified"),
          gte(bpoCharges.dueDate, "2025-01-01")
        ))
        .orderBy(bpoCharges.dueDate)
        .limit(input.limit)
        .offset(input.offset);

      const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(bpoCharges)
        .where(and(
          eq(bpoCharges.classifiedBy, "unclassified"),
          gte(bpoCharges.dueDate, "2025-01-01")
        ));

      return { charges, total: countResult?.count ?? 0 };
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

      const totalInstallments = input.type === "quota_sale" ? (input.installments ?? 1) : 1;
      const installmentValue = totalInstallments > 1
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
        const descLabel = totalInstallments > 1
          ? `${typeLabel[input.type]} - Parcela ${i + 1}/${totalInstallments} - ${client.name}`
          : input.description || `${typeLabel[input.type]} - ${String(parcelMonth).padStart(2, "0")}/${parcelYear} - ${client.name}`;

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
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const existing = await db.select().from(bpoCharges)
        .where(eq(bpoCharges.id, input.chargeId)).limit(1);
      if (existing.length === 0) {
        throw new Error("Cobrança não encontrada");
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
          updatedAt: new Date(),
        })
        .where(eq(bpoCharges.id, input.chargeId));

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
          updatedAt: new Date(),
        })
        .where(eq(bpoCharges.id, input.chargeId));

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
  // ============================================================
  splitPayment: adminProcedure
    .input(z.object({
      pixValue: z.number(),           // Valor total do PIX recebido
      asaasChargeId: z.string().optional(), // ID do PIX no Asaas
      paymentDate: z.string().optional(),
      splits: z.array(z.object({
        chargeId: z.number(),         // ID da bpo_charge a quitar
        amount: z.number(),           // Valor a alocar nesta cobrança
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Validar: soma dos splits não pode exceder o valor do PIX
      const totalAllocated = input.splits.reduce((sum, s) => sum + s.amount, 0);
      if (totalAllocated > input.pixValue + 0.01) {
        throw new Error(
          `Soma dos valores (R$ ${totalAllocated.toFixed(2)}) excede o PIX (R$ ${input.pixValue.toFixed(2)})`
        );
      }

      const paymentDate = input.paymentDate || new Date().toISOString().split('T')[0];
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

        // Atualizar paymentLinks
        let paymentLinks: string[] = [];
        try { paymentLinks = charge.paymentLinks ? JSON.parse(charge.paymentLinks) : []; } catch { paymentLinks = []; }
        if (input.asaasChargeId && !paymentLinks.includes(input.asaasChargeId)) {
          paymentLinks.push(input.asaasChargeId);
        }

        const isPaid = newAmountPaid >= chargeValue - 0.01;
        const newStatus = isPaid ? "receivedInCash" : "partiallyPaid";
        const remaining = Math.max(0, chargeValue - newAmountPaid);

        await db.update(bpoCharges)
          .set({
            status: newStatus,
            amountPaid: newAmountPaid.toFixed(2),
            paymentLinks: JSON.stringify(paymentLinks),
            ...(isPaid ? { paidDate: paymentDate } : {}),
            updatedAt: new Date(),
          })
          .where(eq(bpoCharges.id, split.chargeId));

        results.push({
          chargeId: split.chargeId,
          status: isPaid ? "paid" : "partial",
          message: isPaid
            ? `Quitada (R$ ${newAmountPaid.toFixed(2)})`
            : `Parcial — Saldo: R$ ${remaining.toFixed(2)}`,
        });
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
    }),

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

      const [rows] = (await db.execute(sql.raw(`
        SELECT id, due_date as dueDate, value, amount_paid as amountPaid,
               status, type, description, asaas_charge_id as asaasChargeId
        FROM bpo_charges
        WHERE client_id = ${input.clientId}
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

      const autoClassify = (description: string | null, externalRef: string | null): {
        type: "monthly" | "quota_sale" | "fuel" | "repair" | "other";
        classifiedBy: "auto" | "unclassified";
      } => {
        const text = `${description || ""} ${externalRef || ""}`.toLowerCase();
        if (/mensalidade|cota|quota|parcela|contrato|assinatura|subscription/.test(text)) {
          return { type: "monthly", classifiedBy: "auto" };
        }
        if (/abastecimento|combustivel|gasolina|litros|fuel|tanque/.test(text)) {
          return { type: "fuel", classifiedBy: "auto" };
        }
        if (/vistoria|reparo|dano|avaria|reprovacao|conserto|manutencao/.test(text)) {
          return { type: "repair", classifiedBy: "auto" };
        }
        if (/venda|quota_sale|aquisicao|compra.*cota|cota.*compra/.test(text)) {
          return { type: "quota_sale", classifiedBy: "auto" };
        }
        return { type: "other", classifiedBy: "unclassified" };
      };

      let classified = 0;
      let unchanged = 0;

      for (const charge of charges) {
        const { type, classifiedBy } = autoClassify(charge.description, charge.externalReference);
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
});
