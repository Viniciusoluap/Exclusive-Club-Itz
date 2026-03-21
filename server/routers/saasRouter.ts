import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { subscriptions, subscriptionCharges, allowedClients, clientQuotas, fuelRecords, inspectionCharges, excludedAsaasCharges, unclassifiedCharges } from "../../drizzle/schema";
import { eq, and, or, gte, lte, desc } from "drizzle-orm";
import { createPixCharge, listCustomerCharges, getOrCreateAsaasCustomer, mapAsaasStatus, receiveInCash, cancelCharge, listAllAsaasCustomers } from "../_core/asaasService";

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
        charge: subscriptionCharges,
        subscription: subscriptions,
        client: allowedClients,
      })
      .from(subscriptionCharges)
      .leftJoin(subscriptions, eq(subscriptionCharges.subscriptionId, subscriptions.id))
      .leftJoin(allowedClients, eq(subscriptions.clientId, allowedClients.id))
      .orderBy(desc(subscriptionCharges.dueDate));

      let results = await query;

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

          if (description.includes("mensalidade") || description.includes("monthly")) {
            chargeType = "monthly";
          } else if (description.includes("cota") || description.includes("quota") || description.includes("venda") || description.includes("parcela")) {
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

  // Listar cobranças não classificadas do Asaas
  listUnclassifiedCharges: adminProcedure.query(async () => {
    console.log('[listUnclassifiedCharges] Iniciando busca COMPLETA de cobranças não classificadas...');
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Buscar cobranças excluídas manualmente do módulo BPO (ignoradas pelo admin)
    const manuallyExcluded = await db.select().from(excludedAsaasCharges);
    
    const excludedAsaasIds = new Set<string>();
    manuallyExcluded.forEach(excluded => { excludedAsaasIds.add(excluded.asaasChargeId); });

    // Buscar cobranças já classificadas no BPO
    const classifiedCharges = await db.select().from(subscriptionCharges);
    const classifiedAsaasIds = new Set<string>();
    for (const c of classifiedCharges) {
      // Incluir o asaasPaymentId principal
      if (c.asaasPaymentId) classifiedAsaasIds.add(c.asaasPaymentId);
      // Incluir todos os IDs dentro de payment_links (pagamentos parciais/split)
      if (c.paymentLinks) {
        try {
          const links: string[] = JSON.parse(c.paymentLinks as string);
          links.forEach(id => { if (id) classifiedAsaasIds.add(id); });
        } catch {
          // paymentLinks malformado — ignorar
        }
      }
    }

    // Mapa de clientes locais por email para enriquecer dados
    const localClients = await db.select().from(allowedClients);
    const localClientByEmail = new Map(localClients.map(c => [c.email.toLowerCase(), c]));

    const result: Array<{
      asaasChargeId: string;
      description: string;
      value: number;
      dueDate: string;
      status: string;
      clientId: number;
      clientName: string;
      clientEmail: string;
      asaasCustomerId: string;
    }> = [];

    // Buscar TODOS os clientes do Asaas com paginação
    let offset = 0;
    const pageSize = 100;
    let hasMore = true;
    let totalAsaasCustomers = 0;
    let totalAsaasCharges = 0;
    let totalExcluded = 0;
    let totalClassified = 0;

    while (hasMore) {
      const asaasCustomers = await listAllAsaasCustomers({ limit: pageSize, offset });
      if (asaasCustomers.length === 0) { hasMore = false; break; }
      totalAsaasCustomers += asaasCustomers.length;
      if (asaasCustomers.length < pageSize) hasMore = false;
      offset += pageSize;

      for (const asaasCustomer of asaasCustomers) {
        try {
          // Buscar todas as cobranças do cliente no Asaas (com paginação)
          let chargeOffset = 0;
          let chargeHasMore = true;
          while (chargeHasMore) {
            const charges = await listCustomerCharges(asaasCustomer.id, { limit: 100, offset: chargeOffset });
            if (charges.length === 0) { chargeHasMore = false; break; }
            totalAsaasCharges += charges.length;
            if (charges.length < 100) chargeHasMore = false;
            chargeOffset += 100;

            for (const charge of charges) {
              // Pular cobranças canceladas/deletadas — não são relevantes para o BPO
              if (charge.status === 'DELETED' || charge.status === 'CANCELLED') {
                totalExcluded++;
                continue;
              }
              // Pular cobranças já vinculadas a outros módulos
              if (excludedAsaasIds.has(charge.id)) { totalExcluded++; continue; }
              // Pular cobranças já classificadas no BPO
              if (classifiedAsaasIds.has(charge.id)) { totalClassified++; continue; }

              // Enriquecer com dados do cliente local, se existir
              const localClient = localClientByEmail.get((asaasCustomer.email || '').toLowerCase());

              result.push({
                asaasChargeId: charge.id,
                description: charge.description || 'Sem descrição',
                value: charge.value,
                dueDate: charge.dueDate,
                status: charge.status,
                clientId: localClient?.id ?? 0,
                clientName: localClient?.name ?? asaasCustomer.name,
                clientEmail: localClient?.email ?? asaasCustomer.email ?? '',
                asaasCustomerId: asaasCustomer.id,
              });
            }
          }
        } catch (error) {
          console.error(`[listUnclassifiedCharges] Erro ao buscar cobranças do cliente ${asaasCustomer.name}:`, error);
        }
      }
    }

    console.log(`[listUnclassifiedCharges] Clientes Asaas: ${totalAsaasCustomers} | Cobranças: ${totalAsaasCharges} | Excluídas: ${totalExcluded} | Classificadas: ${totalClassified} | Não classificadas: ${result.length}`);
    return result;
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

      // Criar cobrança em subscription_charges
      const newChargeResult = await db.insert(subscriptionCharges).values({
        subscriptionId: subscription[0].id,
        dueDate: unclassified.dueDate,
        value: unclassified.value,
        status: unclassified.status,
        asaasPaymentId: unclassified.asaasPaymentId,
        paidDate: unclassified.paidDate,
        type: input.type,
      });
      const newChargeId = newChargeResult[0].insertId;

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

      // Validar: soma dos splits não pode exceder o valor do Pix
      const totalAllocated = input.splits.reduce((sum, s) => sum + s.amount, 0);
      if (totalAllocated > input.pixValue + 0.01) { // tolância de 1 centavo
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Soma dos valores alocados (R$ ${totalAllocated.toFixed(2)}) excede o valor do Pix (R$ ${input.pixValue.toFixed(2)})`,
        });
      }

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

        // Atualizar paymentLinks
        let paymentLinks: string[] = [];
        try { paymentLinks = charge.paymentLinks ? JSON.parse(charge.paymentLinks as string) : []; } catch { paymentLinks = []; }
        if (!paymentLinks.includes(input.asaasChargeId)) paymentLinks.push(input.asaasChargeId);

        const isPaid = newAmountPaid >= chargeValue;
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

      return {
        success: true,
        results,
        totalAllocated,
        unallocated: Math.max(0, input.pixValue - totalAllocated),
        message: `${results.filter(r => r.status === 'paid').length} cobrança(s) quitada(s), ${results.filter(r => r.status === 'partial').length} parcial(is)`,
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

      const fuelKeywords = ['abastecimento', 'combustivel', 'combustível', 'gasolina', 'etanol', 'diesel', 'litro'];
      const repairKeywords = ['reparo', 'conserto', 'manutenção', 'manutenção', 'revisao', 'revisão', 'dano', 'avaria', 'vistoria'];
      const quotaKeywords = ['cota', 'quota', 'parcela', 'venda de cota', 'entrada'];
      const monthlyKeywords = ['mensalidade', 'mensal', 'mensalidade clube', 'taxa mensal'];

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
});
