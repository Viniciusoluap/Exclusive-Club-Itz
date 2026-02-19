import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { bookings, fuelRecords, maintenances, allowedClients, vessels, subscriptionCharges, clientQuotas } from "../../drizzle/schema";
import { eq, and, gte, lte, desc, sql, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const reportsRouter = router({
  // Relatório Financeiro
  financial: adminProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const start = new Date(input.startDate).getTime();
      const end = new Date(input.endDate).getTime();

      // 1. Receita Total por Período (abastecimentos pagos + mensalidades pagas)
      const fuelRevenue = await db.select({
        total: sql<number>`SUM(${fuelRecords.totalAmount})`.as('total'),
      })
      .from(fuelRecords)
      .where(
        and(
          gte(fuelRecords.createdAt, new Date(start).toISOString()),
          lte(fuelRecords.createdAt, new Date(end).toISOString()),
          eq(fuelRecords.paymentStatus, 'paid')
        )
      );

      const subscriptionRevenue = await db.select({
        total: sql<number>`SUM(${subscriptionCharges.value})`.as('total'),
      })
      .from(subscriptionCharges)
      .where(
        and(
          gte(subscriptionCharges.dueDate, new Date(start).toISOString()),
          lte(subscriptionCharges.dueDate, new Date(end).toISOString()),
          eq(subscriptionCharges.status, 'paid')
        )
      );

      const totalRevenue = parseFloat(String(fuelRevenue[0]?.total || 0)) + (parseFloat(subscriptionRevenue[0]?.total as any) || 0);

      // 2. Ticket Médio por Cliente
      const clientsWithRevenue = await db.select({
        clientEmail: fuelRecords.clientEmail,
        total: sql<number>`SUM(${fuelRecords.totalAmount})`.as('total'),
      })
      .from(fuelRecords)
      .where(
        and(
          gte(fuelRecords.createdAt, new Date(start).toISOString()),
          lte(fuelRecords.createdAt, new Date(end).toISOString()),
          eq(fuelRecords.paymentStatus, 'paid')
        )
      )
      .groupBy(fuelRecords.clientEmail);

      const avgTicket = clientsWithRevenue.length > 0
        ? clientsWithRevenue.reduce((sum, c) => sum + c.total, 0) / clientsWithRevenue.length
        : 0;

      // 3. Receita por Embarcação
      const revenueByVessel = await db.select({
        vesselName: fuelRecords.vesselName,
        total: sql<number>`SUM(${fuelRecords.totalAmount})`.as('total'),
      })
      .from(fuelRecords)
      .where(
        and(
          gte(fuelRecords.createdAt, new Date(start).toISOString()),
          lte(fuelRecords.createdAt, new Date(end).toISOString()),
          eq(fuelRecords.paymentStatus, 'paid')
        )
      )
      .groupBy(fuelRecords.vesselName);

      // 4. Receita por Tipo de Cota (aproximação: baseado em clientes com cotas)
      const quotaClients = await db.select({
        clientId: clientQuotas.clientId,
        quotaType: clientQuotas.quotaType,
      })
      .from(clientQuotas)
      .where(eq(clientQuotas.isActive, 1));

      const clientEmails = await db.select({
        id: allowedClients.id,
        email: allowedClients.email,
      })
      .from(allowedClients);

      const emailToQuotaType = new Map();
      for (const quota of quotaClients) {
        const client = clientEmails.find(c => c.id === quota.clientId);
        if (client) {
          emailToQuotaType.set(client.email, quota.quotaType);
        }
      }

      let fullQuotaRevenue = 0;
      let halfQuotaRevenue = 0;

      for (const client of clientsWithRevenue) {
        const quotaType = emailToQuotaType.get(client.clientEmail);
        if (quotaType === 'full') {
          fullQuotaRevenue += client.total;
        } else if (quotaType === 'half') {
          halfQuotaRevenue += client.total;
        }
      }

      // 5. Taxa de Inadimplência
      const totalCharges = await db.select({
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(subscriptionCharges)
      .where(
        and(
          gte(subscriptionCharges.dueDate, new Date(start).toISOString()),
          lte(subscriptionCharges.dueDate, new Date(end).toISOString())
        )
      );

      const overdueCharges = await db.select({
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(subscriptionCharges)
      .where(
        and(
          gte(subscriptionCharges.dueDate, new Date(start).toISOString()),
          lte(subscriptionCharges.dueDate, new Date(end).toISOString()),
          eq(subscriptionCharges.status, 'overdue')
        )
      );

      const defaultRate = totalCharges[0]?.count > 0
        ? (overdueCharges[0]?.count / totalCharges[0]?.count) * 100
        : 0;

      // 6. Custo de Manutenção vs Receita (placeholder - precisa de campo de custo em maintenances)
      const maintenanceCost = 0; // TODO: adicionar campo cost em maintenances
      const maintenanceVsRevenue = totalRevenue > 0 ? (maintenanceCost / totalRevenue) * 100 : 0;

      // 7. Custo de Combustível vs Receita
      const fuelCost = await db.select({
        total: sql<number>`SUM(${fuelRecords.totalAmount})`.as('total'),
      })
      .from(fuelRecords)
      .where(
        and(
          gte(fuelRecords.createdAt, new Date(start).toISOString()),
          lte(fuelRecords.createdAt, new Date(end).toISOString()),
          eq(fuelRecords.isOperational, 1)
        )
      );

      const fuelCostTotal = fuelCost[0]?.total || 0;
      const fuelVsRevenue = totalRevenue > 0 ? (fuelCostTotal / totalRevenue) * 100 : 0;

      // 8. Projeção de Receita (30/60/90 dias) - baseado em média mensal
      const daysInPeriod = (end - start) / (1000 * 60 * 60 * 24);
      const dailyAvgRevenue = daysInPeriod > 0 ? totalRevenue / daysInPeriod : 0;
      const projection30 = dailyAvgRevenue * 30;
      const projection60 = dailyAvgRevenue * 60;
      const projection90 = dailyAvgRevenue * 90;

      // 9. Sazonalidade de Receita (por mês)
      const monthlyRevenue = await db.execute(sql`
        SELECT DATE_FORMAT(created_at, '%Y-%m') as month, SUM(total_amount) as total
        FROM fuel_records
        WHERE created_at >= ${new Date(start).toISOString()}
          AND created_at <= ${new Date(end).toISOString()}
          AND payment_status = 'paid'
        GROUP BY month
      `) as any;

      // 10. LTV por Cliente (Lifetime Value)
      const clientLTV = await db.select({
        clientEmail: fuelRecords.clientEmail,
        clientName: fuelRecords.clientName,
        total: sql<number>`SUM(${fuelRecords.totalAmount})`.as('total'),
      })
      .from(fuelRecords)
      .where(eq(fuelRecords.paymentStatus, 'paid'))
      .groupBy(fuelRecords.clientEmail, fuelRecords.clientName)
      .orderBy(desc(sql`SUM(${fuelRecords.totalAmount})`))
      .limit(10);

      return {
        totalRevenue,
        avgTicket,
        revenueByVessel,
        revenueByQuotaType: {
          full: fullQuotaRevenue,
          half: halfQuotaRevenue,
        },
        defaultRate,
        maintenanceVsRevenue,
        fuelVsRevenue,
        projections: {
          days30: projection30,
          days60: projection60,
          days90: projection90,
        },
        monthlyRevenue,
        clientLTV,
      };
    }),

  // Dashboard Executivo
  executive: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Alertas Críticos
    const alerts = [];

    // Alerta: Embarcações em manutenção
    const activeMaintenance = await db.select()
      .from(maintenances)
      .where(eq(maintenances.status, 'in_progress'));

    if (activeMaintenance.length > 0) {
      alerts.push({
        type: 'warning',
        title: 'Manutenções em Andamento',
        message: `${activeMaintenance.length} embarcação(ões) em manutenção`,
      });
    }

    // Alerta: Taxa de inadimplência alta
    const overdueCharges = await db.select({
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(subscriptionCharges)
    .where(eq(subscriptionCharges.status, 'overdue'));

    if (overdueCharges[0]?.count > 0) {
      alerts.push({
        type: 'critical',
        title: 'Inadimplência Detectada',
        message: `${overdueCharges[0].count} cobrança(s) vencida(s)`,
      });
    }

    // Alerta: Estoque de combustível baixo (placeholder)
    // TODO: implementar verificação de estoque

    // 2. Scorecard Geral (0-100)
    let score = 100;

    // Penalizar por inadimplência
    if (overdueCharges[0]?.count > 0) {
      score -= Math.min(overdueCharges[0].count * 5, 30);
    }

    // Penalizar por manutenções ativas
    if (activeMaintenance.length > 0) {
      score -= activeMaintenance.length * 10;
    }

    // Bonificar por reservas recentes
    const recentBookings = await db.select({
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(bookings)
    .where(
      and(
        gte(bookings.bookingDate, thirtyDaysAgo.getTime()),
        eq(bookings.status, 'confirmed')
      )
    );

    if (recentBookings[0]?.count > 10) {
      score += 10;
    }

    score = Math.max(0, Math.min(100, score));

    return {
      alerts,
      score,
      scoreLabel: score >= 80 ? 'Excelente' : score >= 60 ? 'Bom' : score >= 40 ? 'Regular' : 'Crítico',
    };
  }),
});
