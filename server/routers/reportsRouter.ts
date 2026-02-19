import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { bookings, fuelRecords, maintenances, allowedClients, vessels, subscriptionCharges, clientQuotas, fuelBudget } from "../../drizzle/schema";
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
        ? clientsWithRevenue.reduce((sum, c) => sum + parseFloat(String(c.total || 0)), 0) / clientsWithRevenue.length
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
        const total = parseFloat(String(client.total || 0));
        if (quotaType === 'full') {
          fullQuotaRevenue += total;
        } else if (quotaType === 'half') {
          halfQuotaRevenue += total;
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

  // Relatório de Ocupação
  occupancy: adminProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const start = new Date(input.startDate).getTime();
      const end = new Date(input.endDate).getTime();

      // 1. Taxa de Ocupação por Embarcação
      const allVessels = await db.select().from(vessels);
      const daysInPeriod = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

      const occupancyByVessel = await Promise.all(
        allVessels.map(async (vessel) => {
          const bookingsCount = await db.select({
            count: sql<number>`COUNT(DISTINCT DATE(FROM_UNIXTIME(${bookings.bookingDate} / 1000)))`.as('count'),
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.vesselName, vessel.name),
              gte(bookings.bookingDate, start),
              lte(bookings.bookingDate, end),
              eq(bookings.status, 'confirmed')
            )
          );

          const occupancyRate = daysInPeriod > 0 
            ? ((bookingsCount[0]?.count || 0) / daysInPeriod) * 100 
            : 0;

          return {
            vesselName: vessel.name,
            bookedDays: bookingsCount[0]?.count || 0,
            totalDays: daysInPeriod,
            occupancyRate: Math.round(occupancyRate * 10) / 10,
          };
        })
      );

      // 2. Dias Mais Reservados (dia da semana)
      const bookingsByWeekday = await db.execute(sql`
        SELECT DAYNAME(FROM_UNIXTIME(booking_date / 1000)) as weekday, COUNT(*) as count
        FROM bookings
        WHERE booking_date >= ${start}
          AND booking_date <= ${end}
          AND status = 'confirmed'
        GROUP BY weekday
        ORDER BY count DESC
      `) as any;

      // 3. Horários de Pico (placeholder - não temos hora exata)
      const peakHours = { morning: 0, afternoon: 0, evening: 0 };

      // 4. Taxa de Cancelamento
      const totalBookings = await db.select({
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(bookings)
      .where(
        and(
          gte(bookings.bookingDate, start),
          lte(bookings.bookingDate, end)
        )
      );

      const cancelledBookings = await db.select({
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(bookings)
      .where(
        and(
          gte(bookings.bookingDate, start),
          lte(bookings.bookingDate, end),
          eq(bookings.status, 'cancelled')
        )
      );

      const cancellationRate = totalBookings[0]?.count > 0
        ? ((cancelledBookings[0]?.count || 0) / totalBookings[0].count) * 100
        : 0;

      // 5. Lead Time Médio (dias entre criação e data da reserva)
      const bookingsWithLeadTime = await db.select({
        bookingDate: bookings.bookingDate,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(
        and(
          gte(bookings.bookingDate, start),
          lte(bookings.bookingDate, end),
          eq(bookings.status, 'confirmed')
        )
      );

      const avgLeadTime = bookingsWithLeadTime.length > 0
        ? bookingsWithLeadTime.reduce((sum, b) => {
            const leadDays = (b.bookingDate - new Date(b.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            return sum + leadDays;
          }, 0) / bookingsWithLeadTime.length
        : 0;

      // 6. Reservas por Cliente
      const bookingsByClient = await db.select({
        clientEmail: bookings.clientEmail,
        clientName: bookings.clientName,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(bookings)
      .where(
        and(
          gte(bookings.bookingDate, start),
          lte(bookings.bookingDate, end),
          eq(bookings.status, 'confirmed')
        )
      )
      .groupBy(bookings.clientEmail, bookings.clientName)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);

      // 7. Ocupação por Tipo de Cota
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

      let fullQuotaBookings = 0;
      let halfQuotaBookings = 0;

      for (const booking of bookingsByClient) {
        const quotaType = emailToQuotaType.get(booking.clientEmail);
        if (quotaType === 'full') {
          fullQuotaBookings += booking.count;
        } else if (quotaType === 'half') {
          halfQuotaBookings += booking.count;
        }
      }

      // 8. Projeção de Ocupação (próximos 30 dias)
      const futureStart = Date.now();
      const futureEnd = futureStart + 30 * 24 * 60 * 60 * 1000;

      const futureBookings = await db.select({
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(bookings)
      .where(
        and(
          gte(bookings.bookingDate, futureStart),
          lte(bookings.bookingDate, futureEnd),
          eq(bookings.status, 'confirmed')
        )
      );

      const projectedOccupancy = allVessels.length > 0
        ? ((futureBookings[0]?.count || 0) / (allVessels.length * 30)) * 100
        : 0;

      return {
        occupancyByVessel,
        bookingsByWeekday,
        peakHours,
        cancellationRate: Math.round(cancellationRate * 10) / 10,
        avgLeadTime: Math.round(avgLeadTime * 10) / 10,
        bookingsByClient,
        occupancyByQuotaType: {
          full: fullQuotaBookings,
          half: halfQuotaBookings,
        },
        projectedOccupancy: Math.round(projectedOccupancy * 10) / 10,
      };
    }),

  // Relatório de Clientes
  clients: adminProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const start = new Date(input.startDate).getTime();
      const end = new Date(input.endDate).getTime();

      // 1. Clientes Ativos vs Inativos
      const allClients = await db.select().from(allowedClients);
      
      const activeClientsData = await db.select({
        clientEmail: bookings.clientEmail,
      })
      .from(bookings)
      .where(
        and(
          gte(bookings.bookingDate, start),
          lte(bookings.bookingDate, end),
          eq(bookings.status, 'confirmed')
        )
      )
      .groupBy(bookings.clientEmail);

      const activeCount = activeClientsData.length;
      const inactiveCount = allClients.length - activeCount;

      // 2. Frequência de Uso por Cliente
      const clientFrequency = await db.select({
        clientEmail: bookings.clientEmail,
        clientName: bookings.clientName,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(bookings)
      .where(
        and(
          gte(bookings.bookingDate, start),
          lte(bookings.bookingDate, end),
          eq(bookings.status, 'confirmed')
        )
      )
      .groupBy(bookings.clientEmail, bookings.clientName)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);

      // 3. Clientes com Maior Gasto
      const clientSpending = await db.select({
        clientEmail: fuelRecords.clientEmail,
        clientName: fuelRecords.clientName,
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
      .groupBy(fuelRecords.clientEmail, fuelRecords.clientName)
      .orderBy(desc(sql`SUM(${fuelRecords.totalAmount})`))
      .limit(10);

      // 4. Clientes Inadimplentes
      const defaultingClients = await db.execute(sql`
        SELECT ac.email, ac.name, COUNT(*) as overdue_count
        FROM subscription_charges sc
        JOIN subscriptions s ON sc.subscription_id = s.id
        JOIN allowed_clients ac ON s.client_id = ac.id
        WHERE sc.status = 'overdue'
        GROUP BY ac.email, ac.name
        ORDER BY overdue_count DESC
      `) as any;

      // 5. Taxa de Retenção (clientes que reservaram em ambos os períodos)
      const previousStart = start - (end - start);
      const previousEnd = start;

      const previousPeriodClients = await db.select({
        clientEmail: bookings.clientEmail,
      })
      .from(bookings)
      .where(
        and(
          gte(bookings.bookingDate, previousStart),
          lte(bookings.bookingDate, previousEnd),
          eq(bookings.status, 'confirmed')
        )
      )
      .groupBy(bookings.clientEmail);

      const currentPeriodClients = await db.select({
        clientEmail: bookings.clientEmail,
      })
      .from(bookings)
      .where(
        and(
          gte(bookings.bookingDate, start),
          lte(bookings.bookingDate, end),
          eq(bookings.status, 'confirmed')
        )
      )
      .groupBy(bookings.clientEmail);

      const previousEmails = new Set(previousPeriodClients.map(c => c.clientEmail));
      const retainedCount = currentPeriodClients.filter(c => previousEmails.has(c.clientEmail)).length;
      const retentionRate = previousPeriodClients.length > 0
        ? (retainedCount / previousPeriodClients.length) * 100
        : 0;

      // 6. Novos Clientes por Período
      const newClients = await db.select({
        email: allowedClients.email,
        name: allowedClients.name,
        createdAt: allowedClients.createdAt,
      })
      .from(allowedClients)
      .where(
        and(
          gte(allowedClients.createdAt, new Date(start).toISOString()),
          lte(allowedClients.createdAt, new Date(end).toISOString())
        )
      );

      // 7. Churn Rate
      const churnedCount = previousPeriodClients.length - retainedCount;
      const churnRate = previousPeriodClients.length > 0
        ? (churnedCount / previousPeriodClients.length) * 100
        : 0;

      // 8. NPS Simulado (baseado em frequência de uso)
      const avgFrequency = clientFrequency.length > 0
        ? clientFrequency.reduce((sum, c) => sum + c.count, 0) / clientFrequency.length
        : 0;
      const simulatedNPS = Math.min(100, Math.round(avgFrequency * 10));

      // 9. Segmentação por Tipo de Cota
      const quotaDistribution = await db.select({
        quotaType: clientQuotas.quotaType,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(clientQuotas)
      .where(eq(clientQuotas.isActive, 1))
      .groupBy(clientQuotas.quotaType);

      return {
        activeCount,
        inactiveCount,
        clientFrequency,
        clientSpending,
        defaultingClients,
        retentionRate: Math.round(retentionRate * 10) / 10,
        newClients,
        churnRate: Math.round(churnRate * 10) / 10,
        simulatedNPS,
        quotaDistribution,
      };
    }),

  // Relatório de Manutenção
  maintenance: adminProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const start = new Date(input.startDate).getTime();
      const end = new Date(input.endDate).getTime();

      // 1. Manutenções Ativas
      const activeMaintenances = await db.select()
        .from(maintenances)
        .where(eq(maintenances.status, 'in_progress'));

      // 2. Tempo Médio de Manutenção
      const completedMaintenances = await db.select()
        .from(maintenances)
        .where(
          and(
            gte(maintenances.startDate, start),
            lte(maintenances.startDate, end),
            eq(maintenances.status, 'completed')
          )
        );

      const avgDuration = completedMaintenances.length > 0
        ? completedMaintenances.reduce((sum, m) => {
            const duration = (m.endDate - m.startDate) / (1000 * 60 * 60 * 24);
            return sum + duration;
          }, 0) / completedMaintenances.length
        : 0;

      // 3. Custo Total de Manutenção (placeholder - precisa de campo cost)
      const totalCost = 0;

      // 4. Manutenções por Embarcação
      const maintenancesByVessel = await db.select({
        vesselName: maintenances.vesselName,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(maintenances)
      .where(
        and(
          gte(maintenances.startDate, start),
          lte(maintenances.startDate, end)
        )
      )
      .groupBy(maintenances.vesselName);

      // 5. Manutenções Preventivas vs Corretivas
      // Manutenções Preventivas (placeholder - não há campo type)
      const preventiveCount = [{ count: 0 }];

      // Manutenções Corretivas (placeholder - não há campo type)
      const correctiveCount = [{ count: 0 }];

      // 6. Taxa de Disponibilidade
      const allVessels = await db.select().from(vessels);
      const daysInPeriod = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      const totalPossibleDays = allVessels.length * daysInPeriod;

      const maintenanceDays = completedMaintenances.reduce((sum, m) => {
        const duration = (m.endDate - m.startDate) / (1000 * 60 * 60 * 24);
        return sum + Math.ceil(duration);
      }, 0);

      const availabilityRate = totalPossibleDays > 0
        ? ((totalPossibleDays - maintenanceDays) / totalPossibleDays) * 100
        : 100;

      // 7. Próximas Manutenções Programadas
      const upcomingMaintenances = await db.select()
        .from(maintenances)
        .where(
          and(
            gte(maintenances.startDate, Date.now()),
            eq(maintenances.status, 'scheduled')
          )
        )
        .orderBy(maintenances.startDate)
        .limit(10);

      // 8. Histórico de Manutenções
      const maintenanceHistory = await db.select()
        .from(maintenances)
        .where(
          and(
            gte(maintenances.startDate, start),
            lte(maintenances.startDate, end)
          )
        )
        .orderBy(desc(maintenances.startDate));

      // 9. Impacto na Receita (reservas perdidas durante manutenção)
      const lostBookings = await db.select({
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(bookings)
      .where(
        and(
          gte(bookings.bookingDate, start),
          lte(bookings.bookingDate, end),
          eq(bookings.status, 'cancelled')
        )
      );

      const estimatedLostRevenue = (lostBookings[0]?.count || 0) * 500; // Estimativa de R$500 por reserva

      // 10. Fornecedores Mais Utilizados (placeholder - precisa de campo provider)
      const topProviders: any[] = [];

      return {
        activeMaintenances,
        avgDuration: Math.round(avgDuration * 10) / 10,
        totalCost,
        maintenancesByVessel,
        preventiveCount: preventiveCount[0]?.count || 0,
        correctiveCount: correctiveCount[0]?.count || 0,
        availabilityRate: Math.round(availabilityRate * 10) / 10,
        upcomingMaintenances,
        maintenanceHistory,
        estimatedLostRevenue,
        topProviders,
      };
    }),

  // Relatório de Combustível
  fuel: adminProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const start = new Date(input.startDate).getTime();
      const end = new Date(input.endDate).getTime();

      // 1. Consumo Total por Embarcação
      const consumptionByVessel = await db.select({
        vesselName: fuelRecords.vesselName,
        totalLiters: sql<number>`SUM(${fuelRecords.liters})`.as('totalLiters'),
      })
      .from(fuelRecords)
      .where(
        and(
          gte(fuelRecords.createdAt, new Date(start).toISOString()),
          lte(fuelRecords.createdAt, new Date(end).toISOString())
        )
      )
      .groupBy(fuelRecords.vesselName);

      // 2. Custo Médio por Litro
      const avgCostPerLiter = await db.select({
        avg: sql<number>`AVG(${fuelRecords.pricePerLiter})`.as('avg'),
      })
      .from(fuelRecords)
      .where(
        and(
          gte(fuelRecords.createdAt, new Date(start).toISOString()),
          lte(fuelRecords.createdAt, new Date(end).toISOString())
        )
      );

      // 3. Eficiência de Combustível (placeholder - precisaria de dados de distância/horas)
      const fuelEfficiency: any[] = [];

      // 4. Comparação de Consumo entre Embarcações
      const vesselComparison = consumptionByVessel.map(v => ({
        vesselName: v.vesselName,
        totalLiters: v.totalLiters,
      }));

      // 5. Abastecimentos Operacionais vs Clientes
      const operationalFuel = await db.select({
        total: sql<number>`SUM(${fuelRecords.liters})`.as('total'),
      })
      .from(fuelRecords)
      .where(
        and(
          gte(fuelRecords.createdAt, new Date(start).toISOString()),
          lte(fuelRecords.createdAt, new Date(end).toISOString()),
          eq(fuelRecords.isOperational, 1)
        )
      );

      const clientFuel = await db.select({
        total: sql<number>`SUM(${fuelRecords.liters})`.as('total'),
      })
      .from(fuelRecords)
      .where(
        and(
          gte(fuelRecords.createdAt, new Date(start).toISOString()),
          lte(fuelRecords.createdAt, new Date(end).toISOString()),
          eq(fuelRecords.isOperational, 0)
        )
      );

      // 6. Projeção de Estoque (baseado em consumo médio diário)
      const totalConsumption = consumptionByVessel.reduce((sum, v) => sum + v.totalLiters, 0);
      const daysInPeriod = (end - start) / (1000 * 60 * 60 * 24);
      const dailyAvgConsumption = daysInPeriod > 0 ? totalConsumption / daysInPeriod : 0;

      // Buscar estoque atual do mês corrente
      const currentMonthYear = new Date().toISOString().slice(0, 7);
      const currentStock = await db.select()
        .from(fuelBudget)
        .where(eq(fuelBudget.monthYear, currentMonthYear))
        .limit(1);

      const stockLiters = currentStock[0]?.stockLiters || 0;
      const daysUntilEmpty = dailyAvgConsumption > 0 ? stockLiters / dailyAvgConsumption : 0;

      // 7. Histórico de Preços
      const priceHistory = await db.execute(sql`
        SELECT DATE_FORMAT(created_at, '%Y-%m') as month, AVG(price_per_liter) as avgPrice
        FROM fuel_records
        WHERE created_at >= ${new Date(start).toISOString()}
          AND created_at <= ${new Date(end).toISOString()}
        GROUP BY month
        ORDER BY month
      `) as any;

      return {
        consumptionByVessel,
        avgCostPerLiter: avgCostPerLiter[0]?.avg || 0,
        fuelEfficiency,
        vesselComparison,
        operationalFuel: operationalFuel[0]?.total || 0,
        clientFuel: clientFuel[0]?.total || 0,
        stockProjection: {
          currentStock: stockLiters,
          dailyConsumption: Math.round(dailyAvgConsumption * 10) / 10,
          daysUntilEmpty: Math.round(daysUntilEmpty * 10) / 10,
        },
        priceHistory,
      };
    }),

  // Relatório de Sazonalidade
  seasonality: adminProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const start = new Date(input.startDate).getTime();
      const end = new Date(input.endDate).getTime();

      // 1. Ocupação por Mês
      const occupancyByMonth = await db.execute(sql`
        SELECT DATE_FORMAT(FROM_UNIXTIME(booking_date / 1000), '%Y-%m') as month, COUNT(*) as count
        FROM bookings
        WHERE booking_date >= ${start}
          AND booking_date <= ${end}
          AND status = 'confirmed'
        GROUP BY month
        ORDER BY month
      `) as any;

      // 2. Receita por Mês
      const revenueByMonth = await db.execute(sql`
        SELECT DATE_FORMAT(created_at, '%Y-%m') as month, SUM(total_amount) as total
        FROM fuel_records
        WHERE created_at >= ${new Date(start).toISOString()}
          AND created_at <= ${new Date(end).toISOString()}
          AND payment_status = 'paid'
        GROUP BY month
        ORDER BY month
      `) as any;

      // 3. Picos de Demanda (top 3 meses)
      const peakMonths = [...occupancyByMonth].sort((a: any, b: any) => b.count - a.count).slice(0, 3);

      // 4. Períodos de Baixa (bottom 3 meses)
      const lowMonths = [...occupancyByMonth].sort((a: any, b: any) => a.count - b.count).slice(0, 3);

      // 5. Comparação Ano a Ano (placeholder - precisa de mais de 1 ano de dados)
      const yearOverYear: any[] = [];

      // 6. Previsão de Alta Temporada (baseado em histórico)
      const highSeasonMonths = peakMonths.map((m: any) => m.month);

      // 7. Taxa de Ocupação por Dia da Semana
      const occupancyByWeekday = await db.execute(sql`
        SELECT DAYNAME(FROM_UNIXTIME(booking_date / 1000)) as weekday, COUNT(*) as count
        FROM bookings
        WHERE booking_date >= ${start}
          AND booking_date <= ${end}
          AND status = 'confirmed'
        GROUP BY weekday
        ORDER BY count DESC
      `) as any;

      // 8. Eventos Especiais (placeholder - precisa de calendário de feriados)
      const specialEvents: any[] = [];

      return {
        occupancyByMonth,
        revenueByMonth,
        peakMonths,
        lowMonths,
        yearOverYear,
        highSeasonMonths,
        occupancyByWeekday,
        specialEvents,
      };
    }),
});
