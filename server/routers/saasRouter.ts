import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { subscriptions, subscriptionCharges, allowedClients, clientQuotas, fuelRecords, inspectionCharges, excludedAsaasCharges, unclassifiedCharges, pixAllocations } from "../../drizzle/schema";
import { eq, and, or, gte, lte, desc, sql, inArray, ne } from "drizzle-orm";
import { createPixCharge, listCustomerCharges, getOrCreateAsaasCustomer, mapAsaasStatus, receiveInCash, cancelCharge, listAllAsaasCustomers, listAllAsaasCharges } from "../_core/asaasService";

// Mapear status do Asaas para enum de unclassified_charges
function mapAsaasStatusToUnclassified(asaasStatus: string): 'pending' | 'paid' | 'overdue' | 'cancelled' {
  switch (asaasStatus) {
    case 'PENDING':
    case 'AWAITING_PAYMENT':
    case 'AWAITING_RISK_ANALYSIS':
      return 'pending';
    case 'CONFIRMED':
    case 'RECEIVED':
    case 'RECEIVED_IN_CASH':
    case 'DUNNING_RECEIVED':
      return 'paid';
    case 'OVERDUE':
    case 'DUNNING_REQUESTED':
      return 'overdue';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
    case 'DELETED':
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'pending';
  }
}
import { TRPCError } from "@trpc/server";

