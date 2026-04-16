import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { expenseRecords } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// Labels legíveis para centros de custo
export const COST_CENTER_LABELS: Record<string, string> = {
  salary: "Salários",
  rent: "Aluguéis",
  pro_labore: "Pró-labore",
  fuel_operational: "Abastecimentos",
  repair: "Reparos",
  operational: "Custo Operacional",
  other: "Outros",
};

const COST_CENTERS = [
  "salary",
  "rent",
  "pro_labore",
  "fuel_operational",
  "repair",
  "operational",
  "other",
] as const;

const STATUSES = ["pending", "paid", "overdue", "cancelled"] as const;

/**
 * Constrói as condições de filtro de data.
 * Prioridade: dateFrom/dateTo > month+year > year > month
 */
function buildDateConditions(opts: {
  dateFrom?: string;
  dateTo?: string;
  month?: string;
  year?: string;
}): string[] {
  const { dateFrom, dateTo, month, year } = opts;
  const conds: string[] = [];

  if (dateFrom && dateTo) {
    // Período customizado tem prioridade máxima
    const from = dateFrom.replace(/'/g, "''");
    const to = dateTo.replace(/'/g, "''");
    conds.push(`due_date >= '${from}' AND due_date <= '${to}'`);
  } else if (dateFrom) {
    const from = dateFrom.replace(/'/g, "''");
    conds.push(`due_date >= '${from}'`);
  } else if (dateTo) {
    const to = dateTo.replace(/'/g, "''");
    conds.push(`due_date <= '${to}'`);
  } else {
    // Filtros legados de mês/ano
    if (month && month !== "all_months") {
      conds.push(`MONTH(due_date) = ${parseInt(month)}`);
    }
    if (year && year !== "all_years") {
      conds.push(`YEAR(due_date) = ${parseInt(year)}`);
    }
  }

  return conds;
}

export const expensesRouter = router({
  // ── Listar despesas com filtros ──────────────────────────────────────────
  list: adminProcedure
    .input(
      z.object({
        costCenter: z.enum([...COST_CENTERS, "all"]).optional().default("all"),
        status: z.enum([...STATUSES, "all"]).optional().default("all"),
        month: z.string().optional(),    // "01" a "12" (legado)
        year: z.string().optional(),     // "2025" (legado)
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // "2025-01-01"
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),   // "2025-12-31"
        search: z.string().optional(),
        limit: z.number().optional().default(100),
        offset: z.number().optional().default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const costCenter = input?.costCenter ?? "all";
      const status = input?.status ?? "all";
      const month = input?.month;
      const year = input?.year;
      const dateFrom = input?.dateFrom;
      const dateTo = input?.dateTo;
      const search = input?.search;
      const limit = input?.limit ?? 100;
      const offset = input?.offset ?? 0;

      // Construir query com filtros dinâmicos
      const conditions: string[] = [];

      if (costCenter !== "all") {
        conditions.push(`cost_center = '${costCenter}'`);
      }

      // Status com normalização dinâmica de overdue
      if (status === "overdue") {
        conditions.push(`(status = 'overdue' OR (status = 'pending' AND due_date < CURDATE()))`);
      } else if (status === "pending") {
        conditions.push(`(status = 'pending' AND due_date >= CURDATE())`);
      } else if (status !== "all") {
        conditions.push(`status = '${status}'`);
      }

      // Filtros de data (período customizado tem prioridade sobre mês/ano)
      const dateConds = buildDateConditions({ dateFrom, dateTo, month, year });
      conditions.push(...dateConds);

      if (search && search.trim()) {
        const s = search.replace(/'/g, "''");
        conditions.push(`(description LIKE '%${s}%' OR recipient_name LIKE '%${s}%')`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const rawResult = await db.execute(sql.raw(`
        SELECT
          id,
          cost_center,
          description,
          recipient_name,
          CAST(value AS DECIMAL(10,2)) as value,
          due_date,
          paid_date,
          CASE
            WHEN status = 'pending' AND due_date < CURDATE() THEN 'overdue'
            ELSE status
          END as status,
          asaas_payment_id,
          notes,
          created_by,
          created_at,
          updated_at
        FROM expense_records
        ${whereClause}
        ORDER BY due_date DESC
        LIMIT ${limit} OFFSET ${offset}
      `));

      const rows = ((rawResult[0] as unknown as any[]) ?? []) as any[];
      const total = rows.length;

      return {
        items: rows.map((r: any) => ({
          id: r.id,
          costCenter: r.cost_center as string,
          costCenterLabel: COST_CENTER_LABELS[r.cost_center] ?? r.cost_center,
          description: r.description,
          recipientName: r.recipient_name,
          value: parseFloat(r.value ?? "0"),
          dueDate: r.due_date,
          paidDate: r.paid_date,
          status: r.status as string,
          asaasPaymentId: r.asaas_payment_id,
          notes: r.notes,
          createdBy: r.created_by,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
        total,
      };
    }),

  // ── Totais por status (cards) ────────────────────────────────────────────
  stats: adminProcedure
    .input(
      z.object({
        month: z.string().optional(),
        year: z.string().optional(),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        costCenter: z.enum([...COST_CENTERS, "all"]).optional().default("all"),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { month, year, dateFrom, dateTo, costCenter = "all" } = input ?? {};
      const conditions: string[] = [];

      if (costCenter !== "all") {
        conditions.push(`cost_center = '${costCenter}'`);
      }

      // Filtros de data
      const dateConds = buildDateConditions({ dateFrom, dateTo, month, year });
      conditions.push(...dateConds);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const statsResult = await db.execute(sql.raw(`
        SELECT
          SUM(CASE WHEN status = 'paid' THEN CAST(value AS DECIMAL(10,2)) ELSE 0 END) as total_paid,
          SUM(CASE WHEN status = 'pending' AND due_date >= CURDATE() THEN CAST(value AS DECIMAL(10,2)) ELSE 0 END) as total_pending,
          SUM(CASE WHEN status = 'overdue' OR (status = 'pending' AND due_date < CURDATE()) THEN CAST(value AS DECIMAL(10,2)) ELSE 0 END) as total_overdue,
          SUM(CAST(value AS DECIMAL(10,2))) as total_all,
          COUNT(*) as count_all,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as count_paid,
          SUM(CASE WHEN status = 'pending' AND due_date >= CURDATE() THEN 1 ELSE 0 END) as count_pending,
          SUM(CASE WHEN status = 'overdue' OR (status = 'pending' AND due_date < CURDATE()) THEN 1 ELSE 0 END) as count_overdue
        FROM expense_records
        ${whereClause}
      `));

      const row = ((statsResult[0] as unknown as any[]) ?? [])[0] ?? {};

      // Totais por centro de custo
      const byCostCenterResult = await db.execute(sql.raw(`
        SELECT
          cost_center,
          SUM(CAST(value AS DECIMAL(10,2))) as total,
          COUNT(*) as count
        FROM expense_records
        ${whereClause}
        GROUP BY cost_center
        ORDER BY total DESC
      `));

      const byCostCenter = ((byCostCenterResult[0] as unknown as any[]) ?? []) as any[];

      return {
        totalAll: parseFloat(row.total_all ?? "0"),
        totalPaid: parseFloat(row.total_paid ?? "0"),
        totalPending: parseFloat(row.total_pending ?? "0"),
        totalOverdue: parseFloat(row.total_overdue ?? "0"),
        countAll: parseInt(row.count_all ?? "0"),
        countPaid: parseInt(row.count_paid ?? "0"),
        countPending: parseInt(row.count_pending ?? "0"),
        countOverdue: parseInt(row.count_overdue ?? "0"),
        byCostCenter: byCostCenter.map((r: any) => ({
          costCenter: r.cost_center as string,
          label: COST_CENTER_LABELS[r.cost_center] ?? r.cost_center,
          total: parseFloat(r.total ?? "0"),
          count: parseInt(r.count ?? "0"),
        })),
      };
    }),

  // ── Criar despesa ────────────────────────────────────────────────────────
  create: adminProcedure
    .input(
      z.object({
        costCenter: z.enum(COST_CENTERS),
        description: z.string().min(1),
        recipientName: z.string().optional(),
        value: z.number().positive(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        status: z.enum(STATUSES).optional().default("pending"),
        asaasPaymentId: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const result = await db.insert(expenseRecords).values({
        costCenter: input.costCenter,
        description: input.description,
        recipientName: input.recipientName ?? null,
        value: input.value.toFixed(2) as any,
        dueDate: input.dueDate,
        paidDate: input.paidDate ?? null,
        status: input.status ?? "pending",
        asaasPaymentId: input.asaasPaymentId ?? null,
        notes: input.notes ?? null,
        createdBy: ctx.user?.id ?? null,
      });

      return { success: true, id: (result as any)[0]?.insertId };
    }),

  // ── Editar despesa ───────────────────────────────────────────────────────
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        fields: z.object({
          costCenter: z.enum(COST_CENTERS).optional(),
          description: z.string().min(1).optional(),
          recipientName: z.string().optional().nullable(),
          value: z.number().positive().optional(),
          dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
          status: z.enum(STATUSES).optional(),
          asaasPaymentId: z.string().optional().nullable(),
          notes: z.string().optional().nullable(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { id, fields } = input;
      const updateData: Record<string, any> = {};

      if (fields.costCenter !== undefined) updateData.costCenter = fields.costCenter;
      if (fields.description !== undefined) updateData.description = fields.description;
      if (fields.recipientName !== undefined) updateData.recipientName = fields.recipientName;
      if (fields.value !== undefined) updateData.value = fields.value.toFixed(2);
      if (fields.dueDate !== undefined) updateData.dueDate = fields.dueDate;
      if (fields.paidDate !== undefined) updateData.paidDate = fields.paidDate;
      if (fields.status !== undefined) updateData.status = fields.status;
      if (fields.asaasPaymentId !== undefined) updateData.asaasPaymentId = fields.asaasPaymentId;
      if (fields.notes !== undefined) updateData.notes = fields.notes;

      if (Object.keys(updateData).length === 0) {
        return { success: true };
      }

      await db.update(expenseRecords).set(updateData).where(eq(expenseRecords.id, id));
      return { success: true };
    }),

  // ── Dar baixa manual ─────────────────────────────────────────────────────
  markAsPaid: adminProcedure
    .input(
      z.object({
        id: z.number(),
        paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const today = new Date().toISOString().split("T")[0];
      await db.update(expenseRecords)
        .set({ status: "paid", paidDate: input.paidDate ?? today })
        .where(eq(expenseRecords.id, input.id));

      return { success: true };
    }),

  // ── Excluir despesa ──────────────────────────────────────────────────────
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db.delete(expenseRecords).where(eq(expenseRecords.id, input.id));
      return { success: true };
    }),

  importFromAsaas: adminProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Usar getOrCreateCustomer do asaas.ts que expõe getAsaasApiKey/Url internamente
      // Replicar lógica de busca de chave diretamente
      const { getSetting } = await import('../systemSettings');
      const keyFromDb = await getSetting('asaas_api_key');
      const apiKey = keyFromDb || process.env.ASAAS_API_KEY || '';
      if (!apiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ASAAS_API_KEY não configurada. Configure em /admin/configuracoes' });
      const apiUrl = apiKey.startsWith('$aact_prod_') ? 'https://api.asaas.com/v3' : 'https://sandbox.asaas.com/api/v3';

      // Buscar transações DEBIT a partir de 01/01/2025
      const response = await fetch(
        `${apiUrl}/financialTransactions?type=DEBIT&startDate=2025-01-01&limit=100`,
        { headers: { 'access_token': apiKey } }
      );

      if (!response.ok) {
        const err = await response.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao buscar transações do Asaas: ${err}` });
      }

      const data = await response.json();
      const transactions: any[] = data.data || [];

      let imported = 0;
      for (const tx of transactions) {
        // Verificar se já existe (deduplicação por asaasPaymentId)
        const existing = await db.execute(sql`
          SELECT id FROM expense_records WHERE asaas_payment_id = ${tx.id} LIMIT 1
        `) as any;
        const rows = Array.isArray(existing[0]) ? existing[0] : existing;
        if (rows.length > 0) continue;

        // Classificar automaticamente por descrição
        let costCenter: string = 'operational';
        const desc = (tx.description || '').toLowerCase();
        if (desc.includes('salário') || desc.includes('salario') || desc.includes('folha')) costCenter = 'salary';
        else if (desc.includes('aluguel') || desc.includes('locação') || desc.includes('locacao')) costCenter = 'rent';
        else if (desc.includes('pró-labore') || desc.includes('pro labore') || desc.includes('prolabore')) costCenter = 'pro_labore';
        else if (desc.includes('combustível') || desc.includes('combustivel') || desc.includes('abastecimento')) costCenter = 'fuel_operational';
        else if (desc.includes('reparo') || desc.includes('manutenção') || desc.includes('manutencao')) costCenter = 'repair';

        await db.execute(sql`
          INSERT INTO expense_records (cost_center, description, recipient_name, value, due_date, status, asaas_payment_id, created_at, updated_at)
          VALUES (
            ${costCenter},
            ${tx.description || 'Transação Asaas'},
            ${tx.description || ''},
            ${Math.abs(tx.value || 0)},
            ${tx.date || new Date().toISOString().split('T')[0]},
            'paid',
            ${tx.id},
            NOW(),
            NOW()
          )
        `);
        imported++;
      }

      return { success: true, imported, total: transactions.length };
    }),
});
