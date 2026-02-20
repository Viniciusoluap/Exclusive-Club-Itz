import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { subscriptions, subscriptionCharges, allowedClients } from "../../drizzle/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { createPixCharge, listCustomerCharges, getOrCreateAsaasCustomer, mapAsaasStatus } from "../_core/asaasService";
import { TRPCError } from "@trpc/server";

export const saasRouter = router({
  // Listar todas as mensalidades
  list: adminProcedure
    .input(z.object({
      status: z.enum(["active", "paused", "cancelled", "all"]).optional().default("all"),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      let query = db.select({
        subscription: subscriptions,
        client: allowedClients,
      })
      .from(subscriptions)
      .leftJoin(allowedClients, eq(subscriptions.clientId, allowedClients.id))
      .orderBy(desc(subscriptions.createdAt));

      const results = await query;

      // Filtrar por status se não for "all"
      if (input?.status && input.status !== "all") {
        return results.filter(r => r.subscription.status === input.status);
      }

      return results;
    }),

  // Obter uma mensalidade específica
  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const result = await db.select({
        subscription: subscriptions,
        client: allowedClients,
      })
      .from(subscriptions)
      .leftJoin(allowedClients, eq(subscriptions.clientId, allowedClients.id))
      .where(eq(subscriptions.id, input.id))
      .limit(1);

      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Mensalidade não encontrada" });
      }

      return result[0];
    }),

  // Criar nova mensalidade
  create: adminProcedure
    .input(z.object({
      clientId: z.number(),
      type: z.enum(["monthly", "quota_sale"]),
      value: z.number().positive(),
      dueDay: z.number().min(1).max(31),
      startDate: z.string(),
      endDate: z.string().optional(),
      yearlyAdjustment: z.enum(["manual", "ipca", "igpm"]).optional().default("manual"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verificar se cliente existe
      const client = await db.select().from(allowedClients).where(eq(allowedClients.id, input.clientId)).limit(1);
      if (client.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
      }

      // Criar mensalidade
      const [subscription] = await db.insert(subscriptions).values({
        clientId: input.clientId,
        type: input.type,
        value: input.value.toString(),
        dueDay: input.dueDay,
        startDate: input.startDate,
        endDate: input.endDate || null,
        status: "active",
        yearlyAdjustment: input.yearlyAdjustment,
      });

      return { id: subscription.insertId, success: true };
    }),

  // Atualizar mensalidade
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      value: z.number().positive().optional(),
      dueDay: z.number().min(1).max(31).optional(),
      endDate: z.string().optional(),
      status: z.enum(["active", "paused", "cancelled"]).optional(),
      yearlyAdjustment: z.enum(["manual", "ipca", "igpm"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const updateData: any = {};
      if (input.value !== undefined) updateData.value = input.value.toString();
      if (input.dueDay !== undefined) updateData.dueDay = input.dueDay;
      if (input.endDate !== undefined) updateData.endDate = input.endDate;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.yearlyAdjustment !== undefined) updateData.yearlyAdjustment = input.yearlyAdjustment;

      await db.update(subscriptions).set(updateData).where(eq(subscriptions.id, input.id));

      return { success: true };
    }),

  // Cancelar mensalidade
  cancel: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db.update(subscriptions).set({
        status: "cancelled",
        endDate: new Date().toISOString(),
      }).where(eq(subscriptions.id, input.id));

      return { success: true };
    }),

  // Dashboard de inadimplência
  getInvoiceDashboard: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Buscar todas as cobranças do mês atual
    const charges = await db.select().from(subscriptionCharges);

    const totalPending = charges
      .filter(c => c.status === "pending")
      .reduce((sum, c) => sum + parseFloat(c.value), 0);

    const totalPaid = charges
      .filter(c => c.status === "paid")
      .reduce((sum, c) => sum + parseFloat(c.value), 0);

    const totalOverdue = charges
      .filter(c => c.status === "overdue")
      .reduce((sum, c) => sum + parseFloat(c.value), 0);

    const pendingCount = charges.filter(c => c.status === "pending").length;
    const paidCount = charges.filter(c => c.status === "paid").length;
    const overdueCount = charges.filter(c => c.status === "overdue").length;

    return {
      totalPending,
      totalPaid,
      totalOverdue,
      pendingCount,
      paidCount,
      overdueCount,
      totalExpected: totalPending + totalPaid + totalOverdue,
    };
  }),

  // Listar cobranças de uma mensalidade
  getCharges: adminProcedure
    .input(z.object({
      subscriptionId: z.number().optional(),
      status: z.enum(["pending", "paid", "overdue", "cancelled", "all"]).optional().default("all"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      let query = db.select({
        charge: subscriptionCharges,
        subscription: subscriptions,
        client: allowedClients,
      })
      .from(subscriptionCharges)
      .leftJoin(subscriptions, eq(subscriptionCharges.subscriptionId, subscriptions.id))
      .leftJoin(allowedClients, eq(subscriptions.clientId, allowedClients.id))
      .orderBy(desc(subscriptionCharges.dueDate));

      const results = await query;

      // Filtrar por subscription_id se fornecido
      let filtered = results;
      if (input.subscriptionId) {
        filtered = filtered.filter(r => r.subscription?.id === input.subscriptionId);
      }

      // Filtrar por status se não for "all"
      if (input.status && input.status !== "all") {
        filtered = filtered.filter(r => r.charge.status === input.status);
      }

      return filtered;
    }),

  // Sincronizar com Asaas (buscar cobranças de todos os clientes)
  syncWithAsaas: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Buscar todos os clientes ativos com mensalidades
    const activeSubscriptions = await db.select({
      subscription: subscriptions,
      client: allowedClients,
    })
    .from(subscriptions)
    .leftJoin(allowedClients, eq(subscriptions.clientId, allowedClients.id))
    .where(eq(subscriptions.status, "active"));

    let syncedCount = 0;
    let errorCount = 0;
    let unclassifiedCount = 0;
    const unclassifiedCharges: Array<{ description: string; value: number; dueDate: string; clientName: string }> = [];

    for (const { subscription, client } of activeSubscriptions) {
      if (!client) continue;

      try {
        // Buscar ou criar cliente no Asaas
        const asaasCustomer = await getOrCreateAsaasCustomer({
          email: client.email,
          name: client.name,
          cpfCnpj: client.cpf,
          phone: client.phone || undefined,
        });

        // Buscar todas as cobranças do cliente no Asaas
        const asaasCharges = await listCustomerCharges(asaasCustomer.id);

        for (const asaasCharge of asaasCharges) {
          // Classificar cobrança: mensalidade vs venda de cota
          const description = asaasCharge.description?.toLowerCase() || "";
          let chargeType: "monthly" | "quota_sale" | null = null;

          if (description.includes("mensalidade") || description.includes("monthly")) {
            chargeType = "monthly";
          } else if (description.includes("cota") || description.includes("quota") || description.includes("venda")) {
            chargeType = "quota_sale";
          }

          // Se não conseguir classificar, adiciona à lista de não classificadas
          if (!chargeType) {
            unclassifiedCount++;
            unclassifiedCharges.push({
              description: asaasCharge.description || "Sem descrição",
              value: asaasCharge.value,
              dueDate: asaasCharge.dueDate,
              clientName: client.name,
            });
            continue;
          }

          // Verificar se cobrança já existe no banco
          const existingCharge = await db.select()
            .from(subscriptionCharges)
            .where(eq(subscriptionCharges.asaasPaymentId, asaasCharge.id))
            .limit(1);

          if (existingCharge.length === 0) {
            // Criar nova cobrança
            await db.insert(subscriptionCharges).values({
              subscriptionId: subscription.id,
              dueDate: asaasCharge.dueDate,
              value: asaasCharge.value.toString(),
              status: mapAsaasStatus(asaasCharge.status) as any,
              asaasPaymentId: asaasCharge.id,
              paymentDate: asaasCharge.paymentDate || null,
            });
            syncedCount++;
          } else {
            // Atualizar status da cobrança existente
            await db.update(subscriptionCharges)
              .set({
                status: mapAsaasStatus(asaasCharge.status) as any,
                paymentDate: asaasCharge.paymentDate || null,
              })
              .where(eq(subscriptionCharges.id, existingCharge[0].id));
            syncedCount++;
          }
        }
      } catch (error) {
        errorCount++;
        console.error(`Erro ao sincronizar cliente ${client.name}:`, error);
      }
    }

    return {
      syncedCount,
      errorCount,
      unclassifiedCount,
      unclassifiedCharges: unclassifiedCount > 0 ? unclassifiedCharges : undefined,
      success: true,
    };
  }),
});
