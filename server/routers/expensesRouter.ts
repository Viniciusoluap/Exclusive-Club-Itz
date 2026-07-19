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
 * Classifica automaticamente uma despesa com base em palavras-chave na descrição.
 * Retorna o centro de custo mais adequado.
 */
function autoClassify(description: string): string {
  const d = description.toLowerCase();

  // Taxas Asaas (robô de voz, WhatsApp, SMS, notificação)
  if (
    d.includes("taxa de notificação") ||
    d.includes("taxa de cobrança") ||
    d.includes("taxa de serviço") ||
    d.includes("taxa de transferência") ||
    d.includes("taxa de saque") ||
    d.includes("taxa de pix") ||
    d.includes("taxa de ted") ||
    d.includes("taxa de doc") ||
    d.includes("taxa de boleto") ||
    d.includes("taxa de antecipação") ||
    d.includes("taxa de operação") ||
    d.includes("taxa de manutenção") ||
    d.includes("taxa") ||
    d.includes("fee") ||
    d.includes("tarifa") ||
    d.includes("mensalidade asaas") ||
    d.includes("asaas")
  ) return "operational";

  // Salários
  if (
    d.includes("salário") || d.includes("salario") ||
    d.includes("folha") || d.includes("pagamento funcionário") ||
    d.includes("pagamento funcionario") || d.includes("remuneração") ||
    d.includes("remuneracao") || d.includes("holerite")
  ) return "salary";

  // Pró-labore
  if (
    d.includes("pró-labore") || d.includes("pro labore") ||
    d.includes("prolabore") || d.includes("pro-labore") ||
    d.includes("pró labore")
  ) return "pro_labore";

  // Aluguel
  if (
    d.includes("aluguel") || d.includes("locação") ||
    d.includes("locacao") || d.includes("arrendamento") ||
    d.includes("aluguer") || d.includes("locação de espaço")
  ) return "rent";

  // Combustível
  if (
    d.includes("combustível") || d.includes("combustivel") ||
    d.includes("abastecimento") || d.includes("gasolina") ||
    d.includes("diesel") || d.includes("etanol") || d.includes("gnv")
  ) return "fuel_operational";

  // Reparos / Manutenção
  if (
    d.includes("reparo") || d.includes("manutenção") ||
    d.includes("manutencao") || d.includes("conserto") ||
    d.includes("revisão") || d.includes("revisao") ||
    d.includes("peça") || d.includes("peca") ||
    d.includes("troca de") || d.includes("instalação") ||
    d.includes("instalacao") || d.includes("bomba") ||
    d.includes("motor") || d.includes("mecânico") ||
    d.includes("mecanico")
  ) return "repair";

  // Site / tecnologia / marketing
  if (
    d.includes("site") || d.includes("manus") ||
    d.includes("marketing") || d.includes("publicidade") ||
    d.includes("tecnologia") || d.includes("software") ||
    d.includes("sistema") || d.includes("domínio") ||
    d.includes("dominio") || d.includes("hospedagem")
  ) return "operational";

  return "other";
}

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
    // Filtros legados de mês/ano — sem filtro = tudo a partir de 2025-01-01
    if (month && month !== "all_months") {
      conds.push(`MONTH(due_date) = ${parseInt(month)}`);
    }
    if (year && year !== "all_years") {
      conds.push(`YEAR(due_date) = ${parseInt(year)}`);
    } else if (!month || month === "all_months") {
      // Sem filtro de ano nem mês: mostrar tudo a partir de 2025
      conds.push(`due_date >= '2025-01-01'`);
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
        month: z.string().optional(),
        year: z.string().optional(),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

      const conditions: string[] = [];

      if (costCenter !== "all") {
        conditions.push(`cost_center = '${costCenter}'`);
      }

      if (status === "overdue") {
        conditions.push(`(status = 'overdue' OR (status = 'pending' AND due_date < CURDATE()))`);
      } else if (status === "pending") {
        conditions.push(`(status = 'pending' AND due_date >= CURDATE())`);
      } else if (status !== "all") {
        conditions.push(`status = '${status}'`);
      }

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
          source_type,
          manually_classified,
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

      // Contar total sem paginação
      const countResult = await db.execute(sql.raw(`
        SELECT COUNT(*) as total FROM expense_records ${whereClause}
      `)) as any;
      const total = parseInt(((Array.isArray(countResult[0]) ? countResult[0] : countResult)[0] as any)?.total ?? "0");

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
          sourceType: r.source_type ?? "manual",
          manuallyClassified: r.manually_classified === 1,
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
        repeatMonths: z.number().int().min(1).max(24).optional().default(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const baseDate = new Date(input.dueDate + 'T12:00:00Z');
      const count = input.repeatMonths ?? 1;
      let lastId: number | undefined;

      for (let i = 0; i < count; i++) {
        const d = new Date(baseDate);
        d.setUTCMonth(d.getUTCMonth() + i);
        const dueDate = d.toISOString().substring(0, 10);
        const result = await db.insert(expenseRecords).values({
          costCenter: input.costCenter,
          description: input.description,
          recipientName: input.recipientName ?? null,
          value: input.value.toFixed(2) as any,
          dueDate,
          paidDate: input.paidDate ?? null,
          status: input.status ?? "pending",
          asaasPaymentId: input.asaasPaymentId ?? null,
          sourceType: "manual",
          manuallyClassified: 1,
          notes: input.notes ?? null,
          createdBy: ctx.user?.id ?? null,
        } as any);
        if (i === 0) lastId = (result as any)[0]?.insertId;
      }

      return { success: true, id: lastId, count };
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

      if (fields.costCenter !== undefined) {
        updateData.costCenter = fields.costCenter;
        updateData.manuallyClassified = 1; // Marcar como classificado manualmente
      }
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
        .set({ status: "paid", paidDate: input.paidDate ?? today } as any)
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

  bulkDelete: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      for (const id of input.ids) {
        await db.delete(expenseRecords).where(eq(expenseRecords.id, id));
      }
      return { success: true, deleted: input.ids.length };
    }),

  // ── Classificação automática em lote ────────────────────────────────────
  autoClassify: adminProcedure
    .input(z.object({
      onlyUnclassified: z.boolean().optional().default(true),
    }).optional())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const onlyUnclassified = input?.onlyUnclassified ?? true;

      // Buscar despesas a classificar (pula as classificadas manualmente)
      const whereClause = onlyUnclassified
        ? `WHERE (manually_classified = 0 OR manually_classified IS NULL)`
        : `WHERE (manually_classified = 0 OR manually_classified IS NULL)`;

      const rows = await db.execute(sql.raw(`
        SELECT id, description FROM expense_records ${whereClause}
      `)) as any;

      const items = (Array.isArray(rows[0]) ? rows[0] : rows) as any[];
      let updated = 0;

      for (const item of items) {
        const newCostCenter = autoClassify(item.description ?? "");
        await db.execute(sql.raw(`
          UPDATE expense_records SET cost_center = '${newCostCenter}' WHERE id = ${item.id}
        `));
        updated++;
      }

      return { success: true, updated, total: items.length };
    }),

  // ── Importar do Asaas (transfers + taxas) ───────────────────────────────
  importFromAsaas: adminProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { resolveAsaasApiKey } = await import('../_core/asaas');
      const apiKey = await resolveAsaasApiKey();
      if (!apiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ASAAS_API_KEY não configurada.' });
      const apiUrl = apiKey.startsWith('$aact_prod_') ? 'https://api.asaas.com/v3' : 'https://sandbox.asaas.com/api/v3';

      let imported = 0;
      let skipped = 0;

      // ── Fonte 1: Transferências (PIX/TED saídos) ──────────────────────
      {
        let offset = 0;
        const limit = 100;
        while (true) {
          const res = await fetch(
            `${apiUrl}/transfers?startDate=2025-01-01&limit=${limit}&offset=${offset}`,
            { headers: { 'access_token': apiKey } }
          );
          if (!res.ok) break;
          const data = await res.json();
          const items: any[] = data.data || [];
          if (items.length === 0) break;

          for (const tx of items) {
            if (tx.status === 'CANCELLED' || tx.status === 'FAILED') continue;

            const txId = `transfer_${tx.id}`;
            const existing = await db.execute(sql.raw(`SELECT id FROM expense_records WHERE asaas_payment_id = '${txId}' LIMIT 1`)) as any;
            const rows = Array.isArray(existing[0]) ? existing[0] : existing;
            if (rows.length > 0) { skipped++; continue; }

            const desc = tx.description || tx.operationType || 'Transferência Asaas';
            const costCenter = autoClassify(desc);
            const dateStr = (tx.dateCreated || tx.scheduledDate || new Date().toISOString()).split('T')[0];
            const value = Math.abs(tx.value || tx.netValue || 0);
            if (value <= 0) continue;

            await db.execute(sql.raw(`
              INSERT INTO expense_records (cost_center, description, recipient_name, value, due_date, paid_date, status, asaas_payment_id, source_type, manually_classified, created_at, updated_at)
              VALUES (
                '${costCenter}',
                ${JSON.stringify(desc)},
                ${tx.bankAccount?.bank?.name ? JSON.stringify(tx.bankAccount.bank.name) : 'NULL'},
                ${value},
                '${dateStr}',
                '${dateStr}',
                'paid',
                '${txId}',
                'transfer',
                0,
                NOW(),
                NOW()
              )
            `));
            imported++;
          }

          if (items.length < limit) break;
          offset += limit;
        }
      }

      // ── Fonte 2: Taxas Asaas (financialTransactions DEBIT) ────────────
      {
        // Tipos que são taxas operacionais do Asaas (não cobranças de clientes)
        const FEE_TYPES = new Set([
          'PHONE_CALL_NOTIFICATION_FEE',
          'INSTANT_TEXT_MESSAGE_FEE',
          'SMS_FEE',
          'WHATSAPP_FEE',
          'NOTIFICATION_FEE',
          'MONTHLY_FEE',
          'PAYMENT_FEE',
          'TRANSFER_FEE',
          'ANTICIPATION_FEE',
          'CREDIT_CARD_FEE',
          'BANK_SLIP_FEE',
          'PIX_FEE',
          'SUBSCRIPTION_FEE',
          'PLATFORM_FEE',
        ]);

        let offset = 0;
        const limit = 100;
        while (true) {
          const res = await fetch(
            `${apiUrl}/financialTransactions?type=DEBIT&startDate=2025-01-01&limit=${limit}&offset=${offset}`,
            { headers: { 'access_token': apiKey } }
          );
          if (!res.ok) break;
          const data = await res.json();
          const items: any[] = data.data || [];
          if (items.length === 0) break;

          for (const tx of items) {
            // Só importar taxas — ignorar débitos que são cobranças de clientes
            if (!FEE_TYPES.has(tx.type)) continue;

            const txId = `fee_${tx.id}`;
            const existing = await db.execute(sql.raw(`SELECT id FROM expense_records WHERE asaas_payment_id = '${txId}' LIMIT 1`)) as any;
            const rows = Array.isArray(existing[0]) ? existing[0] : existing;
            if (rows.length > 0) { skipped++; continue; }

            const desc = tx.description || `Taxa Asaas: ${tx.type}`;
            const dateStr = (tx.date || new Date().toISOString()).split('T')[0];
            const value = Math.abs(tx.value || 0);
            if (value <= 0) continue;

            await db.execute(sql.raw(`
              INSERT INTO expense_records (cost_center, description, recipient_name, value, due_date, paid_date, status, asaas_payment_id, source_type, manually_classified, created_at, updated_at)
              VALUES (
                'operational',
                ${JSON.stringify(desc)},
                'Asaas',
                ${value},
                '${dateStr}',
                '${dateStr}',
                'paid',
                '${txId}',
                'fee',
                0,
                NOW(),
                NOW()
              )
            `));
            imported++;
          }

          if (items.length < limit) break;
          offset += limit;
        }
      }

      return { success: true, imported, skipped };
    }),
});
