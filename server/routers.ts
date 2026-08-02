import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { backupRouter } from "./routers/backupRouter";
import { reportsRouter } from "./routers/reportsRouter";
import { expensesRouter } from "./routers/expensesRouter";
import { bpoRouter } from "./routers/bpoRouter";
import { contractRouter } from "./routers/contractRouter";
import { notificationRouter } from "./routers/notificationRouter";
import { fuelRecordsRouter, fuelBudgetRouter, fuelPurchasesRouter } from "./routers/fuelRouter";
import { inspectionsRouter, inspectionChargesRouter } from "./routers/inspectionsRouter";
import { bookingsRouter } from "./routers/bookingsRouter";
import { maintenancesRouter } from "./routers/maintenancesRouter";
import { dueDateRequestsRouter } from "./routers/dueDateRequestsRouter";
import { clientPaymentsRouter } from "./routers/clientPaymentsRouter";
import { systemSettingsRouter } from "./routers/systemSettingsRouter";
import { publicProcedure, protectedProcedure, adminProcedure, employeeProcedure, allowedClientProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { notifyNewBooking, notifyBookingCancellation, notifyBookingUsed, notifyClientMaintenanceCancellation, notifyAdminMaintenanceCancellations, notifyClientBookingConfirmation, notifyClientBookingCancellation, notifyAdminMaintenanceStatusChange, notifyClientsMaintenanceStatusChange } from "./_core/emailNotification";
import { notifyOwner } from "./_core/notification";
import { sendWelcomeEmail } from "./_core/welcomeEmail";
import * as db from "./db";
import * as stats from "./stats";
import * as weather from "./weather";
import * as systemSettings from "./systemSettings";
import { sql } from "drizzle-orm";

export const appRouter = router({
  system: systemRouter,
  backup: backupRouter,
  reports: reportsRouter,
  expenses: expensesRouter,
  bpo: bpoRouter,
  contract: contractRouter,
  notification: notificationRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    updateName: protectedProcedure
      .input(z.object({ name: z.string().min(1, "Nome é obrigatório") }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserName(ctx.user.id, input.name);
        return { success: true };
      }),
    updateEmail: protectedProcedure
      .input(z.object({ email: z.string().email("Email inválido") }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserEmail(ctx.user.id, input.email);
        return { success: true };
      }),
  }),

  // Allowed Clients Management (Admin only)
  allowedClients: router({
    list: adminProcedure.query(async () => {
      return await db.getAllowedClients();
    }),

    create: adminProcedure
      .input(z.object({
        email: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }),
        name: z.string().min(1),
        phone: z.string().optional(),
        cpfCnpj: z.string().optional(),
        rg: z.string().optional(),
        address: z.string().optional(),
        neighborhood: z.string().optional(),
        city: z.string().optional(),
        state: z.string().max(2).optional(),
        zipCode: z.string().optional(),
        quotas: z.array(z.object({
          vesselId: z.number(),
          quotaNumber: z.number().min(1).max(10), // 1-7 para lancha, 1-6 para jetski
          quotaType: z.enum(["full", "half"]),
        })).optional().default([]),
      }))
      .mutation(async ({ input }) => {
        const existing = await db.getAllowedClientByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Email já cadastrado' });
        }
        
        // Validate quota numbers based on vessel quotaCount
        for (const quota of input.quotas) {
          const vessel = await db.getVesselById(quota.vesselId);
          if (!vessel) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Embarcação não encontrada' });
          }
          
          const maxQuota = vessel.quotaCount || 10;
          if (quota.quotaNumber < 1 || quota.quotaNumber > maxQuota) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: `Número de cota inválido. Permitido: 1-${maxQuota}` 
            });
          }
        }
        
        // Create client
        const result = await db.createAllowedClient({
          email: input.email,
          name: input.name,
          phone: input.phone,
          cpfCnpj: input.cpfCnpj,
          rg: input.rg,
          address: input.address,
          neighborhood: input.neighborhood,
          city: input.city,
          state: input.state,
          zipCode: input.zipCode,
        });
        
        // Get the created client ID
        const client = await db.getAllowedClientByEmail(input.email);
        if (!client) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        
        // Create quotas
        const quotaNames: string[] = [];
        for (const quota of input.quotas) {
          await db.createClientQuota({
            clientId: client.id,
            vesselId: quota.vesselId,
            quotaNumber: quota.quotaNumber,
            quotaType: quota.quotaType,
          });
          
          // Get vessel name for welcome email
          const vessel = await db.getVesselById(quota.vesselId);
          if (vessel) {
            quotaNames.push(`${vessel.name} - Cota ${quota.quotaNumber}`);
          }
        }
        
        // Send welcome email only if there are quotas
        if (quotaNames.length > 0) {
          await sendWelcomeEmail({
            clientName: input.name,
            clientEmail: input.email,
            quotaName: quotaNames.join(', '),
          });
        }

        return { success: true, id: client.id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        email: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }).optional(),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        cpfCnpj: z.string().optional(),
        rg: z.string().optional(),
        address: z.string().optional(),
        neighborhood: z.string().optional(),
        city: z.string().optional(),
        state: z.string().max(2).optional(),
        zipCode: z.string().optional(),
        contractUrl: z.string().optional(),
        contract2Url: z.string().optional(),
        documentUrl: z.string().optional(),
        isActive: z.boolean().optional(),
        quotas: z.array(z.object({
          vesselId: z.number(),
          quotaNumber: z.number().min(1).max(10),
          quotaType: z.enum(["full", "half"]),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, quotas, isActive, ...data } = input;
        
        // Update client basic info
        await db.updateAllowedClient(id, { ...data, isActive: isActive !== undefined ? (isActive ? 1 : 0) : undefined });
        
        // Update quotas if provided
        if (quotas) {
          // Delete existing quotas
          await db.deleteClientQuotasByClientId(id);
          
          // Create new quotas
          for (const quota of quotas) {
            await db.createClientQuota({
              clientId: id,
              vesselId: quota.vesselId,
              quotaNumber: quota.quotaNumber,
              quotaType: quota.quotaType,
            });
          }
        }
        
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteAllowedClient(input.id);
        return { success: true };
      }),

    deleteDocument: adminProcedure
      .input(z.object({
        clientId: z.number(),
        documentType: z.enum(["contract", "contract2", "document"]),
      }))
      .mutation(async ({ input }) => {
        const { clientId, documentType } = input;
        
        // Map document type to database column
        const columnMap = {
          contract: "contractUrl",
          contract2: "contract2Url",
          document: "documentUrl",
        };
        
        const column = columnMap[documentType];
        
        // Update client to set document URL to null
        await db.updateAllowedClient(clientId, { [column]: null });
        
        return { success: true };
      }),

    generateReport: adminProcedure
      .input(z.object({ clientId: z.number() }))
      .mutation(async ({ input }) => {
        // Buscar dados do cliente
        const client = await db.getAllowedClientById(input.clientId);
        if (!client) {
          throw new TRPCError({ 
            code: 'NOT_FOUND', 
            message: 'Cliente não encontrado' 
          });
        }

        // Buscar cotas do cliente
        const quotas = await db.getClientQuotasByClientId(input.clientId);
        const quotasWithVessels = await Promise.all(
          quotas.map(async (quota) => {
            const vessel = await db.getVesselById(quota.vesselId);
            return {
              vesselName: vessel?.name || 'Embarcação desconhecida',
              quotaNumber: quota.quotaNumber,
              quotaType: quota.quotaType,
            };
          })
        );

        // Gerar PDF
        const { generateClientReport } = await import('./_core/clientReportPDF');
        const pdfBuffer = await generateClientReport({
          name: client.name,
          email: client.email,
          phone: client.phone || undefined,
          quotas: quotasWithVessels,
          contractUrl: client.contractUrl || undefined,
          contract2Url: client.contract2Url || undefined,
          documentUrl: client.documentUrl || undefined,
        });

        // Retornar PDF em base64
        const base64 = pdfBuffer.toString('base64');
        return { 
          success: true, 
          pdf: base64,
          filename: `cliente-${client.name.replace(/\s+/g, '-')}-${Date.now()}.pdf`
        };
      }),
  }),

  // Vessels Management
  vessels: router({
    list: publicProcedure.query(async () => {
      return await db.getActiveVessels();
    }),

    listAll: adminProcedure.query(async () => {
      return await db.getVessels();
    }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        type: z.enum(["lancha", "jetski"]),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        capacity: z.number().optional(),
        quotaCount: z.number().min(1).max(10),
      }))
      .mutation(async ({ input }) => {
        await db.createVessel(input);
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        type: z.enum(["lancha", "jetski"]).optional(),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        capacity: z.number().optional(),
        quotaCount: z.number().min(1).max(10).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, isActive, ...data } = input;
        await db.updateVessel(id, { ...data, isActive: isActive !== undefined ? (isActive ? 1 : 0) : undefined });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteVessel(input.id);
        return { success: true };
      }),

    // Get vessels where client has quotas (for document access)
    getMyVessels: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Email não encontrado' });
      }

      // Get client by email
      const client = await db.getAllowedClientByEmail(ctx.user.email);
      if (!client) {
        return [];
      }

      // Get vessels where client has active quotas
      const quotas = await db.getClientQuotasByClientId(client.id);
      const vesselIds = Array.from(new Set(quotas.map(q => q.vesselId)));
      
      const vessels = [];
      for (const vesselId of vesselIds) {
        const vessel = await db.getVesselById(vesselId);
        if (vessel) {
          vessels.push({
            id: vessel.id,
            name: vessel.name,
            type: vessel.type,
            documentUrl: vessel.documentUrl,
            extraDocumentUrl: vessel.extraDocumentUrl,
          });
        }
      }
      
      return vessels;
    }),

    // Update vessel documents (admin only)
    updateDocuments: adminProcedure
      .input(z.object({
        id: z.number(),
        documentUrl: z.string().optional(),
        extraDocumentUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateVessel(id, data);
        return { success: true };
      }),

    // Delete vessel document (admin only)
    deleteDocument: adminProcedure
      .input(z.object({
        id: z.number(),
        documentType: z.enum(['document', 'extraDocument']),
      }))
      .mutation(async ({ input }) => {
        const updateData: Record<string, null> = {};
        if (input.documentType === 'document') {
          updateData.documentUrl = null;
        } else {
          updateData.extraDocumentUrl = null;
        }
        await db.updateVessel(input.id, updateData);
        return { success: true };
      }),
  }),

  // Bookings & Maintenances — extraídos para server/routers/ (Story 40, SYS-03)
  bookings: bookingsRouter,
  maintenances: maintenancesRouter,

  // Weather
  weather: router({
    forecast: publicProcedure
      .input(z.object({ date: z.number() })) // Unix timestamp
      .query(async ({ input }) => {
        const date = new Date(input.date);
        const forecast = await weather.getWeatherForecast(date);
        return forecast ? {
          ...forecast,
          emoji: weather.getWeatherEmoji(forecast.icon),
        } : null;
      }),
  }),

  // Statistics
  stats: router({
    client: allowedClientProcedure.query(async ({ ctx }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Email não encontrado' });
      }
      return await stats.getClientStats(ctx.user.email);
    }),
    admin: adminProcedure.query(async () => {
      return await stats.getAdminStats();
    }),
  }),

  reviews: router({
    create: allowedClientProcedure
      .input(z.object({
        bookingId: z.number(),
        vesselId: z.number(),
        vesselName: z.string(),
        rating: z.number().min(1).max(5),
        comment: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        
        const { sql } = await import('drizzle-orm');
        
        // Check if already reviewed
        const existing = await db.execute(sql`
          SELECT id FROM reviews WHERE booking_id = ${input.bookingId}
        `) as any;
        
        if ((Array.isArray(existing[0]) ? existing[0] : existing).length > 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Você já avaliou esta reserva' });
        }
        
        await db.execute(sql`
          INSERT INTO reviews (booking_id, client_email, client_name, vessel_id, vessel_name, rating, comment) 
          VALUES (${input.bookingId}, ${ctx.user.email || ''}, ${ctx.user.name || ''}, ${input.vesselId}, ${input.vesselName}, ${input.rating}, ${input.comment || null})
        `);
        
        return { success: true };
      }),
    
    listAll: adminProcedure.query(async () => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) return [];
      
      const { sql } = await import('drizzle-orm');
      const result = await db.execute(sql`
        SELECT * FROM reviews ORDER BY created_at DESC
      `) as any;
      
      return (Array.isArray(result[0]) ? result[0] : result);
    }),
    
    listByVessel: publicProcedure
      .input(z.object({ vesselId: z.number() }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) return [];
        
        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT * FROM reviews WHERE vessel_id = ${input.vesselId} ORDER BY created_at DESC
        `) as any;
        
        return (Array.isArray(result[0]) ? result[0] : result);
      }),
    
    stats: publicProcedure
      .input(z.object({ vesselId: z.number() }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) return { averageRating: 0, totalReviews: 0 };
        
        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT AVG(rating) as avgRating, COUNT(*) as total FROM reviews WHERE vessel_id = ${input.vesselId}
        `) as any;
        
        const stats = (Array.isArray(result[0]) ? result[0][0] : result[0]);
        return {
          averageRating: stats?.avgRating ? Math.round(stats.avgRating * 10) / 10 : 0,
          totalReviews: stats?.total || 0,
        };
      }),
  }),

  // Employee router - For employee and admin users
  employee: router({
    // Get upcoming reservations (today + next 20 future confirmed)
    // Lógica: reservas do dia atual só aparecem até 18h (horário de Brasília)
    // Após 18h, reservas do dia atual são consideradas passadas
    upcomingReservations: employeeProcedure.query(async () => {
      const dbInstance = await import('./db').then(m => m.getDb());
      if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const { sql: sqlTag } = await import('drizzle-orm');
      
      // Calcular o timestamp de corte baseado no horário de Brasília (GMT-3)
      const now = new Date();
      // Converter para horário de Brasília
      const brasiliaOffset = -3 * 60; // GMT-3 em minutos
      const localOffset = now.getTimezoneOffset();
      const brasiliaTime = new Date(now.getTime() + (localOffset + brasiliaOffset) * 60 * 1000);
      
      const currentHour = brasiliaTime.getHours();
      
      // Se for após 18h, o corte é amanhã à meia-noite
      // Se for antes das 18h, o corte é hoje à meia-noite
      const cutoffDate = new Date(brasiliaTime);
      if (currentHour >= 18) {
        // Após 18h: reservas de hoje são passadas, mostrar a partir de amanhã
        cutoffDate.setDate(cutoffDate.getDate() + 1);
      }
      cutoffDate.setHours(0, 0, 0, 0);
      const cutoffTimestamp = cutoffDate.getTime();
      
      const result = await dbInstance.execute(sqlTag`
        SELECT
          b.id,
          b.client_email as clientEmail,
          b.client_name as clientName,
          b.vessel_id as vesselId,
          b.vessel_name as vesselName,
          b.booking_date as bookingDate,
          b.status,
          b.notes,
          b.created_at as createdAt,
          b.updated_at as updatedAt,
          ac.phone as clientPhone
        FROM bookings b
        LEFT JOIN allowed_clients ac ON b.client_email = ac.email
        WHERE b.booking_date >= ${cutoffTimestamp}
          AND b.status = 'confirmed'
        ORDER BY b.booking_date ASC
        LIMIT 21
      `) as any;
      return (Array.isArray(result[0]) ? result[0] : result) as any[];
    }),
  }),

  // Employees router - Admin only
  employees: router({
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }),
        phone: z.string().optional(),
        vesselIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { employees } = await import('../drizzle/schema');

        try {
          await db.insert(employees).values({
            name: input.name,
            email: input.email,
            phone: input.phone || null,
            vesselIds: input.vesselIds ? JSON.stringify(input.vesselIds) : null,
            isActive: 1,
          });
          return { success: true };
        } catch (error: any) {
          console.error('[employees.create] Error:', error);
          // Tratar erro de email duplicado (MySQL error code 1062)
          // Drizzle encapsula o erro do MySQL em error.cause
          const cause = error.cause || error;
          const errorMsg = error.message || String(error);
          const causeMsg = cause.sqlMessage || cause.message || '';
          
          // Verificar código de erro duplicado em múltiplos níveis
          if (
            error.code === 'ER_DUP_ENTRY' || 
            error.errno === 1062 ||
            cause.code === 'ER_DUP_ENTRY' || 
            cause.errno === 1062 ||
            errorMsg.includes('Duplicate entry') || 
            causeMsg.includes('Duplicate entry') ||
            errorMsg.includes('duplicate key') ||
            causeMsg.includes('duplicate key')
          ) {
            throw new TRPCError({ 
              code: 'CONFLICT', 
              message: `Email ${input.email} já está cadastrado` 
            });
          }
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao cadastrar funcionário: ${errorMsg}` 
          });
        }
      }),

    list: adminProcedure.query(async () => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) return [];

      const result = await db.execute(
        'SELECT * FROM employees WHERE is_active = 1 ORDER BY created_at DESC'
      ) as any;

      // db.execute retorna [rows, fields], pegar apenas rows
      const rows = Array.isArray(result[0]) ? result[0] : result;

      return rows.map((row: any) => ({
        ...row,
        vesselIds: row.vessel_ids ? JSON.parse(row.vessel_ids) : [],
      }));
    }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        email: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }).optional(),
        phone: z.string().optional(),
        vesselIds: z.array(z.number()).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { employees } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');

        const updateData: Record<string, unknown> = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.email !== undefined) updateData.email = input.email;
        if (input.phone !== undefined) updateData.phone = input.phone || null;
        if (input.vesselIds !== undefined) updateData.vesselIds = JSON.stringify(input.vesselIds);
        if (input.isActive !== undefined) updateData.isActive = input.isActive ? 1 : 0;

        if (Object.keys(updateData).length === 0) {
          return { success: true };
        }

        try {
          await db.update(employees).set(updateData).where(eq(employees.id, input.id));
          
          return { success: true };
        } catch (error: any) {
          console.error('[employees.update] Error:', error);
          // Tratar erro de email duplicado
          if (error.message && error.message.includes('Duplicate entry')) {
            throw new TRPCError({ 
              code: 'CONFLICT', 
              message: `Email ${input.email} já está cadastrado` 
            });
          }
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao atualizar funcionário: ${error.message}` 
          });
        }
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { employees, users } = await import('../drizzle/schema');
        const { eq, sql } = await import('drizzle-orm');

        try {
          // 1. Buscar email do funcionário antes de deletar
          const result = await db.execute(sql`SELECT email FROM employees WHERE id = ${input.id}`);
          const employeeEmail = (result[0] as any)?.[0]?.email;

          // 2. Hard delete da tabela employees para liberar o email imediatamente
          await db.delete(employees)
            .where(eq(employees.id, input.id));
          
          // 3. Remover também da tabela users (se existir) para evitar órfãos
          if (employeeEmail) {
            await db.delete(users)
              .where(eq(users.email, employeeEmail));
          }
          
          return { success: true };
        } catch (error: any) {
          console.error('[employees.delete] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao desativar funcionário: ${error.message}` 
          });
        }
      }),
  }),

  // Fuel domain — extraído para server/routers/fuelRouter.ts (Story 40, SYS-03)
  fuelRecords: fuelRecordsRouter,
  fuelBudget: fuelBudgetRouter,
  fuelPurchases: fuelPurchasesRouter,

  // Inspections domain — extraído para server/routers/inspectionsRouter.ts (Story 40, SYS-03)
  inspections: inspectionsRouter,
  inspectionCharges: inspectionChargesRouter,

  // Extraídos para server/routers/ (Story 40, SYS-03)
  dueDateRequests: dueDateRequestsRouter,
  clientPayments: clientPaymentsRouter,
  systemSettings: systemSettingsRouter,
});
export type AppRouter = typeof appRouter;
