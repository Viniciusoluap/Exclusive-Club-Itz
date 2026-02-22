import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { subscriptions, subscriptionCharges, allowedClients, clientQuotas, fuelRecords, inspectionCharges, excludedAsaasCharges, unclassifiedCharges } from "../../drizzle/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { createPixCharge, listCustomerCharges, getOrCreateAsaasCustomer, mapAsaasStatus, receiveInCash } from "../_core/asaasService";
import { TRPCError } from "@trpc/server";

export const saasRouter = router({
  // Listar cobranças individuais com filtros
  listCharges: adminProcedure
    .input(z.object({
      status: z.enum(["pending", "paid", "overdue", "cancelled", "all"]).optional().default("all"),
      type: z.enum(["monthly", "quota_sale"]).optional(), // Filtro por tipo
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

      // Filtrar por tipo (prioriza subscription_charges.type, fallback para subscriptions.type)
      if (input?.type) {
        results = results.filter(r => {
          const chargeType = r.charge.type || r.subscription?.type;
          return chargeType === input.type;
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
      type: z.enum(["monthly", "quota_sale"]),
      value: z.number().positive(),
      dueDay: z.number().min(1).max(31),
      startDate: z.string(),
      endDate: z.string().optional(),
      yearlyAdjustment: z.enum(["manual", "ipca", "igpm"]).optional().default("manual"),
      installments: z.number().min(1).max(12).optional(),
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

      // Se for venda de cota parcelada, criar múltiplas cobranças no Asaas
      if (input.type === "quota_sale" && input.installments && input.installments > 1) {
        const installmentValue = input.value / input.installments;
        const asaasCustomer = await getOrCreateAsaasCustomer(client[0]);
        
        for (let i = 0; i < input.installments; i++) {
          // Calcular data de vencimento de cada parcela
          const dueDate = new Date(input.startDate);
          dueDate.setMonth(dueDate.getMonth() + i);
          dueDate.setDate(input.dueDay);

          // Criar cobrança no Asaas
          const asaasCharge = await createPixCharge({
            customer: asaasCustomer.id,
            value: installmentValue,
            dueDate: dueDate.toISOString().split('T')[0],
            description: `Venda de Cota - Parcela ${i + 1}/${input.installments}`,
          });

          // Salvar cobrança no banco local
          await db.insert(subscriptionCharges).values({
            subscriptionId: subscription.insertId,
            asaasChargeId: asaasCharge.id,
            value: installmentValue.toString(),
            dueDate: dueDate.toISOString(),
            status: "pending",
            type: "quota_sale",
          });
        }
      }

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

  // Dashboard com filtros aplicados
  getFilteredStats: adminProcedure
    .input(z.object({
      status: z.enum(["pending", "paid", "overdue", "cancelled", "all"]).optional().default("all"),
      type: z.enum(["monthly", "quota_sale"]).optional(), // Filtro por tipo
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

      // Filtrar por tipo (prioriza subscription_charges.type, fallback para subscriptions.type)
      if (input?.type) {
        results = results.filter(r => {
          const chargeType = r.charge.type || r.subscription?.type;
          return chargeType === input.type;
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
    const asaasCustomers = await listAllAsaasCustomers({ limit: 100 });

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

    // Iterar sobre TODOS os clientes do Asaas
    for (const asaasCustomer of asaasCustomers.data) {
      try {
        // Tentar fazer match com cliente local (por email ou CPF/CNPJ)
        let localClient = localClients.find(c => 
          (asaasCustomer.email && c.email === asaasCustomer.email) ||
          (asaasCustomer.cpfCnpj && c.cpfCnpj === asaasCustomer.cpfCnpj)
        );

        // Buscar todas as cobranças deste cliente Asaas
        const asaasCharges = await listCustomerCharges(asaasCustomer.id);

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
                status: mapAsaasStatus(asaasCharge.status) as any,
                classified: 0,
              });
              unclassifiedCount++;
            }
            continue;
          }

          // Se não temos cliente local, salvar como não classificada
          if (!localClient) {
            const existingUnclassified = await db.select()
              .from(unclassifiedCharges)
              .where(eq(unclassifiedCharges.asaasPaymentId, asaasCharge.id))
              .limit(1);

            if (existingUnclassified.length === 0) {
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
                status: mapAsaasStatus(asaasCharge.status) as any,
                classified: 0,
              });
              unclassifiedCount++;
            }
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
      type: z.enum(["monthly", "quota_sale"]).optional(),
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

      // Excluir cobrança (hard delete)
      await db.delete(subscriptionCharges).where(eq(subscriptionCharges.id, input.chargeId));

      return {
        success: true,
        message: "Cobrança excluída com sucesso",
      };
    }),

  // Listar cobranças não classificadas do Asaas
  listUnclassifiedCharges: adminProcedure.query(async () => {
    console.log('[listUnclassifiedCharges] Iniciando busca de cobranças não classificadas...');
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Buscar todos os clientes ativos
    const activeClients = await db.select().from(allowedClients).where(eq(allowedClients.isActive, 1));

    // Buscar todas as cobranças existentes em outras abas (para excluir da listagem)
    const fuelCharges = await db.select().from(fuelRecords);
    const inspectionChargesData = await db.select().from(inspectionCharges);
    
    // Buscar cobranças excluídas manualmente do módulo Saas
    const manuallyExcluded = await db.select().from(excludedAsaasCharges);
    console.log('[listUnclassifiedCharges] Cobranças excluídas manualmente:', manuallyExcluded.length);
    
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
      // Adicionar IDs de cobranças excluídas manualmente
    manuallyExcluded.forEach(excluded => {
      excludedAsaasIds.add(excluded.asaasChargeId);
    });

    // Buscar cobranças já classificadas
    const classifiedCharges = await db.select().from(subscriptionCharges);
    const classifiedAsaasIds = new Set(classifiedCharges.map(c => c.asaasPaymentId).filter(Boolean) as string[]);
    console.log('[listUnclassifiedCharges] Cobranças já classificadas (subscriptions):', classifiedAsaasIds.size);
    console.log('[listUnclassifiedCharges] Total de IDs excluídos (fuel + inspection + manual):', excludedAsaasIds.size);

    const unclassifiedCharges: Array<{
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

    console.log('[listUnclassifiedCharges] Total de clientes ativos:', activeClients.length);
    let totalAsaasCharges = 0;
    let totalExcludedByFilter = 0;
    let totalClassified = 0;
    let totalAutoClassified = 0;

    for (const client of activeClients) {
      try {
        // Buscar ou criar cliente no Asaas
        const asaasCustomer = await getOrCreateAsaasCustomer({
          email: client.email,
          name: client.name,
          cpfCnpj: client.cpfCnpj,
          phone: client.phone || undefined,
        });

        // Buscar todas as cobranças do cliente no Asaas
        const asaasCharges = await listCustomerCharges(asaasCustomer.id);
        totalAsaasCharges += asaasCharges.length;

        for (const asaasCharge of asaasCharges) {
          // EXCLUIR cobranças que já existem em outras abas
          if (excludedAsaasIds.has(asaasCharge.id)) {
            totalExcludedByFilter++;
            continue;
          }

          // EXCLUIR cobranças já classificadas
          if (classifiedAsaasIds.has(asaasCharge.id)) {
            totalClassified++;
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

          // Se não conseguir classificar, adiciona à lista de não classificadas
          if (!chargeType) {
            unclassifiedCharges.push({
              asaasChargeId: asaasCharge.id,
              description: asaasCharge.description || "Sem descrição",
              value: asaasCharge.value,
              dueDate: asaasCharge.dueDate,
              status: asaasCharge.status,
              clientId: client.id,
              clientName: client.name,
              clientEmail: client.email,
              asaasCustomerId: asaasCustomer.id,
            });
          } else {
            totalAutoClassified++;
          }
        }
      } catch (error) {
        console.error(`Erro ao buscar cobranças do cliente ${client.name}:`, error);
      }
    }

    console.log('[listUnclassifiedCharges] === RESUMO ===');
    console.log('[listUnclassifiedCharges] Total de cobranças do Asaas:', totalAsaasCharges);
    console.log('[listUnclassifiedCharges] Excluídas por filtro (fuel/inspection/manual):', totalExcludedByFilter);
    console.log('[listUnclassifiedCharges] Já classificadas (subscriptions):', totalClassified);
    console.log('[listUnclassifiedCharges] Auto-classificadas (mensalidade/cota):', totalAutoClassified);
    console.log('[listUnclassifiedCharges] NÃO CLASSIFICADAS (retorno):', unclassifiedCharges.length);
    console.log('[listUnclassifiedCharges] === FIM RESUMO ===');

    return unclassifiedCharges;
  }),

  // Classificar cobrança manualmente
  classifyCharge: adminProcedure
    .input(z.object({
      asaasChargeId: z.string(),
      clientId: z.number(),
      type: z.enum(["monthly", "quota_sale", "ignore"]),
      value: z.number(),
      dueDate: z.string(),
      status: z.string(),
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
        message: "Cobran\u00e7a classificada com sucesso",
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

  // Listar cobranças não classificadas
  listUnclassifiedCharges: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const charges = await db.select()
      .from(unclassifiedCharges)
      .where(eq(unclassifiedCharges.classified, 0))
      .orderBy(desc(unclassifiedCharges.createdAt));

    return charges;
  }),

  // Classificar cobrança não classificada
  classifyUnclassifiedCharge: adminProcedure
    .input(z.object({
      unclassifiedChargeId: z.number(),
      clientId: z.number(),
      type: z.enum(["monthly", "quota_sale"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar cobrança não classificada
      const [unclassified] = await db.select()
        .from(unclassifiedCharges)
        .where(eq(unclassifiedCharges.id, input.unclassifiedChargeId))
        .limit(1);

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
        const [newSub] = await db.insert(subscriptions).values({
          clientId: input.clientId,
          type: input.type,
          value: unclassified.value,
          dueDay: new Date(unclassified.dueDate).getDate(),
          startDate: unclassified.dueDate,
          status: "active",
          yearlyAdjustment: "manual",
        });
        subscription = [{ id: newSub.insertId }] as any;
      }

      // Criar cobrança em subscription_charges
      const [newCharge] = await db.insert(subscriptionCharges).values({
        subscriptionId: subscription[0].id,
        dueDate: unclassified.dueDate,
        value: unclassified.value,
        status: unclassified.status,
        asaasPaymentId: unclassified.asaasPaymentId,
        paidDate: unclassified.paidDate,
        type: input.type,
      });

      // Marcar como classificada
      await db.update(unclassifiedCharges)
        .set({
          classified: 1,
          classifiedAt: new Date(),
          classifiedBy: ctx.user?.id || null,
          linkedClientId: input.clientId,
          linkedSubscriptionId: subscription[0].id,
          linkedChargeId: newCharge.insertId,
        })
        .where(eq(unclassifiedCharges.id, input.unclassifiedChargeId));

      return {
        success: true,
        message: "Cobrança classificada com sucesso",
      };
    }),

  // Ignorar cobrança não classificada permanentemente
  ignoreUnclassifiedCharge: adminProcedure
    .input(z.object({
      unclassifiedChargeId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db.update(unclassifiedCharges)
        .set({
          classified: 1, // Marcar como "processada" para não aparecer mais
          classifiedAt: new Date(),
          classifiedBy: ctx.user?.id || null,
        })
        .where(eq(unclassifiedCharges.id, input.unclassifiedChargeId));

      return {
        success: true,
        message: "Cobrança ignorada com sucesso",
      };
    }),
});