export const saasRouter = router({
  // Listar cobranças individuais com filtros
  listCharges: adminProcedure
    .input(z.object({
      status: z.enum(["pending", "paid", "overdue", "cancelled", "partial", "all"]).optional().default("all"),
      type: z.enum(["monthly", "quota_sale", "fuel", "repair", "other"]).optional(), // Filtro por tipo (legado)
      types: z.array(z.enum(["monthly", "quota_sale", "fuel", "repair", "other"])).optional(), // Filtro por múltiplos tipos
      boatId: z.number().optional(), // Filtro por embarcação
      month: z.string().optional(), // "01" a "12"
      year: z.string().optional(), // "2024", "2025", etc
      search: z.string().optional(), // Busca por nome ou email
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      let query = db.select({
        charge: {
          id: subscriptionCharges.id,
          subscriptionId: subscriptionCharges.subscriptionId,
          asaasPaymentId: subscriptionCharges.asaasPaymentId,
          value: subscriptionCharges.value,
          dueDate: subscriptionCharges.dueDate,
          paidDate: subscriptionCharges.paidDate,
          status: subscriptionCharges.status,
          type: subscriptionCharges.type,
          createdAt: subscriptionCharges.createdAt,
          amountPaid: subscriptionCharges.amountPaid,
          paymentLinks: subscriptionCharges.paymentLinks,
        },
        subscription: {
          id: subscriptions.id,
          clientId: subscriptions.clientId,
          type: subscriptions.type,
          value: subscriptions.value,
          dueDay: subscriptions.dueDay,
          startDate: subscriptions.startDate,
          endDate: subscriptions.endDate,
          status: subscriptions.status,
          yearlyAdjustment: subscriptions.yearlyAdjustment,
          createdAt: subscriptions.createdAt,
          updatedAt: subscriptions.updatedAt,
        },
        client: {
          id: allowedClients.id,
          email: allowedClients.email,
          name: allowedClients.name,
          phone: allowedClients.phone,
          cpfCnpj: allowedClients.cpfCnpj,
          isActive: allowedClients.isActive,
          createdAt: allowedClients.createdAt,
          contractUrl: allowedClients.contractUrl,
          contract2Url: allowedClients.contract2Url,
          documentUrl: allowedClients.documentUrl,
        },
      })
      .from(subscriptionCharges)
      .leftJoin(subscriptions, eq(subscriptionCharges.subscriptionId, subscriptions.id))
      .leftJoin(allowedClients, eq(subscriptions.clientId, allowedClients.id))
      .orderBy(desc(subscriptionCharges.dueDate));

      let results = await query;

      // Normalizar status: pending com due_date passada → overdue
      const todayNorm = new Date();
      todayNorm.setHours(0, 0, 0, 0);
      results = results.map(r => {
        if (r.charge.status === 'pending' && r.charge.dueDate) {
          const due = new Date(r.charge.dueDate);
          due.setHours(0, 0, 0, 0);
          if (due < todayNorm) {
            return { ...r, charge: { ...r.charge, status: 'overdue' as const } };
          }
        }
        return r;
      });

      // Filtrar por status
      if (input?.status && input.status !== "all") {
        results = results.filter(r => r.charge.status === input.status);
      }

      // Filtrar por tipo (suporta array de tipos ou tipo único)
      const activeTypes = input?.types && input.types.length > 0 ? input.types : (input?.type ? [input.type] : null);
      if (activeTypes) {
        results = results.filter(r => {
          const chargeType = r.charge.type || r.subscription?.type;
          return chargeType && activeTypes.includes(chargeType as any);
        });
      }

      // Filtrar por embarcação (clientes que possuem cotas na embarcação)
      if (input?.boatId) {
        const clientsWithBoat = await db.select({ clientId: clientQuotas.clientId })
          .from(clientQuotas)
          .where(eq(clientQuotas.vesselId, input.boatId));
        
        const clientIds = clientsWithBoat.map(c => c.clientId);
        results = results.filter(r => r.subscription?.clientId && clientIds.includes(r.subscription.clientId));
      }

      // Filtrar por mês
      if (input?.month) {
        results = results.filter(r => {
          const dueDate = new Date(r.charge.dueDate);
          const month = String(dueDate.getMonth() + 1).padStart(2, '0');
          return month === input.month;
        });
      }

      // Filtrar por ano
      if (input?.year) {
        results = results.filter(r => {
          const dueDate = new Date(r.charge.dueDate);
          const year = String(dueDate.getFullYear());
          return year === input.year;
        });
      }

      // Filtrar por busca (nome ou email)
      if (input?.search) {
        const search = input.search.toLowerCase();
        results = results.filter(r => {
          const name = r.client?.name?.toLowerCase() || "";
          const email = r.client?.email?.toLowerCase() || "";
          return name.includes(search) || email.includes(search);
        });
      }

      return results;
    }),

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
      type: z.enum(["monthly", "quota_sale", "fuel", "repair", "other"]).optional(),
      value: z.number().positive(),
      dueDay: z.number().min(1).max(31),
      startMonth: z.string(), // formato YYYY-MM
      endDate: z.string().optional(),
      yearlyAdjustment: z.enum(["manual", "ipca", "igpm"]).optional().default("manual"),
      installments: z.number().min(1).max(36).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verificar se cliente existe
      const client = await db.select().from(allowedClients).where(eq(allowedClients.id, input.clientId)).limit(1);
      if (client.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
      }

      // Derivar startDate do startMonth (primeiro dia do mês)
      const [startYear, startMonthNum] = input.startMonth.split('-').map(Number);
      const startDate = `${input.startMonth}-01`;

      // Lógica universal da data da 1ª cobrança:
      // - Mês atual + dia já passou → data de hoje
      // - Mês atual + dia ainda não chegou → dia escolhido no mês atual
      // - Mês futuro → dia escolhido no mês futuro
      const today = new Date();
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth() + 1; // 1-indexed
      const todayDay = today.getDate();

      function getFirstChargeDueDate(year: number, month: number, dueDay: number): { asaasDate: string; localDate: string } {
        const isCurrentMonth = year === todayYear && month === todayMonth;
        const dayAlreadyPassed = isCurrentMonth && dueDay < todayDay;

        if (dayAlreadyPassed) {
          // Usar data de hoje para o Asaas, mas registrar o dia correto no banco
          const asaasDate = today.toISOString().split('T')[0];
          const localDate = `${String(year)}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
          return { asaasDate, localDate };
        } else {
          // Usar o dia escolhido normalmente
          const date = `${String(year)}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
          return { asaasDate: date, localDate: date };
        }
      }

      // Criar mensalidade
      const insertResult = await db.insert(subscriptions).values({
        clientId: input.clientId,
        type: input.type ?? "monthly",
        value: input.value.toString(),
        dueDay: input.dueDay,
        startDate: startDate,
        endDate: input.endDate || null,
        status: "active",
        yearlyAdjustment: input.yearlyAdjustment,
      });
      const subscriptionId = insertResult[0].insertId;

      // Criar cliente no Asaas
      const asaasCustomer = await getOrCreateAsaasCustomer({
        email: client[0].email,
        name: client[0].name,
        cpfCnpj: client[0].cpfCnpj ?? undefined,
        phone: client[0].phone ?? undefined,
      });

      const chargeType = input.type ?? "monthly";
      const typeLabel: Record<string, string> = {
        monthly: "Mensalidade",
        quota_sale: "Venda de Cota",
        fuel: "Abastecimento",
        repair: "Reparo",
        other: "Outros",
      };

      if (chargeType === "quota_sale" && input.installments && input.installments > 1) {
        // Venda de cota parcelada: criar N parcelas a partir do mês de início
        const installmentValue = Math.round((input.value / input.installments) * 100) / 100;

        for (let i = 0; i < input.installments; i++) {
          // Mês desta parcela (1-indexed)
          let parcelMonth = startMonthNum + i;
          let parcelYear = startYear;
          while (parcelMonth > 12) {
            parcelMonth -= 12;
            parcelYear += 1;
          }

          if (i === 0) {
            // 1ª parcela: aplicar regra de data
            const { asaasDate, localDate } = getFirstChargeDueDate(parcelYear, parcelMonth, input.dueDay);
            const asaasCharge = await createPixCharge({
              customerId: asaasCustomer.id,
              value: installmentValue,
              dueDate: asaasDate,
              description: `Venda de Cota - Parcela 1/${input.installments} - ${client[0].name}`,
            });
            await db.insert(subscriptionCharges).values({
              subscriptionId,
              asaasPaymentId: asaasCharge.id,
              value: installmentValue.toString(),
              dueDate: localDate,
              status: "pending",
              type: "quota_sale",
            });
          } else {
            // Demais parcelas: sempre usar o dia escolhido
            const dueDateStr = `${String(parcelYear)}-${String(parcelMonth).padStart(2, '0')}-${String(input.dueDay).padStart(2, '0')}`;
            const asaasCharge = await createPixCharge({
              customerId: asaasCustomer.id,
              value: installmentValue,
              dueDate: dueDateStr,
              description: `Venda de Cota - Parcela ${i + 1}/${input.installments} - ${client[0].name}`,
            });
            await db.insert(subscriptionCharges).values({
              subscriptionId,
              asaasPaymentId: asaasCharge.id,
              value: installmentValue.toString(),
              dueDate: dueDateStr,
              status: "pending",
              type: "quota_sale",
            });
          }
        }
      } else if (chargeType === "monthly") {
        // Mensalidade: criar cobranças do mês de início até dezembro do ano vigente
        const endMonth = 12; // dezembro (1-indexed)

        for (let month = startMonthNum; month <= endMonth; month++) {
          if (month === startMonthNum) {
            // 1ª cobrança: aplicar regra de data
            const { asaasDate, localDate } = getFirstChargeDueDate(startYear, month, input.dueDay);
            const description = `Mensalidade ${String(month).padStart(2, '0')}/${startYear} - ${client[0].name}`;
            const asaasCharge = await createPixCharge({
              customerId: asaasCustomer.id,
              value: input.value,
              dueDate: asaasDate,
              description,
            });
            await db.insert(subscriptionCharges).values({
              subscriptionId,
              asaasPaymentId: asaasCharge.id,
              value: input.value.toString(),
              dueDate: localDate,
              status: "pending",
              type: "monthly",
            });
          } else {
            // Demais meses: sempre usar o dia escolhido
            const dueDateStr = `${String(startYear)}-${String(month).padStart(2, '0')}-${String(input.dueDay).padStart(2, '0')}`;
            const description = `Mensalidade ${String(month).padStart(2, '0')}/${startYear} - ${client[0].name}`;
            const asaasCharge = await createPixCharge({
              customerId: asaasCustomer.id,
              value: input.value,
              dueDate: dueDateStr,
              description,
            });
            await db.insert(subscriptionCharges).values({
              subscriptionId,
              asaasPaymentId: asaasCharge.id,
              value: input.value.toString(),
              dueDate: dueDateStr,
              status: "pending",
              type: "monthly",
            });
          }
        }
      } else {
        // Abastecimento, reparo ou outro: cobrança única com regra de data
        const { asaasDate, localDate } = getFirstChargeDueDate(startYear, startMonthNum, input.dueDay);
        const description = `${typeLabel[chargeType] ?? chargeType} - ${client[0].name}`;

        const asaasCharge = await createPixCharge({
          customerId: asaasCustomer.id,
          value: input.value,
          dueDate: asaasDate,
          description,
        });

        await db.insert(subscriptionCharges).values({
          subscriptionId,
          asaasPaymentId: asaasCharge.id,
          value: input.value.toString(),
          dueDate: localDate,
          status: "pending",
          type: chargeType,
        });
      }

      return { id: subscriptionId, success: true };
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

  // Dashboard com filtros aplicados
  getFilteredStats: adminProcedure
    .input(z.object({
      status: z.enum(["pending", "paid", "overdue", "cancelled", "partial", "all"]).optional().default("all"),
      type: z.enum(["monthly", "quota_sale", "fuel", "repair", "other"]).optional(), // Filtro por tipo (legado)
      types: z.array(z.enum(["monthly", "quota_sale", "fuel", "repair", "other"])).optional(), // Filtro por múltiplos tipos
      boatId: z.number().optional(), // Filtro por embarcação
      month: z.string().optional(), // "01" a "12"
      year: z.string().optional(), // "2024", "2025", etc
      search: z.string().optional(), // Busca por nome ou email
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar todas as cobranças com joins
      let query = db.select({
        charge: subscriptionCharges,
        subscription: subscriptions,
        client: allowedClients,
      })
      .from(subscriptionCharges)
      .leftJoin(subscriptions, eq(subscriptionCharges.subscriptionId, subscriptions.id))
      .leftJoin(allowedClients, eq(subscriptions.clientId, allowedClients.id));

      let results = await query;

      // Normalizar status: pending com due_date passada → overdue
      const todayNorm = new Date();
      todayNorm.setHours(0, 0, 0, 0);
      results = results.map(r => {
        if (r.charge.status === 'pending' && r.charge.dueDate) {
          const due = new Date(r.charge.dueDate);
          due.setHours(0, 0, 0, 0);
          if (due < todayNorm) {
            return { ...r, charge: { ...r.charge, status: 'overdue' as const } };
          }
        }
        return r;
      });

      // Filtrar por status
      if (input?.status && input.status !== "all") {
        results = results.filter(r => r.charge.status === input.status);
      }

      // Filtrar por tipo (suporta array de tipos ou tipo único)
      const activeTypesStats = input?.types && input.types.length > 0 ? input.types : (input?.type ? [input.type] : null);
      if (activeTypesStats) {
        results = results.filter(r => {
          const chargeType = r.charge.type || r.subscription?.type;
          return chargeType && activeTypesStats.includes(chargeType as any);
        });
      }

      // Filtrar por embarcação (clientes que possuem cotas na embarcação)
      if (input?.boatId) {
        const clientsWithBoat = await db.select({ clientId: clientQuotas.clientId })
          .from(clientQuotas)
          .where(eq(clientQuotas.vesselId, input.boatId));
        
        const clientIds = clientsWithBoat.map(c => c.clientId);
        results = results.filter(r => r.subscription?.clientId && clientIds.includes(r.subscription.clientId));
      }

      // Filtrar por mês
      if (input?.month) {
        results = results.filter(r => {
          const dueDate = new Date(r.charge.dueDate);
          const month = String(dueDate.getMonth() + 1).padStart(2, '0');
          return month === input.month;
        });
      }

      // Filtrar por ano
      if (input?.year) {
        results = results.filter(r => {
          const dueDate = new Date(r.charge.dueDate);
          const year = String(dueDate.getFullYear());
          return year === input.year;
        });
      }

      // Filtrar por busca (nome ou email)
      if (input?.search) {
        const search = input.search.toLowerCase();
        results = results.filter(r => {
          const name = r.client?.name?.toLowerCase() || "";
          const email = r.client?.email?.toLowerCase() || "";
          return name.includes(search) || email.includes(search);
        });
      }

      // Calcular estatísticas
      const charges = results.map(r => r.charge);

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
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Normalizar status: pending com due_date passada → overdue
      const normalized = results.map(r => {
        if (r.charge.status === 'pending' && r.charge.dueDate) {
          const due = new Date(r.charge.dueDate);
          due.setHours(0, 0, 0, 0);
          if (due < today) {
            return { ...r, charge: { ...r.charge, status: 'overdue' as const } };
          }
        }
        return r;
      });

      // Filtrar por subscription_id se fornecido
      let filtered = normalized;
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

    // Buscar TODOS os clientes do Asaas (não apenas os locais)
    const { listAllAsaasCustomers } = await import("../_core/asaasService");
    const asaasCustomers = await listAllAsaasCustomers({ limit: 1000 }); // Aumentar limite para garantir que todos os clientes sejam importados

    // Buscar todos os clientes locais para fazer match
    const localClients = await db.select().from(allowedClients).where(eq(allowedClients.isActive, 1));

    // Buscar todas as cobranças existentes em outras abas (para excluir da sincronização)
    const fuelCharges = await db.select().from(fuelRecords);
    const inspectionChargesData = await db.select().from(inspectionCharges);
    
    const excludedAsaasIds = new Set<string>();
    
    // Adicionar IDs de cobranças de abastecimento
    fuelCharges.forEach(record => {
      if (record.asaasChargeId) {
        excludedAsaasIds.add(record.asaasChargeId);
      }
    });
    
    // Adicionar IDs de cobranças de vistorias/reparos
    inspectionChargesData.forEach(charge => {
      if (charge.asaasChargeId) {
        excludedAsaasIds.add(charge.asaasChargeId);
      }
    });

    let syncedCount = 0;
    let errorCount = 0;
    let excludedCount = 0;
    let unclassifiedCount = 0;

    console.log(`[syncWithAsaas] Total de clientes Asaas: ${asaasCustomers.length}`);
    console.log(`[syncWithAsaas] Total de clientes locais: ${localClients.length}`);

    // Iterar sobre TODOS os clientes do Asaas
    for (const asaasCustomer of asaasCustomers) {
      console.log(`[syncWithAsaas] Processando cliente: ${asaasCustomer.name} (${asaasCustomer.email || 'sem email'})`);
      try {
        // Tentar fazer match com cliente local (por email ou CPF/CNPJ)
        let localClient = localClients.find(c => 
          (asaasCustomer.email && c.email === asaasCustomer.email) ||
          (asaasCustomer.cpfCnpj && c.cpfCnpj === asaasCustomer.cpfCnpj)
        );

        // Se não encontrar cliente local, criar automaticamente
        if (!localClient) {
          const insertNewClient = await db.insert(allowedClients).values({
            name: asaasCustomer.name,
            email: asaasCustomer.email ?? undefined,
            cpfCnpj: asaasCustomer.cpfCnpj ?? undefined,
            phone: asaasCustomer.phone ?? undefined,
            isActive: 1,
          }).onDuplicateKeyUpdate({
            set: {
              name: asaasCustomer.name,
              cpfCnpj: asaasCustomer.cpfCnpj ?? undefined,
              phone: asaasCustomer.phone ?? undefined,
            }
          });
          const newClient = { insertId: insertNewClient[0].insertId };
          
          // Buscar cliente recém-criado
          const createdClient = await db.select()
            .from(allowedClients)
            .where(eq(allowedClients.id, newClient.insertId))
            .limit(1);
          
          if (createdClient.length > 0) {
            localClient = createdClient[0];
            // Adicionar à lista local para evitar duplicações
            localClients.push(localClient);
          }
        }

        // Buscar todas as cobranças deste cliente Asaas
        const asaasCharges = await listCustomerCharges(asaasCustomer.id);
        console.log(`[syncWithAsaas] Cliente ${asaasCustomer.name}: ${asaasCharges.length} cobranças encontradas`);

        for (const asaasCharge of asaasCharges) {
          // EXCLUIR cobranças que já existem em outras abas (abastecimento, vistorias)
          if (excludedAsaasIds.has(asaasCharge.id)) {
            excludedCount++;
            continue;
          }

          // Classificar cobrança: mensalidade vs venda de cota
          const description = asaasCharge.description?.toLowerCase() || "";
          let chargeType: "monthly" | "quota_sale" | null = null;

          if (description.includes("mensalidade") || description.includes("monthly") || description.includes("taxa mensal") || description.includes("taxa clube")) {
            chargeType = "monthly";
          } else if (description.includes("cota") || description.includes("quota") || description.includes("venda") || description.includes("parcela") || description.includes("aquisição") || description.includes("aquisicao")) {
            chargeType = "quota_sale";
          }

          // Se não conseguir classificar, salvar em unclassified_charges
          if (!chargeType) {
            // Verificar se já existe em unclassified_charges
            const existingUnclassified = await db.select()
              .from(unclassifiedCharges)
              .where(eq(unclassifiedCharges.asaasPaymentId, asaasCharge.id))
              .limit(1);

            if (existingUnclassified.length === 0) {
              // Criar nova cobrança não classificada
              await db.insert(unclassifiedCharges).values({
                asaasPaymentId: asaasCharge.id,
                asaasCustomerId: asaasCustomer.id,
                asaasCustomerName: asaasCustomer.name,
                asaasCustomerEmail: asaasCustomer.email || null,
                asaasCustomerCpfCnpj: asaasCustomer.cpfCnpj || null,
                description: asaasCharge.description || null,
                value: asaasCharge.value.toString(),
                dueDate: asaasCharge.dueDate,
                paidDate: asaasCharge.paymentDate || null,
                status: mapAsaasStatusToUnclassified(asaasCharge.status),
                classified: 0,
              });
              unclassifiedCount++;
            }
            continue;
          }

          // Cliente local sempre existe agora (criado automaticamente acima se necessário)
          if (!localClient) {
            console.error(`[syncWithAsaas] Cliente local não encontrado após criação automática: ${asaasCustomer.name}`);
            continue;
          }

          // Verificar se cobrança já existe no banco
          const existingCharge = await db.select()
            .from(subscriptionCharges)
            .where(eq(subscriptionCharges.asaasPaymentId, asaasCharge.id))
            .limit(1);

          if (existingCharge.length === 0) {
            // Buscar ou criar subscription para este cliente e tipo
            let subscription = await db.select()
              .from(subscriptions)
              .where(and(
                eq(subscriptions.clientId, localClient.id),
                eq(subscriptions.type, chargeType),
                eq(subscriptions.status, "active")
              ))
              .limit(1);

            // Se não existir subscription, criar uma
            if (subscription.length === 0) {
              const [newSub] = await db.insert(subscriptions).values({
                clientId: localClient.id,
                type: chargeType,
                value: asaasCharge.value.toString(),
                dueDay: new Date(asaasCharge.dueDate).getDate(),
                startDate: asaasCharge.dueDate,
                status: "active",
                yearlyAdjustment: "manual",
              });
              subscription = [{ id: newSub.insertId }] as any;
            }

            // Criar nova cobrança
            const mappedStatus = mapAsaasStatus(asaasCharge.status);
            // Converter status do Asaas para enum de subscription_charges
            let chargeStatus: "pending" | "paid" | "overdue" | "cancelled" = "pending";
            if (mappedStatus === "received" || mappedStatus === "confirmed") {
              chargeStatus = "paid";
            } else if (mappedStatus === "overdue") {
              chargeStatus = "overdue";
            } else if (mappedStatus === "cancelled" || mappedStatus === "refunded") {
              chargeStatus = "cancelled";
            }

            await db.insert(subscriptionCharges).values({
              subscriptionId: subscription[0].id,
              dueDate: asaasCharge.dueDate,
              value: asaasCharge.value.toString(),
              status: chargeStatus,
              asaasPaymentId: asaasCharge.id,
              paidDate: asaasCharge.paymentDate || null,
            });
            syncedCount++;
          } else {
            // Atualizar status da cobrança existente
            const mappedStatus = mapAsaasStatus(asaasCharge.status);
            let chargeStatus: "pending" | "paid" | "overdue" | "cancelled" = "pending";
            if (mappedStatus === "received" || mappedStatus === "confirmed") {
              chargeStatus = "paid";
            } else if (mappedStatus === "overdue") {
              chargeStatus = "overdue";
            } else if (mappedStatus === "cancelled" || mappedStatus === "refunded") {
              chargeStatus = "cancelled";
            }

            await db.update(subscriptionCharges)
              .set({
                status: chargeStatus,
                paidDate: asaasCharge.paymentDate || null,
              })
              .where(eq(subscriptionCharges.id, existingCharge[0].id));
            syncedCount++;
          }
        }
      } catch (error) {
        errorCount++;
        console.error(`Erro ao sincronizar cliente ${asaasCustomer.name}:`, error);
      }
    }

    return {
      syncedCount,
      errorCount,
      excludedCount,
      unclassifiedCount,
      unclassifiedCharges: unclassifiedCount > 0 ? unclassifiedCharges : undefined,
      success: true,
    };
  }),

  // Marcar cobrança como paga
  markChargeAsPaid: adminProcedure
    .input(z.object({
      subscriptionId: z.number(),
      chargeId: z.number().optional(), // ID da cobrança específica (subscription_charges)
      asaasPaymentId: z.string().optional(), // ID do pagamento no Asaas
      paymentDate: z.string().optional(), // Data do pagamento (YYYY-MM-DD)
      notifyCustomer: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar subscription
      const subscription = await db.select().from(subscriptions).where(eq(subscriptions.id, input.subscriptionId)).limit(1);
      if (subscription.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Mensalidade não encontrada" });
      }

      // Se asaasPaymentId foi fornecido, marcar como pago no Asaas
      if (input.asaasPaymentId) {
        const result = await receiveInCash({
          asaasPaymentId: input.asaasPaymentId,
          paymentDate: input.paymentDate,
          notifyCustomer: input.notifyCustomer,
        });

        if (!result.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: result.error || "Erro ao marcar como pago no Asaas",
          });
        }
      }

      // Atualizar status no banco local
      if (input.chargeId) {
        await db.update(subscriptionCharges)
          .set({
            status: "paid",
            paidDate: input.paymentDate || new Date().toISOString().split('T')[0],
          })
          .where(eq(subscriptionCharges.id, input.chargeId));
      }

      return {
        success: true,
        message: "Cobrança marcada como paga com sucesso",
      };
    }),

  // Atualizar cobrança
  updateCharge: adminProcedure
    .input(z.object({
      chargeId: z.number(),
      value: z.number().optional(),
      dueDate: z.string().optional(),
      type: z.enum(["monthly", "quota_sale", "fuel", "repair", "other"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      console.log('[updateCharge] Input recebido:', JSON.stringify(input, null, 2));

      // Buscar cobrança com subscription
      const chargeData = await db.select({
        charge: subscriptionCharges,
        subscription: subscriptions,
      })
      .from(subscriptionCharges)
      .leftJoin(subscriptions, eq(subscriptionCharges.subscriptionId, subscriptions.id))
      .where(eq(subscriptionCharges.id, input.chargeId))
      .limit(1);
      
      console.log('[updateCharge] Cobrança encontrada:', chargeData.length > 0 ? 'SIM' : 'NÃO');
      
      if (chargeData.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cobrança não encontrada" });
      }

      const { charge, subscription } = chargeData[0];
      if (!subscription) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Subscription não encontrada" });
      }

      // Preparar dados para atualização da cobrança
      const chargeUpdateData: any = {};
      if (input.value !== undefined) chargeUpdateData.value = input.value;
      if (input.dueDate !== undefined) chargeUpdateData.dueDate = input.dueDate;
      if (input.type !== undefined) chargeUpdateData.type = input.type; // Atualizar tipo INDIVIDUAL da cobrança

      console.log('[updateCharge] Dados para atualização da cobrança:', JSON.stringify(chargeUpdateData, null, 2));

      // Atualizar cobrança (valor, data de vencimento E tipo)
      if (Object.keys(chargeUpdateData).length > 0) {
        await db.update(subscriptionCharges)
          .set(chargeUpdateData)
          .where(eq(subscriptionCharges.id, input.chargeId));
      }

      console.log('[updateCharge] Cobrança atualizada com sucesso!');

      return {
        success: true,
        message: "Cobrança atualizada com sucesso",
      };
    }),

  // Excluir cobrança (hard delete)
  deleteCharge: adminProcedure
    .input(z.object({
      chargeId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar cobrança
      const charge = await db.select().from(subscriptionCharges).where(eq(subscriptionCharges.id, input.chargeId)).limit(1);
      if (charge.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cobrança não encontrada" });
      }

      // Tentar cancelar no Asaas (não bloquear se falhar)
      const asaasPaymentId = charge[0].asaasPaymentId;
      if (asaasPaymentId) {
        try {
          await cancelCharge(asaasPaymentId);
          console.log(`[deleteCharge] Cobrança ${asaasPaymentId} cancelada no Asaas`);
        } catch (error) {
          console.warn(`[deleteCharge] Falha ao cancelar cobrança ${asaasPaymentId} no Asaas (continuando deleção local):`, error);
        }
      }

      // Excluir cobrança localmente (hard delete)
      await db.delete(subscriptionCharges).where(eq(subscriptionCharges.id, input.chargeId));

      return {
        success: true,
        message: "Cobrança excluída com sucesso",
      };
    }),

  // ─── Sincronizar cache BPO: busca todas as cobranças do Asaas e salva no banco local ───
  syncBpoCache: adminProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      console.log(`[syncBpoCache] Iniciando sincronização do cache BPO...`);

      // 1. Carregar mapa de clientes Asaas (id → nome/email)
      const asaasCustomerMap = new Map<string, { name: string; email: string; cpfCnpj?: string }>();
      let customerOffset = 0;
      let customerHasMore = true;
      while (customerHasMore) {
        const batch = await listAllAsaasCustomers({ limit: 100, offset: customerOffset });
        if (batch.length === 0) { customerHasMore = false; break; }
        for (const c of batch) asaasCustomerMap.set(c.id, { name: c.name, email: c.email ?? '', cpfCnpj: c.cpfCnpj ?? undefined });
        if (batch.length < 100) customerHasMore = false;
        customerOffset += 100;
      }

      // 2. Buscar cobranças já classificadas (para marcar no cache)
      const classifiedCharges = await db.select({ asaasPaymentId: subscriptionCharges.asaasPaymentId }).from(subscriptionCharges);
      const classifiedIds = new Set(classifiedCharges.map(c => c.asaasPaymentId).filter(Boolean) as string[]);

      // 3. Buscar cobranças excluídas manualmente
      const excluded = await db.select({ asaasChargeId: excludedAsaasCharges.asaasChargeId }).from(excludedAsaasCharges);
      const excludedIds = new Set(excluded.map(e => e.asaasChargeId));

      // 4. Buscar IDs de cobranças de abastecimento/vistorias (excluir do BPO)
      const fuelChargesData = await db.select({ asaasChargeId: fuelRecords.asaasChargeId }).from(fuelRecords);
      const inspChargesData = await db.select({ asaasChargeId: inspectionCharges.asaasChargeId }).from(inspectionCharges);
      const otherModuleIds = new Set<string>();
      fuelChargesData.forEach(r => { if (r.asaasChargeId) otherModuleIds.add(r.asaasChargeId); });
      inspChargesData.forEach(r => { if (r.asaasChargeId) otherModuleIds.add(r.asaasChargeId); });

      // 5. Buscar TODAS as cobranças do Asaas em lotes e upsert no cache local
      let chargeOffset = 0;
      let chargeHasMore = true;
      let inserted = 0;
      let updated = 0;
      let skipped = 0;

      while (chargeHasMore) {
        const { charges: batch, hasMore } = await listAllAsaasCharges({ limit: 100, offset: chargeOffset });
        if (batch.length === 0) { chargeHasMore = false; break; }
        if (!hasMore || batch.length < 100) chargeHasMore = false;
        chargeOffset += 100;

        for (const charge of batch) {
          // Pular canceladas/deletadas
          if (charge.status === 'DELETED' || charge.status === 'CANCELLED') { skipped++; continue; }
          // Pular cobranças de outros módulos
          if (otherModuleIds.has(charge.id)) { skipped++; continue; }

          const asaasCustomer = asaasCustomerMap.get((charge as any).customer ?? '');
          const isClassified = classifiedIds.has(charge.id) ? 1 : 0;
          const mappedStatus = mapAsaasStatusToUnclassified(charge.status);

          try {
            // Upsert: inserir ou atualizar se já existe
            await db.execute(sql.raw(`
              INSERT INTO unclassified_charges
                (asaas_payment_id, asaas_customer_id, asaas_customer_name, asaas_customer_email, asaas_customer_cpf_cnpj,
                 description, value, due_date, paid_date, asaas_status, status, classified, last_synced_at)
              VALUES (
                '${charge.id.replace(/'/g, "''")}',
                '${((charge as any).customer ?? '').replace(/'/g, "''")}',
                '${(asaasCustomer?.name ?? '').replace(/'/g, "''")}',
                '${(asaasCustomer?.email ?? '').replace(/'/g, "''")}',
                '${(asaasCustomer?.cpfCnpj ?? '').replace(/'/g, "''")}',
                '${(charge.description ?? '').replace(/'/g, "''")}',
                ${charge.value},
                '${charge.dueDate}',
                ${(charge as any).paymentDate ? `'${(charge as any).paymentDate}'` : 'NULL'},
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
            console.error(`[syncBpoCache] Erro ao upsert ${charge.id}:`, err);
            skipped++;
          }
        }
      }

      // 6. Marcar como classified=1 as cobranças que foram classificadas manualmente após o último sync
      if (classifiedIds.size > 0) {
        const classifiedArr = Array.from(classifiedIds);
        // Processar em lotes de 500 para evitar SQL muito longo
        for (let i = 0; i < classifiedArr.length; i += 500) {
          const chunk = classifiedArr.slice(i, i + 500).map(id => `'${id.replace(/'/g, "''")}'`).join(',');
          await db.execute(sql.raw(`UPDATE unclassified_charges SET classified = 1 WHERE asaas_payment_id IN (${chunk}) AND classified = 0`));
        }
      }

      const totalInCache = await db.execute(sql.raw('SELECT COUNT(*) as cnt FROM unclassified_charges WHERE classified = 0'));
      const unclassifiedCount = (totalInCache[0] as any)[0]?.cnt ?? 0;

      console.log(`[syncBpoCache] Concluído: ${inserted} inseridas, ${updated} atualizadas, ${skipped} ignoradas. Cache: ${unclassifiedCount} não classificadas.`);

      return {
        success: true,
        inserted,
        updated,
        skipped,
        unclassifiedCount,
        message: `Cache sincronizado: ${inserted + updated} cobranças processadas, ${unclassifiedCount} aguardando classificação`,
      };
    }),

  // Listar cobranças não classificadas — lê do cache local (< 500ms)
  listUnclassifiedCharges: adminProcedure
    .input(z.object({
      page: z.number().min(1).optional().default(1),
      pageSize: z.number().min(10).max(200).optional().default(50),
      search: z.string().optional(),
      status: z.enum(['all', 'pending', 'paid', 'overdue']).optional().default('all'),
    }).optional())
    .query(async ({ input }) => {
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 50;
    const search = input?.search ?? '';
    const statusFilter = input?.status ?? 'all';

    console.log(`[listUnclassifiedCharges] Lendo do cache local (página ${page}, tamanho ${pageSize})...`);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // ─── NOVA IMPLEMENTAÇÃO: Lê do cache local (unclassified_charges) ───
    // Mapa de clientes locais por email
    const localClients = await db.select().from(allowedClients);
    const localClientByEmail = new Map(localClients.map(c => [c.email.toLowerCase(), c]));

    // Mapa de alocações Pix (para calcular saldo livre)
    const allPixAllocs = await db.select().from(pixAllocations);
    const pixAllocatedMap = new Map<string, number>();
    const pixAllocHistoryMap = new Map<string, Array<{ subscriptionChargeId: number; amount: number }>>();
    for (const alloc of allPixAllocs) {
      const id = alloc.asaasChargeId;
      const amt = parseFloat(alloc.amount as string);
      pixAllocatedMap.set(id, (pixAllocatedMap.get(id) ?? 0) + amt);
      if (!pixAllocHistoryMap.has(id)) pixAllocHistoryMap.set(id, []);
      pixAllocHistoryMap.get(id)!.push({ subscriptionChargeId: alloc.subscriptionChargeId, amount: amt });
    }

    // IDs de cobranças excluídas manualmente
    const manuallyExcluded = await db.select({ asaasChargeId: excludedAsaasCharges.asaasChargeId }).from(excludedAsaasCharges);
    const excludedAsaasIds = new Set(manuallyExcluded.map(e => e.asaasChargeId));

    // IDs já classificados (subscription_charges)
    const classifiedRows = await db.select({ asaasPaymentId: subscriptionCharges.asaasPaymentId, paymentLinks: subscriptionCharges.paymentLinks }).from(subscriptionCharges);
    const classifiedAsaasIds = new Set<string>();
    for (const c of classifiedRows) {
      if (c.asaasPaymentId) classifiedAsaasIds.add(c.asaasPaymentId);
      if (c.paymentLinks) {
        try { (JSON.parse(c.paymentLinks as string) as string[]).forEach(id => { if (id) classifiedAsaasIds.add(id); }); } catch { /* ignorar */ }
      }
    }

    // Contar total no cache (para paginação)
    // Filtro base: apenas cobranças com nome identificado (asaas_customer_name preenchido)
    // Cobranças sem nome são Pix anônimos inidentificáveis e são ignoradas automaticamente
    const baseFilter = `classified = 0 AND status != 'cancelled' AND asaas_customer_name IS NOT NULL AND asaas_customer_name != ''`;
    const searchFilter = search ? `AND (asaas_customer_name LIKE '%${search.replace(/'/g, "''")}%' OR asaas_customer_email LIKE '%${search.replace(/'/g, "''")}%' OR description LIKE '%${search.replace(/'/g, "''")}%')` : '';
    const statusSql = statusFilter !== 'all' ? `AND status = '${statusFilter}'` : '';

    // Montar lista de IDs excluídos para o COUNT (excluídos manualmente + já classificados)
    const excludedIdsList = [...excludedAsaasIds, ...classifiedAsaasIds]
      .map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    const excludedFilter = excludedIdsList.length > 0
      ? `AND asaas_payment_id NOT IN (${excludedIdsList})`
      : '';

    const countResult = await db.execute(sql.raw(`
      SELECT COUNT(*) as cnt FROM unclassified_charges
      WHERE ${baseFilter} ${searchFilter} ${statusSql} ${excludedFilter}
    `));
    const totalCount = (countResult[0] as any)[0]?.cnt ?? 0;

    // Buscar página do cache
    const offset = (page - 1) * pageSize;
    const cacheRows = await db.execute(sql.raw(`
      SELECT asaas_payment_id, asaas_customer_id, asaas_customer_name, asaas_customer_email,
             description, value, due_date, paid_date, asaas_status, status, classified, last_synced_at
      FROM unclassified_charges
      WHERE ${baseFilter} ${searchFilter} ${statusSql}
      ORDER BY
        CASE WHEN asaas_status IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH') THEN 0 ELSE 1 END ASC,
        due_date DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `));

    const rows = (cacheRows[0] as any[]) ?? [];

    const result = rows
      .filter(row => !excludedAsaasIds.has(row.asaas_payment_id))
      .map(row => {
        const localClient = localClientByEmail.get((row.asaas_customer_email ?? '').toLowerCase());
        const allocatedAmt = pixAllocatedMap.get(row.asaas_payment_id) ?? 0;
        const freeBalance = Math.max(0, parseFloat(row.value) - allocatedAmt);
        // Cobranças sem nome real E sem match de cliente local são inidentificáveis → ignorar automaticamente
        const hasName = !!(row.asaas_customer_name && row.asaas_customer_name.trim() !== '');
        const hasLocalClient = !!localClient;
        const isIdentifiable = hasName || hasLocalClient;
        // Manter se: identificável E (não classificado OU tem saldo livre de Pix)
        const isClassifiedWithFreeBalance = classifiedAsaasIds.has(row.asaas_payment_id)
          ? (allocatedAmt > 0 && freeBalance >= 0.01)
          : true;
        if (!isIdentifiable || !isClassifiedWithFreeBalance) return null;
        return {
          asaasChargeId: row.asaas_payment_id,
          description: row.description || 'Sem descrição',
          value: parseFloat(row.value),
          dueDate: row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : String(row.due_date).split('T')[0],
          status: row.asaas_status || row.status?.toUpperCase() || 'PENDING',
          clientId: localClient?.id ?? 0,
          clientName: localClient?.name ?? row.asaas_customer_name ?? '',
          clientEmail: localClient?.email ?? row.asaas_customer_email ?? '',
          asaasCustomerId: row.asaas_customer_id ?? '',
          allocatedAmount: allocatedAmt > 0 ? allocatedAmt : undefined,
          freeBalance: allocatedAmt > 0 ? freeBalance : undefined,
          allocations: pixAllocHistoryMap.get(row.asaas_payment_id),
          lastSyncedAt: row.last_synced_at,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .filter(row => !excludedAsaasIds.has(row.asaasChargeId));

    // Verificar se o cache está vazio (nunca foi sincronizado)
    const cacheEmpty = await db.execute(sql.raw('SELECT COUNT(*) as cnt FROM unclassified_charges'));
    const cacheSize = (cacheEmpty[0] as any)[0]?.cnt ?? 0;

    console.log(`[listUnclassifiedCharges] Cache: ${cacheSize} total | Retornando ${result.length} (página ${page}/${Math.ceil(totalCount / pageSize)})`);

    return {
      charges: result,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      cacheEmpty: cacheSize === 0,
      lastSyncedAt: rows[0]?.last_synced_at ?? null,
    };
  }),

  // Buscar cobranças pendentes/vencidas/parciais de um cliente para vinculação
  getClientPendingCharges: adminProcedure
    .input(z.object({
      clientId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar todas as cobranças pendentes/vencidas/parciais do cliente
      const charges = await db.select({
        id: subscriptionCharges.id,
        dueDate: subscriptionCharges.dueDate,
        value: subscriptionCharges.value,
        status: subscriptionCharges.status,
        type: subscriptions.type,
        subscriptionValue: subscriptions.value, // valor total da subscription (para detectar cobranças-mãe)
        asaasPaymentId: subscriptionCharges.asaasPaymentId,
        amountPaid: subscriptionCharges.amountPaid,
        paymentLinks: subscriptionCharges.paymentLinks,
      })
        .from(subscriptionCharges)
        .innerJoin(subscriptions, eq(subscriptionCharges.subscriptionId, subscriptions.id))
        .where(and(
          eq(subscriptions.clientId, input.clientId),
          or(
            eq(subscriptionCharges.status, "pending"),
            eq(subscriptionCharges.status, "overdue"),
            eq(subscriptionCharges.status, "partial") // Incluir cobranças parcialmente pagas
          )
        ))
        .orderBy(subscriptionCharges.dueDate);

      // Filtrar cobranças-mãe: são cobranças cujo valor é igual ao valor total da subscription
      // (valor total do parcelamento), ou seja, não são parcelas individuais.
      // Uma cobrança é considerada "parcela" quando seu valor é DIFERENTE do valor total da subscription
      // OU quando a subscription tem apenas 1 cobrança com esse valor (não parcelada).
      // Regra prática: excluir cobranças cujo valor == subscriptionValue E subscriptionValue > 5000
      // (limiar conservador para não excluir cobranças legítimas de alto valor sem parcelamento)
      const filtered = charges.filter(c => {
        const chargeVal = typeof c.value === 'string' ? parseFloat(c.value) : c.value;
        const subVal = typeof c.subscriptionValue === 'string' ? parseFloat(c.subscriptionValue) : c.subscriptionValue;
        // Excluir se o valor da cobrança é igual ao valor total da subscription E esse valor é alto (>5000)
        // Isso identifica as cobranças-mãe que representam o total do parcelamento
        const isParentCharge = chargeVal === subVal && subVal > 5000;
        return !isParentCharge;
      });

      return filtered.map(({ subscriptionValue: _, ...rest }) => rest);
    }),

  // Classificar cobrança manualmente
  classifyCharge: adminProcedure
    .input(z.object({
      asaasChargeId: z.string(),
      clientId: z.number(),
      type: z.enum(["monthly", "quota_sale", "fuel", "repair", "other", "ignore"]),
      value: z.number(),
      dueDate: z.string(),
      status: z.string(),
      linkToChargeId: z.number().optional(), // Se fornecido, vincula ao invés de criar nova cobrança
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Se escolheu "ignorar", não faz nada
      if (input.type === "ignore") {
        return {
          success: true,
          message: "Cobrança marcada para ignorar",
        };
      }

      // Verificar se cobrança já existe no banco
      const existingCharge = await db.select()
        .from(subscriptionCharges)
        .where(eq(subscriptionCharges.asaasPaymentId, input.asaasChargeId))
        .limit(1);

      if (existingCharge.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cobrança já foi classificada" });
      }

      // OPÇÃO 1: Vincular a uma cobrança existente (suporte a pagamento parcial)
      if (input.linkToChargeId) {
        const targetCharge = await db.select()
          .from(subscriptionCharges)
          .where(eq(subscriptionCharges.id, input.linkToChargeId))
          .limit(1);

        if (targetCharge.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cobrança para vincular não encontrada" });
        }

        const charge = targetCharge[0];
        const chargeValue = parseFloat(charge.value as string);
        const currentAmountPaid = parseFloat((charge.amountPaid as string) || '0');
        const newAmountPaid = currentAmountPaid + input.value;

        // Atualizar lista de paymentLinks (JSON array)
        let paymentLinks: string[] = [];
        try {
          paymentLinks = charge.paymentLinks ? JSON.parse(charge.paymentLinks as string) : [];
        } catch {
          paymentLinks = [];
        }
        if (!paymentLinks.includes(input.asaasChargeId)) {
          paymentLinks.push(input.asaasChargeId);
        }

        // Determinar novo status
        const isPaid = newAmountPaid >= chargeValue;
        const newStatus = isPaid ? "paid" : "partial";

        await db.update(subscriptionCharges)
          .set({
            status: newStatus,
            amountPaid: newAmountPaid.toFixed(2),
            paymentLinks: JSON.stringify(paymentLinks),
            // Só atualiza asaasPaymentId e paidDate quando quitar totalmente
            ...(isPaid ? {
              asaasPaymentId: input.asaasChargeId,
              paidDate: new Date().toISOString().split('T')[0],
            } : {}),
          })
          .where(eq(subscriptionCharges.id, input.linkToChargeId));

        const remaining = chargeValue - newAmountPaid;
        return {
          success: true,
          isPaid,
          newAmountPaid,
          remaining: remaining > 0 ? remaining : 0,
          message: isPaid
            ? `Cobrança quitada! Total recebido: R$ ${newAmountPaid.toFixed(2)}`
            : `Pagamento parcial registrado. Recebido: R$ ${newAmountPaid.toFixed(2)} de R$ ${chargeValue.toFixed(2)}. Saldo restante: R$ ${remaining.toFixed(2)}`,
        };
      }

      // OPÇÃO PADRÃO: Criar nova cobrança classificada
      // Buscar ou criar subscription para este cliente e tipo
      let subscription = await db.select()
        .from(subscriptions)
        .where(and(
          eq(subscriptions.clientId, input.clientId),
          eq(subscriptions.type, input.type),
          eq(subscriptions.status, "active")
        ))
        .limit(1);

      // Se não existir subscription, criar uma
      if (subscription.length === 0) {
        const [newSub] = await db.insert(subscriptions).values({
          clientId: input.clientId,
          type: input.type,
          value: input.value.toString(),
          dueDay: new Date(input.dueDate).getDate(),
          startDate: input.dueDate,
          status: "active",
          yearlyAdjustment: "manual",
        });
        subscription = [{ id: newSub.insertId }] as any;
      }

      // Mapear status do Asaas para enum de subscription_charges
      const mappedStatus = mapAsaasStatus(input.status);
      let chargeStatus: "pending" | "paid" | "overdue" | "cancelled" = "pending";
      if (mappedStatus === "received" || mappedStatus === "confirmed") {
        chargeStatus = "paid";
      } else if (mappedStatus === "overdue") {
        chargeStatus = "overdue";
      } else if (mappedStatus === "cancelled" || mappedStatus === "refunded") {
        chargeStatus = "cancelled";
      }

      // Criar nova cobrança
      await db.insert(subscriptionCharges).values({
        subscriptionId: subscription[0].id,
        dueDate: input.dueDate,
        value: input.value.toString(),
        status: chargeStatus,
        asaasPaymentId: input.asaasChargeId,
        paidDate: null,
      });

      return {
        success: true,
        message: "Cobrança classificada com sucesso",
      };
    }),

  // Excluir cobran\u00e7a do m\u00f3dulo Saas (soft delete)
  excludeFromSaas: adminProcedure
    .input(z.object({
      asaasChargeId: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verificar se j\u00e1 foi exclu\u00edda
      const existing = await db.select()
        .from(excludedAsaasCharges)
        .where(eq(excludedAsaasCharges.asaasChargeId, input.asaasChargeId))
        .limit(1);

      if (existing.length > 0) {
        return {
          success: true,
          message: "Cobran\u00e7a j\u00e1 foi exclu\u00edda anteriormente",
        };
      }

      // Adicionar \u00e0 lista de exclu\u00eddas
      await db.insert(excludedAsaasCharges).values({
        asaasChargeId: input.asaasChargeId,
        excludedBy: ctx.user?.email || "admin",
        reason: input.reason || "Cobran\u00e7a de abastecimento/vistoria",
      });

      return {
        success: true,
        message: "Cobrança excluída do módulo Saas",
      };
    }),

  // Classificar cobrança não classificada
  classifyUnclassifiedCharge: adminProcedure
    .input(z.object({
      unclassifiedChargeId: z.union([z.number(), z.string()]),
      clientId: z.number(),
      type: z.enum(["monthly", "quota_sale", "fuel", "repair", "other"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar cobrança não classificada por id numérico ou asaasPaymentId (string)
      let unclassified: any;
      if (typeof input.unclassifiedChargeId === 'number') {
        const [row] = await db.select()
          .from(unclassifiedCharges)
          .where(eq(unclassifiedCharges.id, input.unclassifiedChargeId))
          .limit(1);
        unclassified = row;
      } else {
        const [row] = await db.select()
          .from(unclassifiedCharges)
          .where(eq(unclassifiedCharges.asaasPaymentId, input.unclassifiedChargeId))
          .limit(1);
        unclassified = row;
      }

      if (!unclassified) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cobrança não encontrada" });
      }

      // Buscar ou criar subscription
      let subscription = await db.select()
        .from(subscriptions)
        .where(and(
          eq(subscriptions.clientId, input.clientId),
          eq(subscriptions.type, input.type),
          eq(subscriptions.status, "active")
        ))
        .limit(1);

      if (subscription.length === 0) {
        const newSubResult = await db.insert(subscriptions).values({
          clientId: input.clientId,
          type: input.type,
          value: unclassified.value,
          dueDay: new Date(unclassified.dueDate).getDate(),
          startDate: unclassified.dueDate,
          status: "active",
          yearlyAdjustment: "manual",
        });
        subscription = [{ id: newSubResult[0].insertId }] as any;
      }

      // Verificar se já existe cobrança para esta subscription+dueDate (evitar duplicata)
      const existingCharge = await db.select()
        .from(subscriptionCharges)
        .where(and(
          eq(subscriptionCharges.subscriptionId, subscription[0].id),
          eq(subscriptionCharges.dueDate, unclassified.dueDate as any)
        ))
        .limit(1);

      let newChargeId: number;
      if (existingCharge.length > 0) {
        // Já existe — atualizar com dados do Asaas se necessário
        newChargeId = existingCharge[0].id;
        await db.update(subscriptionCharges)
          .set({
            asaasPaymentId: unclassified.asaasPaymentId ?? existingCharge[0].asaasPaymentId,
            status: unclassified.status ?? existingCharge[0].status,
            paidDate: unclassified.paidDate ?? existingCharge[0].paidDate,
          })
          .where(eq(subscriptionCharges.id, newChargeId));
      } else {
        // Criar nova cobrança em subscription_charges
        const newChargeResult = await db.insert(subscriptionCharges).values({
          subscriptionId: subscription[0].id,
          dueDate: unclassified.dueDate,
          value: unclassified.value,
          status: unclassified.status,
          asaasPaymentId: unclassified.asaasPaymentId,
          paidDate: unclassified.paidDate,
          type: input.type,
        });
        newChargeId = newChargeResult[0].insertId;
      }

      // Marcar como classificada (usa o id do registro encontrado no banco)
      await db.update(unclassifiedCharges)
        .set({
          classified: 1,
          classifiedAt: new Date().toISOString().replace('T', ' ').split('.')[0],
          classifiedBy: ctx.user?.id ?? null,
          linkedClientId: input.clientId,
          linkedSubscriptionId: subscription[0].id,
          linkedChargeId: newChargeId,
        })
        .where(eq(unclassifiedCharges.id, unclassified.id));

      return {
        success: true,
        message: "Cobrança classificada com sucesso",
      };
    }),

  // Ignorar cobrança não classificada permanentemente
  ignoreUnclassifiedCharge: adminProcedure
    .input(z.object({
      unclassifiedChargeId: z.union([z.number(), z.string()]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar por id numérico ou asaasPaymentId (string)
      let targetId: number | undefined;
      if (typeof input.unclassifiedChargeId === 'number') {
        targetId = input.unclassifiedChargeId;
      } else {
        const [row] = await db.select({ id: unclassifiedCharges.id })
          .from(unclassifiedCharges)
          .where(eq(unclassifiedCharges.asaasPaymentId, input.unclassifiedChargeId))
          .limit(1);
        targetId = row?.id;
      }

      if (!targetId) {
        // Cobrança não está no banco local (veio direto do Asaas) - apenas retorna sucesso
        return { success: true, message: "Cobrança ignorada" };
      }

      await db.update(unclassifiedCharges)
        .set({
          classified: 1, // Marcar como "processada" para não aparecer mais
          classifiedAt: new Date().toISOString().replace('T', ' ').split('.')[0],
          classifiedBy: ctx.user?.id ?? null,
        })
        .where(eq(unclassifiedCharges.id, targetId));

      return {
        success: true,
        message: "Cobrança ignorada com sucesso",
      };
    }),

  // ============================================================
  // SPLIT DE PIX: vincular 1 pagamento a múltiplas cobranças
  // ============================================================
  splitPayment: adminProcedure
    .input(z.object({
      asaasChargeId: z.string(),           // ID do Pix no Asaas
      pixValue: z.number(),                // Valor total do Pix
      splits: z.array(z.object({
        chargeId: z.number(),              // ID da subscription_charge a quitar
        amount: z.number(),               // Valor a alocar nesta cobrança
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verificar alocações já existentes para este Pix
      const existingAllocations = await db.select()
        .from(pixAllocations)
        .where(eq(pixAllocations.asaasChargeId, input.asaasChargeId));
      const alreadyAllocated = existingAllocations.reduce((sum, a) => sum + parseFloat(a.amount as string), 0);

      // Validar: soma dos splits + já alocado não pode exceder o valor do Pix
      const totalAllocated = input.splits.reduce((sum, s) => sum + s.amount, 0);
      const grandTotal = alreadyAllocated + totalAllocated;
      if (grandTotal > input.pixValue + 0.01) { // tolerância de 1 centavo
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Soma total alocada (R$ ${grandTotal.toFixed(2)}) excede o valor do Pix (R$ ${input.pixValue.toFixed(2)})`,
        });
      }

      // Verificar se alguma cobrança já recebeu alocação deste Pix
      const alreadyAllocatedChargeIds = new Set(existingAllocations.map(a => a.subscriptionChargeId));
      for (const split of input.splits) {
        if (alreadyAllocatedChargeIds.has(split.chargeId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cobrança #${split.chargeId} já recebeu alocação deste Pix`,
          });
        }
      }

      // Calcular saldo livre após esta operação
      const unallocated = Math.max(0, input.pixValue - grandTotal);
      // Marcar o Pix como totalmente classificado quando saldo livre = 0
      const pixFullyAllocated = unallocated < 0.01;

      const results: Array<{ chargeId: number; status: string; message: string }> = [];

      for (const split of input.splits) {
        const targetCharges = await db.select()
          .from(subscriptionCharges)
          .where(eq(subscriptionCharges.id, split.chargeId))
          .limit(1);

        if (targetCharges.length === 0) {
          results.push({ chargeId: split.chargeId, status: "error", message: "Cobrança não encontrada" });
          continue;
        }

        const charge = targetCharges[0];
        const chargeValue = parseFloat(charge.value as string);
        const currentAmountPaid = parseFloat((charge.amountPaid as string) || '0');
        const newAmountPaid = currentAmountPaid + split.amount;

        // Registrar alocação na tabela pix_allocations
        await db.insert(pixAllocations).values({
          asaasChargeId: input.asaasChargeId,
          subscriptionChargeId: split.chargeId,
          amount: split.amount.toFixed(2),
        });

        // Sempre adicionar o Pix ao payment_links da cobrança (para rastreamento)
        let paymentLinks: string[] = [];
        try { paymentLinks = charge.paymentLinks ? JSON.parse(charge.paymentLinks as string) : []; } catch { paymentLinks = []; }
        if (!paymentLinks.includes(input.asaasChargeId)) {
          paymentLinks.push(input.asaasChargeId);
        }

        const isPaid = newAmountPaid >= chargeValue - 0.01;
        const newStatus = isPaid ? "paid" : "partial";

        await db.update(subscriptionCharges)
          .set({
            status: newStatus,
            amountPaid: newAmountPaid.toFixed(2),
            paymentLinks: JSON.stringify(paymentLinks),
            ...(isPaid ? {
              asaasPaymentId: input.asaasChargeId,
              paidDate: new Date().toISOString().split('T')[0],
            } : {}),
          })
          .where(eq(subscriptionCharges.id, split.chargeId));

        const remaining = Math.max(0, chargeValue - newAmountPaid);
        results.push({
          chargeId: split.chargeId,
          status: isPaid ? "paid" : "partial",
          message: isPaid
            ? `Quitada (R$ ${newAmountPaid.toFixed(2)})`
            : `Parcial — Saldo: R$ ${remaining.toFixed(2)}`,
        });
      }

      // Se o Pix foi totalmente alocado, adicioná-lo à lista de excluídos para não reaparecer
      if (pixFullyAllocated) {
        const existingExcluded = await db.select()
          .from(excludedAsaasCharges)
          .where(eq(excludedAsaasCharges.asaasChargeId, input.asaasChargeId))
          .limit(1);
        if (existingExcluded.length === 0) {
          await db.insert(excludedAsaasCharges).values({
            asaasChargeId: input.asaasChargeId,
            excludedBy: 'system',
            reason: 'split_fully_allocated',
          });
        }
      }

      return {
        success: true,
        results,
        totalAllocated: grandTotal,
        unallocated,
        pixFullyAllocated,
        message: pixFullyAllocated
          ? `${results.filter(r => r.status === 'paid').length} cobrança(s) quitada(s), ${results.filter(r => r.status === 'partial').length} parcial(is) — Pix totalmente alocado`
          : `${results.filter(r => r.status === 'paid').length} cobrança(s) quitada(s) — Saldo livre de R$ ${unallocated.toFixed(2)} aguardando alocação`,
      };
    }),

  // ============================================================
  // AUTO-CLASSIFICAÇÃO: sugerir classificação por descrição/email/valor
  // ============================================================
  autoClassifySuggestions: adminProcedure
    .input(z.object({
      asaasChargeId: z.string(),
      description: z.string(),
      value: z.number(),
      clientId: z.number().optional(), // 0 = não identificado
      dueDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const desc_lower = input.description.toLowerCase();

      // 1. Detectar tipo pela descrição
      let suggestedType: "monthly" | "quota_sale" | "fuel" | "repair" | "other" | null = null;
      let typeConfidence = 0;

      const fuelKeywords = [
        'abastecimento', 'taxa de abastecimento', 'taxa abastecimento', 'abast',
        'combustivel', 'combustível', 'gasolina', 'etanol', 'diesel',
        'litro', 'litros', 'reabastecimento', 'abastec'
      ];
      const repairKeywords = [
        'reparo', 'reparos', 'conserto', 'consertos', 'reforma', 'reformas',
        'manutenção', 'manutencao', 'revisao', 'revisão', 'dano', 'danos',
        'avaria', 'avarias', 'vistoria', 'vistorias', 'inspecao', 'inspeção',
        'reparo de dano', 'dano embarcação', 'dano embarcacao',
        'serviço técnico', 'servico tecnico', 'serviço', 'servico',
        'peça', 'peca', 'troca de peça', 'troca de peca', 'motor',
        'limpeza', 'higienização', 'higienizacao'
      ];
      const quotaKeywords = [
        'cota', 'quota', 'parcela', 'venda de cota', 'venda cota',
        'entrada', 'aquisição de cota', 'aquisicao de cota',
        'compra de cota', 'compra cota', 'sinal', 'sinal cota',
        'transferência de cota', 'transferencia de cota'
      ];
      const monthlyKeywords = [
        'mensalidade', 'mensal', 'mensalidade clube', 'taxa mensal',
        'mensalidade exclusive', 'taxa clube', 'mensalidade exclusive club',
        'mensalidade do clube', 'taxa de uso', 'taxa uso', 'taxa mensal clube'
      ];

      if (fuelKeywords.some(k => desc_lower.includes(k))) { suggestedType = 'fuel'; typeConfidence = 90; }
      else if (repairKeywords.some(k => desc_lower.includes(k))) { suggestedType = 'repair'; typeConfidence = 85; }
      else if (quotaKeywords.some(k => desc_lower.includes(k))) { suggestedType = 'quota_sale'; typeConfidence = 80; }
      else if (monthlyKeywords.some(k => desc_lower.includes(k))) { suggestedType = 'monthly'; typeConfidence = 85; }

      // 2. Buscar cobranças pendentes do cliente que batem com o valor
      let matchingCharges: Array<{
        id: number;
        value: string | number;
        dueDate: string;
        status: string;
        type: string | null;
        amountPaid: string | number;
        paymentLinks: string | null;
        matchScore: number;
        matchReason: string;
      }> = [];

      if (input.clientId && input.clientId > 0) {
        const pendingCharges = await db.select({
          id: subscriptionCharges.id,
          dueDate: subscriptionCharges.dueDate,
          value: subscriptionCharges.value,
          status: subscriptionCharges.status,
          type: subscriptions.type,
          amountPaid: subscriptionCharges.amountPaid,
          paymentLinks: subscriptionCharges.paymentLinks,
        })
          .from(subscriptionCharges)
          .innerJoin(subscriptions, eq(subscriptionCharges.subscriptionId, subscriptions.id))
          .where(and(
            eq(subscriptions.clientId, input.clientId),
            or(
              eq(subscriptionCharges.status, 'pending'),
              eq(subscriptionCharges.status, 'overdue'),
              eq(subscriptionCharges.status, 'partial'),
            )
          ))
          .orderBy(subscriptionCharges.dueDate);

        for (const pc of pendingCharges) {
          let score = 0;
          const reasons: string[] = [];
          const chargeValue = parseFloat(pc.value as string);
          const alreadyPaid = parseFloat((pc.amountPaid as string) || '0');
          const remaining = chargeValue - alreadyPaid;

          // Valor bate exatamente com o saldo restante
          if (Math.abs(remaining - input.value) < 0.02) { score += 50; reasons.push('valor exato'); }
          // Valor bate com o total da cobrança
          else if (Math.abs(chargeValue - input.value) < 0.02) { score += 40; reasons.push('valor total'); }
          // Valor é parte da cobrança (pagamento parcial possível)
          else if (input.value < chargeValue && input.value > 0) { score += 20; reasons.push('valor parcial'); }

          // Tipo bate com sugestão de descrição
          if (suggestedType && pc.type === suggestedType) { score += 30; reasons.push('tipo compatível'); }

          // Vencimento próximo (dentro de 30 dias)
          const dueDateDiff = Math.abs(new Date(pc.dueDate).getTime() - new Date(input.dueDate).getTime());
          const daysDiff = dueDateDiff / (1000 * 60 * 60 * 24);
          if (daysDiff <= 5) { score += 20; reasons.push('vencimento próximo'); }
          else if (daysDiff <= 30) { score += 10; reasons.push('vencimento no mês'); }

          if (score > 0) {
            matchingCharges.push({
              ...pc,
              matchScore: score,
              matchReason: reasons.join(', '),
            });
          }
        }

        // Ordenar por score decrescente
        matchingCharges.sort((a, b) => b.matchScore - a.matchScore);
      }

      // 3. Determinar confiança geral
      const bestMatch = matchingCharges[0];
      const overallConfidence = bestMatch
        ? Math.min(100, typeConfidence + bestMatch.matchScore)
        : typeConfidence;

      return {
        suggestedType,
        typeConfidence,
        matchingCharges: matchingCharges.slice(0, 5), // Top 5 sugestões
        bestMatchChargeId: bestMatch?.id ?? null,
        overallConfidence,
        autoClassify: overallConfidence >= 80 && !!suggestedType && !!bestMatch,
      };
    }),

  // ============================================================
  // AUTO-CLASSIFICAÇÃO EM LOTE: classifica todas as cobranças com confiança ≥ threshold
  // ============================================================
  autoClassifyAll: adminProcedure
    .input(z.object({
      confidenceThreshold: z.number().min(0).max(100).optional().default(85),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const threshold = input.confidenceThreshold ?? 85;

      // ── 1. Carregar dados de exclusão e classificação já existentes ──
      const manuallyExcluded = await db.select().from(excludedAsaasCharges);
      const excludedAsaasIds = new Set<string>(manuallyExcluded.map(e => e.asaasChargeId));

      const classifiedCharges = await db.select().from(subscriptionCharges);
      const classifiedAsaasIds = new Set<string>();
      for (const c of classifiedCharges) {
        if (c.asaasPaymentId) classifiedAsaasIds.add(c.asaasPaymentId);
        if (c.paymentLinks) {
          try {
            const links: string[] = JSON.parse(c.paymentLinks as string);
            links.forEach(id => { if (id) classifiedAsaasIds.add(id); });
          } catch { /* ignorar */ }
        }
      }

      // ── 2. Carregar mapa de clientes locais por email ──
      const localClients = await db.select().from(allowedClients);
      const localClientByEmail = new Map(localClients.map(c => [c.email.toLowerCase(), c]));

      // ── 3. Palavras-chave (mesmas do autoClassifySuggestions) ──
      const fuelKeywords = [
        'abastecimento', 'taxa de abastecimento', 'taxa abastecimento', 'abast',
        'combustivel', 'combustível', 'gasolina', 'etanol', 'diesel',
        'litro', 'litros', 'reabastecimento', 'abastec'
      ];
      const repairKeywords = [
        'reparo', 'reparos', 'conserto', 'consertos', 'reforma', 'reformas',
        'manutenção', 'manutencao', 'revisao', 'revisão', 'dano', 'danos',
        'avaria', 'avarias', 'vistoria', 'vistorias', 'inspecao', 'inspeção',
        'reparo de dano', 'dano embarcação', 'dano embarcacao',
        'serviço técnico', 'servico tecnico', 'serviço', 'servico',
        'peça', 'peca', 'troca de peça', 'troca de peca', 'motor',
        'limpeza', 'higienização', 'higienizacao'
      ];
      const quotaKeywords = [
        'cota', 'quota', 'parcela', 'venda de cota', 'venda cota',
        'entrada', 'aquisição de cota', 'aquisicao de cota',
        'compra de cota', 'compra cota', 'sinal', 'sinal cota',
        'transferência de cota', 'transferencia de cota'
      ];
      const monthlyKeywords = [
        'mensalidade', 'mensal', 'mensalidade clube', 'taxa mensal',
        'mensalidade exclusive', 'taxa clube', 'mensalidade exclusive club',
        'mensalidade do clube', 'taxa de uso', 'taxa uso', 'taxa mensal clube'
      ];

      // ── 4. Buscar todas as cobranças do CACHE LOCAL e processar ──
      const classified: Array<{ asaasChargeId: string; type: string; clientName: string; confidence: number }> = [];
      const skipped: Array<{ asaasChargeId: string; reason: string }> = [];

      // Buscar do cache local em lotes de 500 para não sobrecarregar memória
      let cacheOffset = 0;
      let cacheHasMore = true;

      while (cacheHasMore) {
        const cacheResult = await db.execute(sql.raw(`
          SELECT asaas_payment_id, asaas_customer_id, asaas_customer_name, asaas_customer_email,
                 description, value, due_date, asaas_status, status
          FROM unclassified_charges
          WHERE classified = 0
            AND status != 'cancelled'
            AND asaas_customer_name IS NOT NULL
            AND asaas_customer_name != ''
          ORDER BY id ASC
          LIMIT 500 OFFSET ${cacheOffset}
        `));

        const cacheBatch = (cacheResult[0] as any[]) ?? [];
        if (cacheBatch.length === 0) { cacheHasMore = false; break; }
        if (cacheBatch.length < 500) cacheHasMore = false;
        cacheOffset += 500;

        for (const cacheRow of cacheBatch) {
          const chargeId = cacheRow.asaas_payment_id;
          // Pular já excluídas manualmente
          if (excludedAsaasIds.has(chargeId)) continue;
          // Pular já classificadas
          if (classifiedAsaasIds.has(chargeId)) continue;

          // Montar objeto compatível com o restante do código
          const charge = {
            id: chargeId,
            description: cacheRow.description,
            value: parseFloat(cacheRow.value),
            dueDate: cacheRow.due_date instanceof Date ? cacheRow.due_date.toISOString().split('T')[0] : String(cacheRow.due_date).split('T')[0],
            status: cacheRow.asaas_status || cacheRow.status?.toUpperCase() || 'PENDING',
            customer: cacheRow.asaas_customer_id,
          };

          // Identificar cliente local pelo email do cache
          const localClient = localClientByEmail.get((cacheRow.asaas_customer_email ?? '').toLowerCase());
          const clientId = localClient?.id ?? 0;

          const desc_lower = (charge.description || '').toLowerCase();

          // Detectar tipo pela descrição
          let suggestedType: "monthly" | "quota_sale" | "fuel" | "repair" | "other" | null = null;
          let typeConfidence = 0;

          if (fuelKeywords.some(k => desc_lower.includes(k))) { suggestedType = 'fuel'; typeConfidence = 90; }
          else if (repairKeywords.some(k => desc_lower.includes(k))) { suggestedType = 'repair'; typeConfidence = 85; }
          else if (quotaKeywords.some(k => desc_lower.includes(k))) { suggestedType = 'quota_sale'; typeConfidence = 80; }
          else if (monthlyKeywords.some(k => desc_lower.includes(k))) { suggestedType = 'monthly'; typeConfidence = 85; }

          // Buscar cobranças pendentes do cliente para calcular matchScore
          let bestMatchChargeId: number | null = null;
          let bestMatchScore = 0;

          if (clientId > 0 && suggestedType) {
            const pendingCharges = await db.select({
              id: subscriptionCharges.id,
              dueDate: subscriptionCharges.dueDate,
              value: subscriptionCharges.value,
              status: subscriptionCharges.status,
              type: subscriptions.type,
              amountPaid: subscriptionCharges.amountPaid,
            })
              .from(subscriptionCharges)
              .innerJoin(subscriptions, eq(subscriptionCharges.subscriptionId, subscriptions.id))
              .where(and(
                eq(subscriptions.clientId, clientId),
                or(
                  eq(subscriptionCharges.status, 'pending'),
                  eq(subscriptionCharges.status, 'overdue'),
                  eq(subscriptionCharges.status, 'partial'),
                )
              ))
              .orderBy(subscriptionCharges.dueDate);

            for (const pc of pendingCharges) {
              let score = 0;
              const chargeValue = parseFloat(pc.value as string);
              const alreadyPaid = parseFloat((pc.amountPaid as string) || '0');
              const remaining = chargeValue - alreadyPaid;

              if (Math.abs(remaining - charge.value) < 0.02) score += 50;
              else if (Math.abs(chargeValue - charge.value) < 0.02) score += 40;
              else if (charge.value < chargeValue && charge.value > 0) score += 20;

              if (suggestedType && pc.type === suggestedType) score += 30;

              const dueDateDiff = Math.abs(new Date(pc.dueDate).getTime() - new Date(charge.dueDate).getTime());
              const daysDiff = dueDateDiff / (1000 * 60 * 60 * 24);
              if (daysDiff <= 5) score += 20;
              else if (daysDiff <= 30) score += 10;

              if (score > bestMatchScore) {
                bestMatchScore = score;
                bestMatchChargeId = pc.id;
              }
            }
          }

          const overallConfidence = bestMatchChargeId
            ? Math.min(100, typeConfidence + bestMatchScore)
            : typeConfidence;

          // Verificar se atinge o threshold
          if (overallConfidence < threshold || !suggestedType || clientId === 0) {
            skipped.push({
              asaasChargeId: charge.id,
              reason: clientId === 0
                ? 'Cliente não identificado'
                : !suggestedType
                  ? 'Tipo não identificado'
                  : `Confiança insuficiente (${overallConfidence}% < ${threshold}%)`,
            });
            continue;
          }

          // ── Classificar automaticamente ──
          try {
            // Verificar se já existe (dupla checagem)
            const existing = await db.select({ id: subscriptionCharges.id })
              .from(subscriptionCharges)
              .where(eq(subscriptionCharges.asaasPaymentId, charge.id))
              .limit(1);
            if (existing.length > 0) {
              classifiedAsaasIds.add(charge.id);
              continue;
            }

            // Buscar ou criar subscription
            let subscription = await db.select()
              .from(subscriptions)
              .where(and(
                eq(subscriptions.clientId, clientId),
                eq(subscriptions.type, suggestedType),
                eq(subscriptions.status, "active")
              ))
              .limit(1);

            if (subscription.length === 0) {
              const [newSub] = await db.insert(subscriptions).values({
                clientId,
                type: suggestedType,
                value: charge.value.toString(),
                dueDay: new Date(charge.dueDate).getDate(),
                startDate: charge.dueDate,
                status: "active",
                yearlyAdjustment: "manual",
              });
              subscription = [{ id: newSub.insertId }] as any;
            }

            // Mapear status
            const mappedStatus = mapAsaasStatus(charge.status);
            let chargeStatus: "pending" | "paid" | "overdue" | "cancelled" = "pending";
            if (mappedStatus === "received" || mappedStatus === "confirmed") chargeStatus = "paid";
            else if (mappedStatus === "overdue") chargeStatus = "overdue";
            else if (mappedStatus === "cancelled" || mappedStatus === "refunded") chargeStatus = "cancelled";

            // Verificar duplicata por subscription+dueDate antes de inserir
            const existingByDate = await db.select({ id: subscriptionCharges.id })
              .from(subscriptionCharges)
              .where(and(
                eq(subscriptionCharges.subscriptionId, subscription[0].id),
                eq(subscriptionCharges.dueDate, charge.dueDate as any)
              ))
              .limit(1);

            if (existingByDate.length > 0) {
              // Já existe cobrança para esta data — apenas atualizar asaas_payment_id se necessário
              await db.update(subscriptionCharges)
                .set({ asaasPaymentId: charge.id, status: chargeStatus })
                .where(eq(subscriptionCharges.id, existingByDate[0].id));
            } else {
              // Criar cobrança classificada
              await db.insert(subscriptionCharges).values({
                subscriptionId: subscription[0].id,
                dueDate: charge.dueDate,
                value: charge.value.toString(),
                status: chargeStatus,
                asaasPaymentId: charge.id,
                type: suggestedType,
                paidDate: chargeStatus === 'paid' ? new Date().toISOString().split('T')[0] : null,
              });
            }

            // Marcar como classificada para não reprocessar neste loop
            classifiedAsaasIds.add(charge.id);

            // Marcar como classified=1 no cache local
            await db.execute(sql.raw(`UPDATE unclassified_charges SET classified = 1, classified_at = NOW() WHERE asaas_payment_id = '${charge.id.replace(/'/g, "''")}' LIMIT 1`));

            classified.push({
              asaasChargeId: charge.id,
              type: suggestedType,
              clientName: localClient?.name ?? cacheRow.asaas_customer_name ?? 'Desconhecido',
              confidence: overallConfidence,
            });

            console.log(`[autoClassifyAll] Classificado: ${charge.id} → ${suggestedType} (${overallConfidence}% confiança) — ${localClient?.name ?? 'Desconhecido'}`);
          } catch (err) {
            console.error(`[autoClassifyAll] Erro ao classificar ${charge.id}:`, err);
            skipped.push({ asaasChargeId: charge.id, reason: 'Erro interno ao classificar' });
          }
        }
      }

      console.log(`[autoClassifyAll] Concluído: ${classified.length} classificadas, ${skipped.length} ignoradas`);

      return {
        success: true,
        classifiedCount: classified.length,
        skippedCount: skipped.length,
        classified,
        skipped,
        message: classified.length > 0
          ? `${classified.length} cobrança(s) classificada(s) automaticamente com confiança ≥ ${threshold}%`
          : `Nenhuma cobrança atingiu o threshold de ${threshold}% de confiança`,
      };
    }),
});
