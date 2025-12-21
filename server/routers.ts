import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { webhookRouter } from "./webhookRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { notifyNewBooking, notifyBookingCancellation, notifyBookingUsed, notifyClientMaintenanceCancellation, notifyAdminMaintenanceCancellations, notifyClientBookingConfirmation, notifyClientBookingCancellation, notifyAdminMaintenanceStatusChange, notifyClientsMaintenanceStatusChange } from "./_core/emailNotification";
import { notifyOwner } from "./_core/notification";
import { sendWelcomeEmail } from "./_core/welcomeEmail";
import * as db from "./db";
import * as stats from "./stats";
import * as weather from "./weather";

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

// Allowed client procedure - checks if user email is in allowed clients
const allowedClientProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role === 'admin') {
    return next({ ctx });
  }
  
  if (!ctx.user.email) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Email não encontrado' });
  }

  const allowedClient = await db.getAllowedClientByEmail(ctx.user.email);
  if (!allowedClient || !allowedClient.isActive) {
    throw new TRPCError({ 
      code: 'FORBIDDEN', 
      message: 'Seu email não está autorizado a fazer reservas. Entre em contato com o administrador.' 
    });
  }

  return next({ ctx });
});

// Employee procedure - checks if user is employee or admin
const employeeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'employee' && ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee access required' });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  webhooks: webhookRouter,
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
        quotas: z.array(z.object({
          vesselId: z.number(),
          quotaNumber: z.number().min(1).max(10), // 1-7 para lancha, 1-6 para jetski
          quotaType: z.enum(["full", "half"]),
        })),
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
        
        // Send welcome email
        await sendWelcomeEmail({
          clientName: input.name,
          clientEmail: input.email,
          quotaName: quotaNames.join(', '),
        });
        
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        email: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }).optional(),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        isActive: z.boolean().optional(),
        quotas: z.array(z.object({
          vesselId: z.number(),
          quotaNumber: z.number().min(1).max(10),
          quotaType: z.enum(["full", "half"]),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, quotas, ...data } = input;
        
        // Update client basic info
        await db.updateAllowedClient(id, data);
        
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
        const { id, ...data } = input;
        await db.updateVessel(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteVessel(input.id);
        return { success: true };
      }),
  }),

  // Bookings
  bookings: router({
    // Get recent bookings for fuel registration and inspections (Admin and Employee)
    getRecent: publicProcedure
      .input(z.object({ 
        days: z.number().optional(), // Se não fornecido, retorna todas
        includeUsed: z.boolean().default(false), // Incluir reservas já usadas
        onlyUsed: z.boolean().default(false) // Apenas reservas já usadas (para abastecimento)
      }))
      .query(async ({ input, ctx }) => {
        // Validar que apenas admin ou employee podem acessar
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado. Apenas funcionários e administradores podem acessar.' });
        }
        
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        let query = `SELECT 
          b.id,
          b.vessel_id as vesselId,
          b.booking_date as startTime,
          b.booking_date as endTime,
          b.status,
          b.client_name as clientName,
          b.client_email as clientEmail,
          b.vessel_name as vesselName
        FROM bookings b
        WHERE `;
        
        const params: any[] = [];
        
        // Se onlyUsed for true, retorna apenas reservas utilizadas (para abastecimento)
        if (input.onlyUsed) {
          query += `b.status = 'used'`;
        } else {
          query += `(b.status = 'confirmed' OR b.status = 'used')`;
        }
        
        // Se days for fornecido, filtra por período
        if (input.days !== undefined) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - input.days);
          query += ' AND b.booking_date >= ?';
          params.push(cutoffDate.getTime());
        }
        
        query += ' ORDER BY b.booking_date DESC';
        
        // Para abastecimento, limita a 6 registros
        if (input.onlyUsed) {
          query += ' LIMIT 6';
        }

        const { sql: sqlTag } = await import('drizzle-orm');
        const result = await db.execute(sqlTag.raw(query)) as any;
        return (Array.isArray(result[0]) ? result[0] : result) as any[];
      }),

    // Get user's own bookings
    myBookings: allowedClientProcedure.query(async ({ ctx }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      return await db.getBookingsByEmail(ctx.user.email);
    }),

    // Get user's quota information by vessel
    myQuota: allowedClientProcedure
      .input(z.object({
        vesselId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (!ctx.user.email) {
          throw new TRPCError({ code: 'UNAUTHORIZED' });
        }
        
        const client = await db.getAllowedClientByEmail(ctx.user.email);
        if (!client) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado' });
        }
        
        // If no vessel specified, return all quotas
        if (!input?.vesselId) {
          const allQuotas = await db.getClientQuotasByClientId(client.id);
          let maxBookings = 0;
          for (const quota of allQuotas) {
            maxBookings += quota.quotaType === 'full' ? 2 : 1;
          }
          return {
            quotas: allQuotas,
            maxBookings,
            hasQuota: allQuotas.length > 0,
          };
        }
        
        // Get quotas for this vessel
        const quotas = await db.getClientQuotaByVessel(client.id, input.vesselId);
        
        // Calculate max bookings: full = 2 per quota, half = 1 per quota
        let maxBookings = 0;
        for (const quota of quotas) {
          maxBookings += quota.quotaType === 'full' ? 2 : 1;
        }
        
        return {
          quotas,
          maxBookings,
          hasQuota: quotas.length > 0,
        };
      }),
    
    // Get all user's quotas
    myQuotas: allowedClientProcedure.query(async ({ ctx }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      return await db.getClientQuotasByEmail(ctx.user.email);
    }),

    // Get all bookings (admin only)
    listAll: adminProcedure
      .input(z.object({
        timeFilter: z.enum(["future", "past"]).default("future"),
      }).optional())
      .query(async ({ input }) => {
        const dbInstance = await import('./db').then(m => m.getDb());
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql: sqlTag } = await import('drizzle-orm');
        const now = Date.now();
        const timeFilter = input?.timeFilter || "future";

        let query = `
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
            b.updated_at as updatedAt
          FROM bookings b
          WHERE `;

        if (timeFilter === "future") {
          // Futuras: data >= hoje, ordenadas da mais próxima
          query += `b.booking_date >= ${now} ORDER BY b.booking_date ASC`;
        } else {
          // Passadas: data < hoje, ordenadas da mais recente
          query += `b.booking_date < ${now} ORDER BY b.booking_date DESC`;
        }

        const result = await dbInstance.execute(sqlTag.raw(query)) as any;
        return (Array.isArray(result[0]) ? result[0] : result) as any[];
      }),

    // Get bookings by date range (for calendar availability)
    getByDateRange: allowedClientProcedure
      .input(z.object({
        startDate: z.number(),
        endDate: z.number(),
      }))
      .query(async ({ input }) => {
        return await db.getBookingsByDateRange(input.startDate, input.endDate);
      }),
    
    // Get all bookings for a specific month (for employee calendar)
    getByMonth: publicProcedure
      .input(z.object({
        year: z.number(),
        month: z.number(), // 1-12
      }))
      .query(async ({ input, ctx }) => {
        // Only allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        
        // Calculate start and end of month in UTC
        const startDate = new Date(Date.UTC(input.year, input.month - 1, 1, 0, 0, 0)).getTime();
        const endDate = new Date(Date.UTC(input.year, input.month, 0, 23, 59, 59)).getTime();
        
        const query = `SELECT 
          b.id,
          b.vesselId,
          b.bookingDate as booking_date,
          b.startTime,
          b.endTime,
          b.status,
          b.notes,
          u.name as client_name,
          u.email as client_email,
          v.name as vessel_name
        FROM bookings b
        JOIN users u ON b.userId = u.id
        JOIN vessels v ON b.vesselId = v.id
        WHERE b.bookingDate >= ? AND b.bookingDate <= ?
        ORDER BY b.bookingDate ASC`;
        
        const { sql: sqlTag } = await import('drizzle-orm');
        const result = await db.execute(sqlTag.raw(query)) as any;
        return (Array.isArray(result[0]) ? result[0] : result) as any[];
      }),

    // Create booking with validation
    create: allowedClientProcedure
      .input(z.object({
        vesselId: z.number(),
        bookingDate: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.email || !ctx.user.name) {
          throw new TRPCError({ code: 'UNAUTHORIZED' });
        }

        // Check if date is a Monday (0 = Sunday, 1 = Monday)
        // Use UTC to avoid timezone issues
        const date = new Date(input.bookingDate);
        const dayOfWeek = date.getUTCDay();
        if (dayOfWeek === 1) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Reservas não são permitidas às segundas-feiras' 
          });
        }

        // Check if date is in the past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (input.bookingDate < today.getTime()) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Não é possível reservar datas passadas' 
          });
        }

        // Check if vessel exists and is active
        const vessel = await db.getVesselById(input.vesselId);
        if (!vessel || !vessel.isActive) {
          throw new TRPCError({ 
            code: 'NOT_FOUND', 
            message: 'Embarcação não encontrada ou inativa' 
          });
        }

        // Check if vessel is under maintenance for this date
        const maintenances = await db.getActiveMaintenancesByVesselAndDate(input.vesselId, input.bookingDate);
        if (maintenances.length > 0) {
          const maintenance = maintenances[0];
          throw new TRPCError({ 
            code: 'CONFLICT', 
            message: `Esta embarcação está em manutenção de ${new Date(maintenance.startDate).toLocaleDateString('pt-BR')} até ${new Date(maintenance.endDate).toLocaleDateString('pt-BR')}` 
          });
        }

        // Check if vessel is already booked for this date
        const existingBookings = await db.getBookingsByVesselAndDate(input.vesselId, input.bookingDate);
        if (existingBookings.length > 0) {
          throw new TRPCError({ 
            code: 'CONFLICT', 
            message: 'Esta embarcação já está reservada para esta data' 
          });
        }

        // Check user's quota for this specific vessel
        const client = await db.getAllowedClientByEmail(ctx.user.email);
        if (!client) {
          throw new TRPCError({ 
            code: 'UNAUTHORIZED', 
            message: 'Cliente não autorizado' 
          });
        }

        // Get quotas for this vessel
        const quotas = await db.getClientQuotaByVessel(client.id, input.vesselId);
        if (quotas.length === 0) {
          throw new TRPCError({ 
            code: 'FORBIDDEN', 
            message: `Você não possui cota para esta embarcação (${vessel.name}). Entre em contato com o administrador.` 
          });
        }

        // Calculate max bookings for this vessel: full = 2 per quota, half = 1 per quota
        let maxBookingsForVessel = 0;
        for (const quota of quotas) {
          maxBookingsForVessel += quota.quotaType === 'full' ? 2 : 1;
        }

        // Count active bookings for this vessel only
        const allActiveBookings = await db.getActiveBookingsByEmail(ctx.user.email);
        const activeBookingsForVessel = allActiveBookings.filter(b => b.vesselId === input.vesselId);
        
        if (activeBookingsForVessel.length >= maxBookingsForVessel) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: `Você já atingiu o limite de ${maxBookingsForVessel} reserva(s) simultânea(s) para ${vessel.name}. Utilize uma reserva para liberar um novo agendamento.` 
          });
        }

        // Create booking
        await db.createBooking({
          clientEmail: ctx.user.email,
          clientName: ctx.user.name,
          vesselId: input.vesselId,
          vesselName: vessel.name,
          bookingDate: input.bookingDate,
          status: 'confirmed',
          notes: input.notes,
        });

        // Send notification to admin
        await notifyNewBooking({
          clientName: ctx.user.name,
          clientEmail: ctx.user.email,
          vesselName: vessel.name,
          bookingDate: new Date(input.bookingDate),
          notes: input.notes,
        });
        
        // Send confirmation email to client
        await notifyClientBookingConfirmation({
          clientName: ctx.user.name,
          clientEmail: ctx.user.email,
          vesselName: vessel.name,
          bookingDate: new Date(input.bookingDate),
          notes: input.notes,
        });

        return { success: true };
      }),

    // Create booking for any client (admin only, no limits)
    createForClient: adminProcedure
      .input(z.object({
        clientEmail: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }),
        vesselId: z.number(),
        bookingDate: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Get client info
        const client = await db.getAllowedClientByEmail(input.clientEmail);
        if (!client) {
          throw new TRPCError({ 
            code: 'NOT_FOUND', 
            message: 'Cliente não encontrado na lista de autorizados' 
          });
        }

        // Check if vessel exists
        const vessel = await db.getVesselById(input.vesselId);
        if (!vessel) {
          throw new TRPCError({ 
            code: 'NOT_FOUND', 
            message: 'Embarcação não encontrada' 
          });
        }

        // Check if it's a Monday (not allowed)
        const bookingDate = new Date(input.bookingDate);
        const dayOfWeek = bookingDate.getUTCDay();
        if (dayOfWeek === 1) { // 1 = Monday
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Reservas não são permitidas às segundas-feiras' 
          });
        }

        // Check if vessel is under maintenance for this date
        const maintenances = await db.getActiveMaintenancesByVesselAndDate(input.vesselId, input.bookingDate);
        if (maintenances.length > 0) {
          const maintenance = maintenances[0];
          throw new TRPCError({ 
            code: 'CONFLICT', 
            message: `Esta embarcação está em manutenção de ${new Date(maintenance.startDate).toLocaleDateString('pt-BR')} até ${new Date(maintenance.endDate).toLocaleDateString('pt-BR')}` 
          });
        }

        // Check if vessel is already booked for this date
        const existingBookings = await db.getBookingsByVesselAndDate(input.vesselId, input.bookingDate);
        if (existingBookings.length > 0) {
          throw new TRPCError({ 
            code: 'CONFLICT', 
            message: 'Esta embarcação já está reservada para esta data' 
          });
        }

        // Admin can create booking without quota limits
        await db.createBooking({
          clientEmail: input.clientEmail,
          clientName: client.name,
          vesselId: input.vesselId,
          vesselName: vessel.name,
          bookingDate: input.bookingDate,
          status: 'confirmed',
          notes: input.notes,
        });

        return { success: true };
      }),

    // Cancel booking
    cancel: allowedClientProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.email) {
          throw new TRPCError({ code: 'UNAUTHORIZED' });
        }

        const bookings = await db.getBookingsByEmail(ctx.user.email);
        const booking = bookings.find(b => b.id === input.id);

        if (!booking) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Reserva não encontrada' });
        }

        if (booking.status !== 'confirmed') {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Esta reserva não pode ser cancelada' 
          });
        }

        await db.updateBooking(input.id, { status: 'cancelled' });
        
        // Send notification to admin
        await notifyBookingCancellation({
          clientName: booking.clientName,
          clientEmail: booking.clientEmail,
          vesselName: booking.vesselName,
          bookingDate: new Date(booking.bookingDate),
        });
        
        // Send cancellation email to client
        await notifyClientBookingCancellation({
          clientName: booking.clientName,
          clientEmail: booking.clientEmail,
          vesselName: booking.vesselName,
          bookingDate: new Date(booking.bookingDate),
        });
        
        return { success: true };
      }),

    // Mark as used (admin only)
    markAsUsed: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        // Get booking details before updating
        const allBookings = await db.getBookings();
        const booking = allBookings.find(b => b.id === input.id);
        
        await db.updateBooking(input.id, { status: 'used' });
        
        // Send notification to admin if booking found
        if (booking) {
          await notifyBookingUsed({
            clientName: booking.clientName,
            vesselName: booking.vesselName,
            bookingDate: new Date(booking.bookingDate),
          });
        }
        
        return { success: true };
      }),

    // Update booking (admin only)
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'confirmed', 'used', 'cancelled']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateBooking(id, data);
        return { success: true };
      }),

    // Delete booking (admin only)
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteBooking(input.id);
        return { success: true };
      }),
  }),

  // Maintenances (Admin only)
  maintenances: router({
    // Endpoint público para buscar manutenções ativas (para calendário)
    getActive: publicProcedure
      .input(z.object({
        startDate: z.number(),
        endDate: z.number(),
      }))
      .query(async ({ input }) => {
        const allMaintenances = await db.getMaintenances();
        
        // Filtrar apenas manutenções ativas no período
        return allMaintenances.filter((m: any) => {
          if (m.status === 'cancelled' || m.status === 'completed') return false;
          
          // Verificar se há sobreposição de datas (usar camelCase do Drizzle)
          return m.startDate <= input.endDate && m.endDate >= input.startDate;
        });
      }),

    list: publicProcedure.query(async ({ ctx }) => {
      // Allow admin and employee to access
      if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
      }
      return await db.getMaintenances();
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        return await db.getMaintenanceById(input.id);
      }),

    getByVessel: publicProcedure
      .input(z.object({ vesselId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        return await db.getMaintenancesByVesselId(input.vesselId);
      }),

    checkConflicts: adminProcedure
      .input(z.object({
        vesselId: z.number(),
        startDate: z.number(),
        endDate: z.number(),
      }))
      .query(async ({ input }) => {
        // Buscar reservas ativas no período
        const allBookings = await db.getAllBookings();
        
        // Normalizar datas para meia-noite
        const startNormalized = new Date(input.startDate);
        startNormalized.setHours(0, 0, 0, 0);
        const endNormalized = new Date(input.endDate);
        endNormalized.setHours(23, 59, 59, 999);
        
        const conflictingBookings = allBookings.filter((booking: any) => {
          // Apenas reservas confirmadas da embarcação selecionada
          if (booking.vesselId !== input.vesselId) return false;
          if (booking.status === 'cancelled' || booking.status === 'used') return false;
          
          // Verificar se a data da reserva está no período de manutenção
          const bookingDate = new Date(booking.bookingDate);
          bookingDate.setHours(0, 0, 0, 0);
          
          return bookingDate >= startNormalized && bookingDate <= endNormalized;
        });
        
        return {
          hasConflicts: conflictingBookings.length > 0,
          conflictingBookings: conflictingBookings.map((b: any) => ({
            id: b.id,
            clientName: b.clientName,
            clientEmail: b.clientEmail,
            vesselName: b.vesselName,
            bookingDate: b.bookingDate,
          })),
        };
      }),

    create: publicProcedure
      .input(z.object({
        vesselId: z.number(),
        startDate: z.number(),
        endDate: z.number(),
        description: z.string().optional(),
        status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        // Get vessel info
        const vessel = await db.getVesselById(input.vesselId);
        if (!vessel) {
          throw new TRPCError({ 
            code: 'NOT_FOUND', 
            message: 'Embarcação não encontrada' 
          });
        }

        // Validate dates
        if (input.startDate >= input.endDate) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Data de início deve ser anterior à data de término' 
          });
        }

        // Buscar reservas conflitantes
        const allBookings = await db.getAllBookings();
        const startNormalized = new Date(input.startDate);
        startNormalized.setHours(0, 0, 0, 0);
        const endNormalized = new Date(input.endDate);
        endNormalized.setHours(23, 59, 59, 999);
        
        const conflictingBookings = allBookings.filter((booking: any) => {
          if (booking.vesselId !== input.vesselId) return false;
          if (booking.status === 'cancelled' || booking.status === 'used') return false;
          
          const bookingDate = new Date(booking.bookingDate);
          bookingDate.setHours(0, 0, 0, 0);
          
          return bookingDate >= startNormalized && bookingDate <= endNormalized;
        });

        // Criar manutenção
        const maintenanceData: any = {
          vesselId: input.vesselId,
          vesselName: vessel.name,
          startDate: new Date(input.startDate).getTime(),
          endDate: new Date(input.endDate).getTime(),
          description: input.description || '',
          status: input.status || 'scheduled',
          createdBy: ctx.user.id, // Salvar ID do usuário logado (admin ou funcionário)
        };
        
        const created = await db.createMaintenance(maintenanceData);

        // Cancelar reservas conflitantes
        const cancelledBookings = [];
        for (const booking of conflictingBookings) {
          await db.updateBooking(booking.id, { status: 'cancelled' });
          cancelledBookings.push({
            id: booking.id,
            clientName: booking.clientName,
            clientEmail: booking.clientEmail,
            vesselName: booking.vesselName,
            bookingDate: booking.bookingDate,
          });
        }

        // Enviar notificações para clientes afetados
        for (const booking of cancelledBookings) {
          await notifyClientMaintenanceCancellation({
            clientName: booking.clientName,
            clientEmail: booking.clientEmail,
            vesselName: booking.vesselName,
            bookingDate: new Date(booking.bookingDate),
            maintenanceStartDate: new Date(input.startDate),
            maintenanceEndDate: new Date(input.endDate),
            maintenanceDescription: input.description,
          });
        }

        // Enviar notificação para admin (sempre, independente de cancelamentos)
        if (cancelledBookings.length > 0) {
          // Notificar sobre reservas canceladas
          await notifyAdminMaintenanceCancellations({
            vesselName: vessel.name,
            maintenanceStartDate: new Date(input.startDate),
            maintenanceEndDate: new Date(input.endDate),
            cancelledBookings: cancelledBookings.map(b => ({
              clientName: b.clientName,
              clientEmail: b.clientEmail,
              bookingDate: new Date(b.bookingDate),
            })),
          });
        } else {
          // Notificar sobre criação de manutenção sem conflitos
          const startStr = new Date(input.startDate).toLocaleDateString('pt-BR');
          const endStr = new Date(input.endDate).toLocaleDateString('pt-BR');
          await notifyOwner({
            title: "🔧 Nova Manutenção Agendada",
            content: `
**Embarcação:** ${vessel.name}
**Período:** ${startStr} a ${endStr}
**Descrição:** ${input.description || 'Sem descrição'}
**Status:** ${input.status || 'scheduled'}

Nenhuma reserva foi afetada.
            `.trim()
          });
        }

        return { 
          success: true,
          id: created.id,
          cancelledCount: cancelledBookings.length,
          cancelledBookings 
        };
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        vesselId: z.number().optional(),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
        description: z.string().optional(),
        status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const { id, ...data } = input;
        
        // Get current maintenance to check if status changed
        const currentMaintenance = await db.getMaintenanceById(id);
        if (!currentMaintenance) {
          throw new TRPCError({ 
            code: 'NOT_FOUND', 
            message: 'Manutenção não encontrada' 
          });
        }
        
        // If vessel changed, update vessel name
        if (data.vesselId) {
          const vessel = await db.getVesselById(data.vesselId);
          if (!vessel) {
            throw new TRPCError({ 
              code: 'NOT_FOUND', 
              message: 'Embarcação não encontrada' 
            });
          }
          (data as any).vesselName = vessel.name;
        }

        await db.updateMaintenance(id, data);
        
        // If status changed, send notifications
        if (data.status && data.status !== currentMaintenance.status) {
          // Notify admin
          await notifyAdminMaintenanceStatusChange({
            vesselName: currentMaintenance.vesselName,
            oldStatus: currentMaintenance.status,
            newStatus: data.status,
            startDate: new Date(currentMaintenance.startDate),
            endDate: new Date(currentMaintenance.endDate),
            description: currentMaintenance.description || undefined,
          });
          
          // Get affected bookings (during maintenance period)
          const allBookings = await db.getAllBookings();
          const affectedBookings = allBookings.filter(b => 
            b.vesselId === currentMaintenance.vesselId &&
            b.status === 'confirmed' &&
            new Date(b.bookingDate) >= new Date(currentMaintenance.startDate) &&
            new Date(b.bookingDate) <= new Date(currentMaintenance.endDate)
          );
          
          // Notify affected clients
          if (affectedBookings.length > 0) {
            await notifyClientsMaintenanceStatusChange({
              vesselName: currentMaintenance.vesselName,
              newStatus: data.status,
              startDate: new Date(currentMaintenance.startDate),
              endDate: new Date(currentMaintenance.endDate),
              affectedClients: affectedBookings.map(b => ({
                clientName: b.clientName,
                clientEmail: b.clientEmail,
                bookingDate: new Date(b.bookingDate),
              })),
            });
          }
        }
        
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        await db.deleteMaintenance(input.id);
        return { success: true };
      }),
  }),

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
    upcomingReservations: employeeProcedure.query(async () => {
      const dbInstance = await import('./db').then(m => m.getDb());
      if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const { sql: sqlTag } = await import('drizzle-orm');
      
      // Normalizar para meia-noite para comparar apenas datas (sem horas)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const now = today.getTime();
      const query = `
        SELECT 
          id,
          client_email as clientEmail,
          client_name as clientName,
          vessel_id as vesselId,
          vessel_name as vesselName,
          booking_date as bookingDate,
          status,
          notes,
          created_at as createdAt,
          updated_at as updatedAt
        FROM bookings
        WHERE booking_date >= ${now}
          AND status = 'confirmed'
        ORDER BY booking_date ASC
        LIMIT 21
      `;
      const result = await dbInstance.execute(sqlTag.raw(query)) as any;
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
            isActive: true,
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

        const { sql } = await import('drizzle-orm');

        // Construir SET clause dinamicamente
        const updates: string[] = [];

        if (input.name !== undefined) {
          const name = input.name.replace(/'/g, "''");
          updates.push(`name = '${name}'`);
        }

        if (input.email !== undefined) {
          const email = input.email.replace(/'/g, "''");
          updates.push(`email = '${email}'`);
        }

        if (input.phone !== undefined) {
          const phone = input.phone ? `'${input.phone.replace(/'/g, "''")}' ` : 'null';
          updates.push(`phone = ${phone}`);
        }

        if (input.vesselIds !== undefined) {
          const vesselIdsJson = JSON.stringify(input.vesselIds).replace(/'/g, "''");
          updates.push(`vessel_ids = '${vesselIdsJson}'`);
        }

        if (input.isActive !== undefined) {
          updates.push(`is_active = ${input.isActive ? 1 : 0}`);
        }

        if (updates.length === 0) {
          return { success: true };
        }

        try {
          await db.execute(sql.raw(`
            UPDATE employees
            SET ${updates.join(', ')}
            WHERE id = ${input.id}
          `));
          
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

  // Fuel Records router - Admin and Employee
  fuelRecords: router({  
    create: publicProcedure
      .input(z.object({
        bookingId: z.number(),
        vesselId: z.number(),
        liters: z.number().positive().optional(), // Opcional quando usa método por peso
        pricePerLiter: z.number().positive().optional(), // Opcional - busca do estoque se não informado
        notes: z.string().optional(),
        // Campos opcionais do método de abastecimento por pesagem
        litersInitial: z.number().positive().optional(), // Litros iniciais no galão (ex: 50.05)
        weightFull: z.number().positive().optional(), // Peso do galão cheio em kg (ex: 37.80)
        weightAfter: z.number().positive().optional(), // Peso do galão após em kg (ex: 23.40)
        photoBeforeUrl: z.string().url().optional(), // URL da foto ANTES
        photoAfterUrl: z.string().url().optional(), // URL da foto DEPOIS
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const database = await import('./db').then(m => m.getDb());
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        // Buscar dados da reserva e embarcação
        const { sql } = await import('drizzle-orm');
        const bookingResult = await database.execute(sql`
          SELECT b.client_name, b.client_email, b.vessel_name, v.name as vessel_name_actual
          FROM bookings b
          JOIN vessels v ON b.vessel_id = v.id
          WHERE b.id = ${input.bookingId}
        `) as any;
        const booking = (Array.isArray(bookingResult[0]) ? bookingResult[0][0] : bookingResult[0]);
        if (!booking) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Reserva não encontrada' });
        }

        // Validar campos de peso (se um for informado, todos devem ser)
        const hasWeightData = input.litersInitial || input.weightFull || input.weightAfter;
        if (hasWeightData) {
          if (!input.litersInitial || !input.weightFull || !input.weightAfter) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'Se usar o método de pesagem, todos os campos (litros iniciais, peso cheio e peso após) são obrigatórios' 
            });
          }
          if (!input.photoBeforeUrl || !input.photoAfterUrl) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'As fotos da balança (antes e depois) são obrigatórias ao usar o método de pesagem' 
            });
          }
          if (input.weightAfter >= input.weightFull) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'O peso após deve ser menor que o peso cheio' 
            });
          }
        }

        // Buscar preço/L do estoque (se não foi informado)
        const currentDate = new Date();
        const currentMonthYear = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        
        const budgetResult = await database.execute(sql`
          SELECT last_price_per_liter, stock_liters FROM fuel_budget WHERE month_year = ${currentMonthYear}
        `) as any;
        const budget = (Array.isArray(budgetResult[0]) ? budgetResult[0][0] : budgetResult[0]);
        
        const defaultPricePerLiter = budget?.last_price_per_liter ? budget.last_price_per_liter / 100 : null;
        const currentStockLiters = budget?.stock_liters ? budget.stock_liters / 100 : 0;
        
        // Usar preço do estoque se não foi informado
        let finalPricePerLiter = input.pricePerLiter;
        if (!finalPricePerLiter && defaultPricePerLiter) {
          finalPricePerLiter = defaultPricePerLiter;
          console.log('[fuelRecords.create] Preço/L aplicado do estoque:', finalPricePerLiter);
        } else if (!finalPricePerLiter) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Preço por litro não informado e não há preço no estoque. Configure o orçamento primeiro.' 
          });
        }

        // Calcular valores de peso e litros (se método de pesagem for usado)
        let litersInitialInCents = null;
        let weightFullInGrams = null;
        let weightAfterInGrams = null;
        let weightConsumedInGrams = null;
        let litersCalculatedInCents = null;
        let finalLitersInCents = input.liters ? Math.round(input.liters * 100) : 0; // Padrão: usar litros informados manualmente

        if (hasWeightData && input.litersInitial && input.weightFull && input.weightAfter) {
          // Converter para unidades inteiras (centavos/gramas)
          litersInitialInCents = Math.round(input.litersInitial * 100); // 50.05L -> 5005
          weightFullInGrams = Math.round(input.weightFull * 100); // 37.80kg -> 3780 (gramas em centavos)
          weightAfterInGrams = Math.round(input.weightAfter * 100); // 23.40kg -> 2340
          weightConsumedInGrams = weightFullInGrams - weightAfterInGrams; // 3780 - 2340 = 1440

          // Regra de 3: litros_consumidos = (peso_consumido * litros_iniciais) / peso_cheio
          litersCalculatedInCents = Math.round((weightConsumedInGrams * litersInitialInCents) / weightFullInGrams);
          
          // Usar litros calculados ao invés de litros manuais
          finalLitersInCents = litersCalculatedInCents;
        }

        const SERVICE_FEE = 1000; // Taxa de abastecimento e aplicativo em centavos (R$ 10,00)
        const pricePerLiterInCents = Math.round(finalPricePerLiter * 100); // Converter para centavos
        const fuelCost = Math.round((finalLitersInCents / 100) * finalPricePerLiter * 100); // em centavos
        const totalAmount = fuelCost + SERVICE_FEE;
        
        // Descontar litros do estoque
        const finalLiters = finalLitersInCents / 100;
        console.log('[fuelRecords.create] Descontando do estoque:', finalLiters, 'L');
        console.log('[fuelRecords.create] Estoque antes:', currentStockLiters, 'L');
        
        await database.execute(sql`
          UPDATE fuel_budget 
          SET stock_liters = stock_liters - ${finalLitersInCents}
          WHERE month_year = ${currentMonthYear}
        `);
        
        console.log('[fuelRecords.create] Estoque após:', (currentStockLiters - finalLiters), 'L');

        // Criar ou buscar cliente no Asaas
        const asaas = await import('./_core/asaas');
        let asaasCustomerId = '';
        let asaasChargeId = '';
        let paymentUrl = '';
        let syncStatus = 'pending';
        let syncError = null;
        
        try {
          console.log('[fuelRecords.create] Iniciando criação de cobrança Asaas...');
          console.log('[fuelRecords.create] Cliente:', booking.client_name, booking.client_email);
          
          const customer = await asaas.getOrCreateCustomer({
            name: booking.client_name,
            email: booking.client_email,
          });
          asaasCustomerId = customer.id;
          console.log('[fuelRecords.create] Cliente Asaas ID:', asaasCustomerId);

          // Criar cobrança no Asaas
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 7); // Vencimento em 7 dias
          
          console.log('[fuelRecords.create] Criando cobrança...');
          const charge = await asaas.createCharge({
            customer: asaasCustomerId,
            billingType: 'UNDEFINED', // Cliente escolhe forma de pagamento
            value: totalAmount / 100, // Converter centavos para reais
            dueDate: asaas.formatDateForAsaas(dueDate),
            description: `Abastecimento - ${booking.vessel_name_actual} - ${input.liters}L`,
            externalReference: `booking_${input.bookingId}`,
          });
          
          asaasChargeId = charge.id;
          paymentUrl = charge.invoiceUrl || charge.bankSlipUrl || '';
          syncStatus = 'synced';
          
          console.log('[fuelRecords.create] ✅ Cobrança criada com sucesso!');
          console.log('[fuelRecords.create] Charge ID:', asaasChargeId);
          console.log('[fuelRecords.create] Payment URL:', paymentUrl);
        } catch (error: any) {
          syncStatus = 'failed';
          syncError = error.message;
          console.error('[fuelRecords.create] ❌ ERRO ao criar cobrança Asaas:');
          console.error('[fuelRecords.create] Mensagem:', error.message);
          console.error('[fuelRecords.create] Stack:', error.stack);
          console.error('[fuelRecords.create] Abastecimento será salvo, mas cobrança pode ser criada manualmente depois');
        }

        const notesValue = input.notes ? `'${input.notes.replace(/'/g, "''")}'` : 'NULL';
        const photoBeforeUrlValue = input.photoBeforeUrl ? `'${input.photoBeforeUrl}'` : 'NULL';
        const photoAfterUrlValue = input.photoAfterUrl ? `'${input.photoAfterUrl}'` : 'NULL';
        const asaasChargeIdValue = asaasChargeId ? `'${asaasChargeId}'` : 'NULL';
        const asaasCustomerIdValue = asaasCustomerId ? `'${asaasCustomerId}'` : 'NULL';
        const paymentUrlValue = paymentUrl ? `'${paymentUrl}'` : 'NULL';
        const syncErrorValue = syncError ? `'${syncError.replace(/'/g, "''")}'` : 'NULL';
        
        await database.execute(`
          INSERT INTO fuel_records (
            booking_id, vessel_id, vessel_name, client_email, client_name, 
            liters, price_per_liter, total_amount, notes, 
            liters_initial, weight_full, weight_after, weight_consumed, liters_calculated,
            photo_before_url, photo_after_url,
            asaas_charge_id, asaas_customer_id, payment_url, payment_status,
            sync_status, sync_error, last_sync_attempt,
            recorded_by, recorded_at
          )
          VALUES (
            ${input.bookingId}, ${input.vesselId}, '${booking.vessel_name_actual}', 
            '${booking.client_email}', '${booking.client_name}', 
            ${finalLitersInCents}, ${pricePerLiterInCents}, ${totalAmount}, ${notesValue}, 
            ${litersInitialInCents}, ${weightFullInGrams}, ${weightAfterInGrams}, ${weightConsumedInGrams}, ${litersCalculatedInCents},
            ${photoBeforeUrlValue}, ${photoAfterUrlValue},
            ${asaasChargeIdValue}, ${asaasCustomerIdValue}, ${paymentUrlValue}, 'pending',
            '${syncStatus}', ${syncErrorValue}, NOW(),
            ${ctx.user?.id || 'NULL'}, NOW()
          )
        `);
        
        console.log('[fuelRecords.create] Abastecimento salvo no banco com sync_status:', syncStatus); 

        return { 
          success: true, 
          totalCost: totalAmount / 100,
          paymentUrl: paymentUrl || undefined,
          asaasChargeId: asaasChargeId || undefined,
        };
      }),

    list: publicProcedure
      .input(z.object({
        vesselId: z.number().optional(),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
        month: z.number().min(1).max(12).optional(), // Mês (1-12)
        year: z.number().min(2020).max(2030).optional(), // Ano
      }))
      .query(async ({ input, ctx }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        
        // Construir query base
        let queryStr = `
          SELECT 
            fr.*,
            b.booking_date,
            fr.sync_status,
            fr.sync_error,
            fr.last_sync_attempt,
            fr.manual_payment_note,
            u.name as recorded_by_name,
            fr.recorded_at
          FROM fuel_records fr
          JOIN bookings b ON fr.booking_id = b.id
          LEFT JOIN users u ON fr.recorded_by = u.id
          WHERE 1=1
        `;

        if (input.vesselId) {
          queryStr += ` AND fr.vessel_id = ${input.vesselId}`;
        }

        // Se month e year forem fornecidos, filtrar por mês/ano
        if (input.month && input.year) {
          queryStr += ` AND MONTH(fr.created_at) = ${input.month}`;
          queryStr += ` AND YEAR(fr.created_at) = ${input.year}`;
        } else {
          // Caso contrário, usar startDate/endDate se fornecidos
          if (input.startDate) {
            queryStr += ` AND fr.created_at >= FROM_UNIXTIME(${input.startDate / 1000})`;
          }

          if (input.endDate) {
            queryStr += ` AND fr.created_at <= FROM_UNIXTIME(${input.endDate / 1000})`;
          }
        }

        queryStr += ' ORDER BY fr.created_at DESC';

        const result = await db.execute(sql.raw(queryStr)) as any;
        const records = (Array.isArray(result[0]) ? result[0] : result) as any[];
        
        // Converter valores de centavos para reais
        return records.map((record: any) => ({
          ...record,
          date: record.booking_date, // Mapear booking_date para date
          liters: record.liters / 100,
          price_per_liter: record.price_per_liter / 100,
          total_cost: record.total_amount / 100,
          recorded_by_name: record.recorded_by_name || 'Sistema', // Nome do usuário que registrou
          recorded_at: record.recorded_at, // Data/hora de registro
        }));
      }),

    getByBooking: publicProcedure
      .input(z.object({ bookingId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT fr.*
          FROM fuel_records fr
          WHERE fr.booking_id = ${input.bookingId}
          ORDER BY fr.created_at DESC
        `) as any;

        return (Array.isArray(result[0]) ? result[0] : result) as any[];
      }),

    stats: publicProcedure
      .input(z.object({
        vesselId: z.number().optional(),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
        month: z.number().min(1).max(12).optional(), // Mês (1-12)
        year: z.number().min(2020).max(2030).optional(), // Ano
      }))
      .query(async ({ input, ctx }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        let query = `
          SELECT 
            COUNT(*) as total_records,
            SUM(liters) as total_liters,
            SUM(total_amount) as total_cost,
            AVG(liters) as avg_liters_per_refuel,
            AVG(price_per_liter) as avg_price_per_liter,
            SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_received,
            SUM(CASE WHEN payment_status = 'pending' THEN total_amount ELSE 0 END) as total_pending
          FROM fuel_records
          WHERE 1=1
        `;
        const params: any[] = [];

        if (input.vesselId) {
          query += ' AND vessel_id = ?';
          params.push(input.vesselId);
        }

        // Se month e year forem fornecidos, filtrar por mês/ano
        if (input.month && input.year) {
          query += ` AND MONTH(created_at) = ${input.month}`;
          query += ` AND YEAR(created_at) = ${input.year}`;
        } else {
          // Caso contrário, usar startDate/endDate se fornecidos
          if (input.startDate) {
            query += ' AND created_at >= FROM_UNIXTIME(?)';
            params.push(input.startDate / 1000);
          }

          if (input.endDate) {
            query += ' AND created_at <= FROM_UNIXTIME(?)';
            params.push(input.endDate / 1000);
          }
        }

        const { sql: sqlTag } = await import('drizzle-orm');
        const result = await db.execute(sqlTag.raw(query)) as any;
        const stats = (Array.isArray(result[0]) ? result[0][0] : result[0]);

        return {
          totalRecords: Number(stats.total_records) || 0,
          totalLiters: Number(stats.total_liters) || 0,
          totalCost: Number(stats.total_cost) / 100 || 0, // Converter centavos para reais
          totalReceived: Number(stats.total_received) / 100 || 0, // Converter centavos para reais
          totalPending: Number(stats.total_pending) / 100 || 0, // Converter centavos para reais
          avgLitersPerRefuel: Number(stats.avg_liters_per_refuel) / 100 || 0,
          avgPricePerLiter: Number(stats.avg_price_per_liter) / 100 || 0,
        };
      }),

    delete: publicProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          
          // 1. Buscar informações do abastecimento e da reserva associada
          const recordResult = await db.execute(sql`
            SELECT 
              fr.liters,
              fr.booking_id,
              b.booking_date
            FROM fuel_records fr
            INNER JOIN bookings b ON fr.booking_id = b.id
            WHERE fr.id = ${input.id}
          `) as any;
          const record = (Array.isArray(recordResult[0]) ? recordResult[0][0] : recordResult[0]);
          
          if (!record) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Abastecimento não encontrado' });
          }
          
          // 2. Calcular monthYear a partir da data da reserva (timestamp em milissegundos)
          const bookingDate = new Date(Number(record.booking_date));
          const monthYear = `${bookingDate.getFullYear()}-${String(bookingDate.getMonth() + 1).padStart(2, '0')}`;
          
          // 3. Devolver litros ao estoque (adicionar de volta)
          const litersToReturn = record.liters; // Já está em centésimos
          
          await db.execute(sql`
            UPDATE fuel_budget 
            SET stock_liters = stock_liters + ${litersToReturn}
            WHERE month_year = ${monthYear}
          `);
          
          console.log(`[fuelRecords.delete] Devolvendo ${litersToReturn / 100}L ao estoque do mês ${monthYear}`);
          
          // 3. Excluir o registro
          await db.execute(sql`DELETE FROM fuel_records WHERE id = ${input.id}`);
          
          return { success: true };
        } catch (error: any) {
          console.error('[fuelRecords.delete] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao excluir abastecimento: ${error.message}` 
          });
        }
      }),

    // Sincronizar abastecimento individual com Asaas
    syncWithAsaas: publicProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user || ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Apenas administradores podem sincronizar' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          // Buscar registro de abastecimento
          const { sql } = await import('drizzle-orm');
          const result = await db.execute(sql`
            SELECT * FROM fuel_records WHERE id = ${input.id}
          `) as any;
          const record = (Array.isArray(result[0]) ? result[0][0] : result[0]);

          if (!record) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Abastecimento não encontrado' });
          }

          // Se já está sincronizado, retornar sucesso
          if (record.sync_status === 'synced' && record.asaas_charge_id) {
            return { 
              success: true, 
              message: 'Abastecimento já sincronizado',
              chargeId: record.asaas_charge_id,
              paymentUrl: record.payment_url
            };
          }

          // Tentar criar cobrança no Asaas
          const asaas = await import('./_core/asaas');
          
          console.log('[syncWithAsaas] Buscando/criando cliente:', record.client_email);
          const customer = await asaas.getOrCreateCustomer({
            name: record.client_name,
            email: record.client_email,
          });
          console.log('[syncWithAsaas] Cliente obtido:', customer.id);

          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 7); // Vencimento em 7 dias
          
          console.log('[syncWithAsaas] Criando cobrança...');
          const charge = await asaas.createCharge({
            customer: customer.id,
            billingType: 'UNDEFINED',
            value: record.total_amount / 100, // Converter centavos para reais
            dueDate: asaas.formatDateForAsaas(dueDate),
            description: `Abastecimento - ${record.vessel_name} - ${record.liters / 100}L`,
            externalReference: `fuel_record_${record.id}`,
          });
          console.log('[syncWithAsaas] Cobrança criada:', charge.id);

          // Atualizar registro com dados da cobrança
          await db.execute(sql`
            UPDATE fuel_records 
            SET 
              asaas_charge_id = ${charge.id},
              asaas_customer_id = ${customer.id},
              payment_url = ${charge.invoiceUrl || charge.bankSlipUrl || ''},
              sync_status = 'synced',
              sync_error = NULL,
              last_sync_attempt = NOW()
            WHERE id = ${input.id}
          `);

          return { 
            success: true, 
            message: 'Cobrança criada com sucesso no Asaas',
            chargeId: charge.id,
            paymentUrl: charge.invoiceUrl || charge.bankSlipUrl || ''
          };
        } catch (error: any) {
          console.error('[syncWithAsaas] Erro:', error);
          
          // Salvar erro no banco
          const { sql } = await import('drizzle-orm');
          await db.execute(sql`
            UPDATE fuel_records 
            SET 
              sync_status = 'failed',
              sync_error = ${error.message},
              last_sync_attempt = NOW()
            WHERE id = ${input.id}
          `);

          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao sincronizar com Asaas: ${error.message}` 
          });
        }
      }),

    // Sincronizar todos os abastecimentos pendentes
    syncAllPending: publicProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.user || ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Apenas administradores podem sincronizar' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          // Buscar todos os registros pendentes
          const { sql } = await import('drizzle-orm');
          const result = await db.execute(sql`
            SELECT id FROM fuel_records 
            WHERE sync_status = 'pending' OR sync_status = 'failed'
            ORDER BY created_at ASC
          `) as any;
          const records = (Array.isArray(result[0]) ? result[0] : result) as any[];

          let successCount = 0;
          let failCount = 0;
          const errors: string[] = [];

          // Sincronizar cada registro
          for (const record of records) {
            try {
              // Reutilizar lógica do endpoint syncWithAsaas
              const recordResult = await db.execute(sql`
                SELECT * FROM fuel_records WHERE id = ${record.id}
              `) as any;
              const fullRecord = (Array.isArray(recordResult[0]) ? recordResult[0][0] : recordResult[0]);

              if (!fullRecord) continue;

              const asaas = await import('./_core/asaas');
              const customer = await asaas.getOrCreateCustomer({
                name: fullRecord.client_name,
                email: fullRecord.client_email,
              });

              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + 7);
              
              const charge = await asaas.createCharge({
                customer: customer.id,
                billingType: 'UNDEFINED',
                value: fullRecord.total_amount / 100,
                dueDate: asaas.formatDateForAsaas(dueDate),
                description: `Abastecimento - ${fullRecord.vessel_name} - ${fullRecord.liters / 100}L`,
                externalReference: `fuel_record_${fullRecord.id}`,
              });

              await db.execute(sql`
                UPDATE fuel_records 
                SET 
                  asaas_charge_id = ${charge.id},
                  asaas_customer_id = ${customer.id},
                  payment_url = ${charge.invoiceUrl || charge.bankSlipUrl || ''},
                  sync_status = 'synced',
                  sync_error = NULL,
                  last_sync_attempt = NOW()
                WHERE id = ${record.id}
              `);

              successCount++;
            } catch (error: any) {
              console.error(`[syncAllPending] Erro no registro ${record.id}:`, error);
              failCount++;
              errors.push(`Registro ${record.id}: ${error.message}`);
              
              await db.execute(sql`
                UPDATE fuel_records 
                SET 
                  sync_status = 'failed',
                  sync_error = ${error.message},
                  last_sync_attempt = NOW()
                WHERE id = ${record.id}
              `);
            }
          }

          return {
            success: true,
            total: records.length,
            successCount,
            failCount,
            errors: errors.length > 0 ? errors : undefined
          };
        } catch (error: any) {
          console.error('[syncAllPending] Erro:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao sincronizar abastecimentos: ${error.message}` 
          });
        }
      }),

    // Marcar pagamento como recebido manualmente
    markAsPaid: publicProcedure
      .input(z.object({
        id: z.number(),
        note: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user || ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Apenas administradores podem marcar pagamentos' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          await db.execute(sql`
            UPDATE fuel_records 
            SET 
              payment_status = 'paid',
              sync_status = 'manual',
              paid_at = NOW(),
              manual_payment_note = ${input.note || 'Pagamento recebido manualmente'}
            WHERE id = ${input.id}
          `);

          return { success: true, message: 'Pagamento marcado como recebido' };
        } catch (error: any) {
          console.error('[markAsPaid] Erro:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao marcar pagamento: ${error.message}` 
          });
        }
      }),

    // Generate PDF report for selected fuel records
    generateReport: publicProcedure
      .input(z.object({
        recordIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        if (input.recordIds.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum registro selecionado' });
        }

        // Buscar registros selecionados via raw SQL
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        const ids = input.recordIds.join(',');
        const result = await db.execute(sql.raw(`
          SELECT 
            fr.*,
            b.booking_date
          FROM fuel_records fr
          LEFT JOIN bookings b ON fr.booking_id = b.id
          WHERE fr.id IN (${ids})
          ORDER BY fr.created_at DESC
        `)) as any;
        
        const records = (Array.isArray(result[0]) ? result[0] : result) as any[];

        if (!records || records.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhum registro encontrado' });
        }

        // Mapear snake_case para camelCase e calcular campos faltantes
        const mappedRecords = records.map(r => ({
          id: r.id,
          vesselName: r.vessel_name || 'N/A',
          employeeName: ctx.user?.name || 'N/A', // Nome do usuário logado
          date: r.booking_date || r.created_at,
          liters: r.liters || 0,
          pricePerLiter: r.price_per_liter || 0,
          subtotal: (r.liters || 0) * (r.price_per_liter || 0) / 100, // Calculado: litros × preço/L (em centavos)
          serviceFee: 1000, // Taxa fixa: R$ 10.00 em centavos
          totalAmount: r.total_amount || 0,
          notes: r.notes,
          // Campos de pesagem (opcionais)
          litersInitial: r.liters_initial || null,
          weightFull: r.weight_full || null,
          weightAfter: r.weight_after || null,
          weightConsumed: r.weight_consumed || null,
          litersCalculated: r.liters_calculated || null,
          photoBeforeUrl: r.photo_before_url || null,
          photoAfterUrl: r.photo_after_url || null,
        }));

        // Gerar PDF
        const { generateFuelRecordsPDF } = await import('./_core/fuelRecordPDF');
        const pdfBuffer = await generateFuelRecordsPDF(mappedRecords);

        // Retornar PDF como base64
        return {
          pdf: pdfBuffer.toString('base64'),
          filename: `abastecimentos-${new Date().toISOString().split('T')[0]}.pdf`,
        };
      }),

    sendReportByEmail: publicProcedure
      .input(z.object({
        recordIds: z.array(z.number()),
        email: z.string().email(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        if (input.recordIds.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum registro selecionado' });
        }

        // Buscar registros selecionados via raw SQL
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        const ids = input.recordIds.join(',');
        const result = await db.execute(sql.raw(`
          SELECT 
            fr.*,
            b.booking_date
          FROM fuel_records fr
          LEFT JOIN bookings b ON fr.booking_id = b.id
          WHERE fr.id IN (${ids})
          ORDER BY fr.created_at DESC
        `)) as any;
        
        const records = (Array.isArray(result[0]) ? result[0] : result) as any[];

        if (!records || records.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhum registro encontrado' });
        }

        // Mapear snake_case para camelCase e calcular campos faltantes
        const mappedRecords = records.map(r => ({
          id: r.id,
          vesselName: r.vessel_name || 'N/A',
          employeeName: ctx.user?.name || 'N/A', // Nome do usuário logado
          date: r.booking_date || r.created_at,
          liters: r.liters || 0,
          pricePerLiter: r.price_per_liter || 0,
          subtotal: (r.liters || 0) * (r.price_per_liter || 0) / 100, // Calculado: litros × preço/L (em centavos)
          serviceFee: 1000, // Taxa fixa: R$ 10.00 em centavos
          totalAmount: r.total_amount || 0,
          notes: r.notes,
          // Campos de pesagem (opcionais)
          litersInitial: r.liters_initial || null,
          weightFull: r.weight_full || null,
          weightAfter: r.weight_after || null,
          weightConsumed: r.weight_consumed || null,
          litersCalculated: r.liters_calculated || null,
          photoBeforeUrl: r.photo_before_url || null,
          photoAfterUrl: r.photo_after_url || null,
        }));

        // Gerar PDF
        const { generateFuelRecordsPDF } = await import('./_core/fuelRecordPDF');
        const pdfBuffer = await generateFuelRecordsPDF(mappedRecords);
        const filename = `abastecimentos-${new Date().toISOString().split('T')[0]}.pdf`;

        // Enviar email com PDF anexado
        const { sendEmail } = await import('./_core/emailService');
        
        const totalLiters = mappedRecords.reduce((sum, r) => sum + r.liters, 0) / 100;
        const totalAmount = mappedRecords.reduce((sum, r) => sum + r.totalAmount, 0) / 100;

        await sendEmail({
          to: input.email,
          subject: `Relatório de Abastecimentos - ${new Date().toLocaleDateString('pt-BR')}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); color: white; padding: 30px; text-align: center;">
                <h1 style="margin: 0; font-size: 28px;">⚓ EXCLUSIVE CLUB</h1>
                <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Sistema de Compartilhamento de Embarcações</p>
              </div>
              
              <div style="padding: 30px; background: #f9fafb;">
                <h2 style="color: #1f2937; margin-top: 0;">Relatório de Abastecimentos</h2>
                
                <p style="color: #6b7280; line-height: 1.6;">
                  Prezado(a),
                </p>
                
                <p style="color: #6b7280; line-height: 1.6;">
                  Segue em anexo o relatório de abastecimentos solicitado, contendo <strong>${records.length} registro(s)</strong>.
                </p>
                
                <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #0891b2;">
                  <h3 style="margin: 0 0 15px 0; color: #0891b2;">Resumo</h3>
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">Total de Registros:</td>
                      <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #1f2937;">${records.length}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">Total de Litros:</td>
                      <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #1f2937;">${totalLiters.toFixed(2)}L</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px;">Valor Total:</td>
                      <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #0891b2; font-size: 18px; border-top: 1px solid #e5e7eb; padding-top: 12px;">R$ ${totalAmount.toFixed(2)}</td>
                    </tr>
                  </table>
                </div>
                
                <p style="color: #6b7280; line-height: 1.6;">
                  O relatório completo em PDF está anexado a este email.
                </p>
                
                <p style="color: #6b7280; line-height: 1.6; margin-bottom: 0;">
                  Atenciosamente,<br>
                  <strong>Equipe Exclusive Club</strong>
                </p>
              </div>
              
              <div style="background: #1f2937; color: #9ca3af; padding: 20px; text-align: center; font-size: 12px;">
                <p style="margin: 0;">
                  Relatório gerado automaticamente em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </p>
                <p style="margin: 10px 0 0 0;">
                  © ${new Date().getFullYear()} Exclusive Club - Todos os direitos reservados
                </p>
              </div>
            </div>
          `,
          text: `
RELATÓRIO DE ABASTECIMENTOS - EXCLUSIVE CLUB

Resumo:
- Total de Registros: ${records.length}
- Total de Litros: ${totalLiters.toFixed(2)}L
- Valor Total: R$ ${totalAmount.toFixed(2)}

O relatório completo em PDF está anexado a este email.

Atenciosamente,
Equipe Exclusive Club

Relatório gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
          `,
          attachments: [{
            filename,
            content: pdfBuffer,
            contentType: 'application/pdf',
          }],
        });

        return { success: true, email: input.email };
      }),

    // Novo endpoint: myRecords - Cliente vê seus próprios abastecimentos
    myRecords: publicProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
        }

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT 
            fr.id,
            fr.vessel_name as vesselName,
            fr.liters,
            fr.price_per_liter as pricePerLiter,
            fr.total_amount as totalAmount,
            fr.notes,
            fr.receipt_url as receiptUrl,
            fr.asaas_charge_id as asaasChargeId,
            fr.payment_status as paymentStatus,
            fr.paid_at as paidAt,
            fr.due_date as dueDate,
            fr.created_at as createdAt,
            b.booking_date as bookingDate
          FROM fuel_records fr
          LEFT JOIN bookings b ON fr.booking_id = b.id
          WHERE fr.client_email = ${ctx.user.email}
          ORDER BY fr.created_at DESC
        `) as any;

        const records = (Array.isArray(result[0]) ? result[0] : result);

        // Mapear campos para camelCase e converter centavos para reais
        return records.map((r: any) => ({
          id: r.id,
          vesselName: r.vesselName,
          liters: r.liters / 100, // Converter centavos para reais
          pricePerLiter: r.pricePerLiter / 100,
          totalAmount: r.totalAmount / 100,
          notes: r.notes,
          receiptUrl: r.receiptUrl,
          asaasChargeId: r.asaasChargeId,
          paymentStatus: r.paymentStatus,
          paidAt: r.paidAt,
          dueDate: r.dueDate,
          createdAt: r.createdAt,
          bookingDate: r.bookingDate,
        }));
      }),

    // Novo endpoint: uploadReceipt - Upload de comprovante de pagamento
    uploadReceipt: publicProcedure
      .input(z.object({
        recordId: z.number(),
        receiptUrl: z.string().url(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        await db.execute(sql`
          UPDATE fuel_records 
          SET receipt_url = ${input.receiptUrl}
          WHERE id = ${input.recordId}
        `);

        return { success: true };
      }),

    // Novo endpoint: financialStats - Estatísticas financeiras para dashboard
    financialStats: publicProcedure
      .input(z.object({
        monthYear: z.string().optional(), // formato: YYYY-MM
      }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user || ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');

        // Se não especificado, usar mês atual
        const monthYear = input.monthYear || new Date().toISOString().slice(0, 7);

        // Buscar estatísticas do mês
        const result = await db.execute(sql`
          SELECT 
            COUNT(*) as total_records,
            SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_received,
            SUM(total_amount) as total_billed,
            SUM(CASE WHEN payment_status = 'pending' THEN total_amount ELSE 0 END) as total_pending,
            SUM(CASE WHEN payment_status = 'overdue' THEN total_amount ELSE 0 END) as total_overdue
          FROM fuel_records
          WHERE DATE_FORMAT(created_at, '%Y-%m') = ${monthYear}
        `) as any;

        const stats = (Array.isArray(result[0]) ? result[0][0] : result[0]);

        // Buscar orçamento do mês (soma das compras de combustível)
        const budgetResult = await db.execute(sql`
          SELECT COALESCE(SUM(amount_paid), 0) as total_budget
          FROM fuel_purchases
          WHERE month_year = ${monthYear}
        `) as any;

        const budgetData = (Array.isArray(budgetResult[0]) ? budgetResult[0][0] : budgetResult[0]);

        const totalReceived = Number(stats.total_received) || 0;
        const totalBilled = Number(stats.total_billed) || 0;
        const totalPending = Number(stats.total_pending) || 0;
        const totalOverdue = Number(stats.total_overdue) || 0;
        const totalBudget = Number(budgetData.total_budget) || 0;

        // Calcular saldo (Orçamento - Gasto)
        // Saldo = quanto ainda resta do orçamento mensal após os gastos
        const balance = totalBudget - totalBilled;

        return {
          monthYear,
          totalRecords: Number(stats.total_records) || 0,
          totalReceived: totalReceived / 100, // Converter centavos para reais
          totalBilled: totalBilled / 100,
          totalPending: totalPending / 100,
          totalOverdue: totalOverdue / 100,
          balance: balance / 100,
          totalBudget: totalBudget / 100,
          budgetUsagePercent: totalBudget > 0 ? (totalBilled / totalBudget) * 100 : 0,
        };
      }),
  }),

  // Fuel Budget router - Admin only
  fuelBudget: router({
    get: publicProcedure
      .input(z.object({
        monthYear: z.string(), // formato: YYYY-MM
      }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user || ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT * FROM fuel_budget WHERE month_year = ${input.monthYear}
        `) as any;

        const budget = (Array.isArray(result[0]) ? result[0][0] : result[0]);
        
        // Calcular orçamento total como soma das compras do histórico
        const purchasesResult = await db.execute(sql`
          SELECT COALESCE(SUM(amount_paid), 0) as total_purchases,
                 COALESCE(SUM(liters_purchased), 0) as total_liters_purchased
          FROM fuel_purchases
          WHERE month_year = ${input.monthYear}
        `) as any;
        const purchasesData = (Array.isArray(purchasesResult[0]) ? purchasesResult[0][0] : purchasesResult[0]);
        const totalBudget = Number(purchasesData.total_purchases) || 0; // Já em centavos
        const totalLitersPurchased = Number(purchasesData.total_liters_purchased) || 0; // Já em centésimos

        // Calcular total de litros já abastecidos (usados)
        const usedResult = await db.execute(sql`
          SELECT COALESCE(SUM(liters), 0) as total_liters_used
          FROM fuel_records
          WHERE DATE_FORMAT(created_at, '%Y-%m') = ${input.monthYear}
        `) as any;
        const usedData = (Array.isArray(usedResult[0]) ? usedResult[0][0] : usedResult[0]);
        const totalLitersUsed = Number(usedData.total_liters_used) || 0; // Já em centésimos

        // Estoque real = Total comprado - Total usado
        const realStockLiters = totalLitersPurchased - totalLitersUsed;

        // Buscar último preço por litro da compra mais recente
        const lastPriceResult = await db.execute(sql`
          SELECT price_per_liter
          FROM fuel_purchases
          WHERE month_year = ${input.monthYear}
          ORDER BY purchased_at DESC
          LIMIT 1
        `) as any;
        const lastPriceData = (Array.isArray(lastPriceResult[0]) ? lastPriceResult[0][0] : lastPriceResult[0]);
        const lastPricePerLiter = lastPriceData ? Number(lastPriceData.price_per_liter) : 0;

        // Calcular total gasto (soma dos abastecimentos)
        const spentResult = await db.execute(sql`
          SELECT COALESCE(SUM(total_amount), 0) as total_spent
          FROM fuel_records
          WHERE DATE_FORMAT(created_at, '%Y-%m') = ${input.monthYear}
        `) as any;
        const spentData = (Array.isArray(spentResult[0]) ? spentResult[0][0] : spentResult[0]);
        const totalSpent = Number(spentData.total_spent) || 0;

        // Calcular total recebido (pagamentos confirmados)
        const receivedResult = await db.execute(sql`
          SELECT COALESCE(SUM(total_amount), 0) as total_received
          FROM fuel_records
          WHERE DATE_FORMAT(created_at, '%Y-%m') = ${input.monthYear}
            AND payment_status = 'paid'
        `) as any;
        const receivedData = (Array.isArray(receivedResult[0]) ? receivedResult[0][0] : receivedResult[0]);
        const totalReceived = Number(receivedData.total_received) || 0;

        return {
          monthYear: input.monthYear,
          totalBudget: totalBudget / 100, // Orçamento = soma das compras
          totalSpent: totalSpent / 100, // Gasto = soma dos abastecimentos
          totalReceived: totalReceived / 100, // Recebido = pagamentos confirmados
          stockLiters: realStockLiters / 100, // Estoque = comprado - usado
          lastPricePerLiter: lastPricePerLiter / 100, // Último preço/L das compras
        };
      }),

    // REMOVIDO: endpoint 'set' não é mais necessário
    // Orçamento agora é calculado automaticamente como soma das compras
  }),

  // Fuel Purchases router - Admin only
  fuelPurchases: router({
    create: adminProcedure
      .input(z.object({
        monthYear: z.string(), // formato: YYYY-MM
        liters: z.number().positive(),
        amountPaid: z.number().positive(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        
        // Calcular preço por litro
        const pricePerLiter = Math.round((input.amountPaid * 100) / input.liters); // em centavos
        const litersPurchased = Math.round(input.liters * 100); // em centésimos
        const amountPaid = Math.round(input.amountPaid * 100); // em centavos
        
        // Inserir compra
        await db.execute(sql`
          INSERT INTO fuel_purchases (
            month_year, liters_purchased, amount_paid, price_per_liter, 
            purchased_by, notes
          )
          VALUES (
            ${input.monthYear}, ${litersPurchased}, ${amountPaid}, ${pricePerLiter},
            ${ctx.user.id}, ${input.notes || null}
          )
        `);
        
        // Atualizar estoque e preço no fuel_budget
        await db.execute(sql`
          INSERT INTO fuel_budget (month_year, total_budget, total_spent, total_received, stock_liters, last_price_per_liter)
          VALUES (${input.monthYear}, 0, 0, 0, ${litersPurchased}, ${pricePerLiter})
          ON DUPLICATE KEY UPDATE 
            stock_liters = stock_liters + ${litersPurchased},
            last_price_per_liter = ${pricePerLiter}
        `);
        
        return { success: true };
      }),

    list: adminProcedure
      .input(z.object({
        monthYear: z.string(), // formato: YYYY-MM
      }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT 
            fp.*,
            u.name as purchased_by_name
          FROM fuel_purchases fp
          LEFT JOIN users u ON fp.purchased_by = u.id
          WHERE fp.month_year = ${input.monthYear}
          ORDER BY fp.purchased_at DESC
        `) as any;

        const purchases = (Array.isArray(result[0]) ? result[0] : result) as any[];
        
        return purchases.map((p: any) => ({
          id: p.id,
          monthYear: p.month_year,
          litersPurchased: p.liters_purchased / 100, // Converter para litros
          amountPaid: p.amount_paid / 100, // Converter para reais
          pricePerLiter: p.price_per_liter / 100, // Converter para reais
          purchasedAt: p.purchased_at,
          purchasedByName: p.purchased_by_name || 'Sistema',
          notes: p.notes,
        }));
      }),

    delete: adminProcedure
      .input(z.object({
        purchaseId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        
        // Buscar compra para devolver litros ao estoque
        const result = await db.execute(sql`
          SELECT * FROM fuel_purchases WHERE id = ${input.purchaseId}
        `) as any;
        const purchase = (Array.isArray(result[0]) ? result[0][0] : result[0]);
        
        if (!purchase) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Compra não encontrada' });
        }
        
        // Devolver litros ao estoque
        await db.execute(sql`
          UPDATE fuel_budget 
          SET stock_liters = stock_liters - ${purchase.liters_purchased}
          WHERE month_year = ${purchase.month_year}
        `);
        
        // Deletar compra
        await db.execute(sql`
          DELETE FROM fuel_purchases WHERE id = ${input.purchaseId}
        `);
        
        return { success: true };
      }),
  }),

  // Inspections router - Admin and Employee
  inspections: router({
    create: publicProcedure
      .input(z.object({
        bookingId: z.number(),
        vesselId: z.number(),
        vesselType: z.enum(['jetski', 'lancha']),
        clientName: z.string(),
        formData: z.record(z.string(), z.string()), // JSON com todos os campos do formulário
        observations: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { inspections, vessels } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        
        // Buscar nome da embarcação
        const vessel = await db.select().from(vessels).where(eq(vessels.id, input.vesselId)).limit(1);
        if (!vessel || vessel.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Embarcação não encontrada' });
        }

        // Determinar status geral (approved se todos aprovados, rejected se algum reprovado)
        const hasRejected = Object.values(input.formData).some(v => v === 'reprovado');
        const status = hasRejected ? 'rejected' : 'approved';

        try {
          await db.insert(inspections).values({
            bookingId: input.bookingId,
            vesselId: input.vesselId,
            vesselName: vessel[0].name,
            vesselType: input.vesselType,
            clientName: input.clientName,
            inspectionData: JSON.stringify(input.formData),
            observations: input.observations || null,
            status,
            inspectedBy: ctx.user?.name || null,
          });

          return { success: true };
        } catch (error: any) {
          console.error('[inspections.create] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao criar vistoria: ${error.message}` 
          });
        }
      }),

    list: publicProcedure
      .input(z.object({
        vesselId: z.number().optional(),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          // Buscar vistorias com JOIN para pegar nome da embarcação, cliente e data da reserva
          const { sql } = await import('drizzle-orm');
          const result = await db.execute(sql`
            SELECT 
              i.id,
              i.booking_id as bookingId,
              i.vessel_id as vesselId,
              i.vessel_name as vesselName,
              i.vessel_type as vesselType,
              i.inspection_data as inspectionData,
              i.observations,
              i.status,
              i.inspected_by as inspectedBy,
              i.created_at as createdAt,
              b.client_name as clientName,
              b.booking_date as bookingDate
            FROM inspections i
            LEFT JOIN bookings b ON i.booking_id = b.id
            ORDER BY i.created_at DESC
          `) as any;

          const inspections = (Array.isArray(result[0]) ? result[0] : result).map((row: any) => ({
            id: row.id,
            bookingId: row.bookingId,
            vesselId: row.vesselId,
            vesselName: row.vesselName,
            vesselType: row.vesselType,
            clientName: row.clientName,
            bookingDate: row.bookingDate,
            date: row.bookingDate, // Mapear para frontend
            inspectionData: typeof row.inspectionData === 'string' ? JSON.parse(row.inspectionData) : row.inspectionData,
            observations: row.observations,
            status: row.status,
            inspectedBy: row.inspectedBy, // Já é o nome (TEXT)
            createdAt: row.createdAt,
          }));

          return inspections;
        } catch (error: any) {
          console.error('[inspections.list] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao listar vistorias: ${error.message}` 
          });
        }
      }),

    getByBooking: publicProcedure
      .input(z.object({ bookingId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          const result = await db.execute(sql`
            SELECT i.*, u.name as inspected_by_name
            FROM inspections i
            LEFT JOIN users u ON i.inspected_by = u.id
            WHERE i.booking_id = ${input.bookingId}
            ORDER BY i.created_at DESC
          `) as any;

          const inspections = (Array.isArray(result[0]) ? result[0] : result).map((row: any) => ({
            ...row,
            inspectionData: typeof row.inspection_data === 'string' ? JSON.parse(row.inspection_data) : row.inspection_data
          }));

          return inspections;
        } catch (error: any) {
          console.error('[inspections.getByBooking] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao buscar vistorias: ${error.message}` 
          });
        }
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { inspections } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');

        try {
          await db.delete(inspections).where(eq(inspections.id, input.id));
          return { success: true };
        } catch (error: any) {
          console.error('[inspections.delete] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao excluir vistoria: ${error.message}` 
          });
        }
      }),

    generateReport: publicProcedure
      .input(z.object({
        inspectionIds: z.array(z.number()).optional(),
      }).optional())
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          
          let result;
          if (input?.inspectionIds && input.inspectionIds.length > 0) {
            // Buscar vistorias específicas por IDs
            const ids = input.inspectionIds.join(',');
            result = await db.execute(sql.raw(`
              SELECT 
                i.*,
                v.name as vessel_name,
                b.booking_date,
                b.client_name as booking_client_name,
                u.name as inspected_by_name
              FROM inspections i
              JOIN vessels v ON i.vessel_id = v.id
              LEFT JOIN bookings b ON i.booking_id = b.id
              LEFT JOIN users u ON i.inspected_by = u.id
              WHERE i.id IN (${ids})
              ORDER BY i.created_at DESC
            `)) as any;
          } else {
            // Buscar últimas 10 vistorias
            result = await db.execute(sql`
              SELECT 
                i.*,
                v.name as vessel_name,
                b.booking_date,
                b.client_name as booking_client_name,
                u.name as inspected_by_name
              FROM inspections i
              JOIN vessels v ON i.vessel_id = v.id
              LEFT JOIN bookings b ON i.booking_id = b.id
              LEFT JOIN users u ON i.inspected_by = u.id
              ORDER BY i.created_at DESC
              LIMIT 10
            `) as any;
          }

          const inspections = (Array.isArray(result[0]) ? result[0] : result).map((row: any) => ({
            ...row,
            inspection_data: typeof row.inspection_data === 'string' ? JSON.parse(row.inspection_data) : row.inspection_data
          }));

          // Gerar PDF
          const { generateInspectionsReportPDF } = await import('./_core/inspectionsPDF');
          const { notifyOwner } = await import('./_core/notification');
          const pdfBuffer = await generateInspectionsReportPDF(inspections);

          // Notificar owner
          await notifyOwner({
            title: '📋 Relatório de Vistorias Gerado',
            content: `Relatório das últimas ${inspections.length} vistorias foi gerado com sucesso. O PDF foi baixado automaticamente.`,
          });

          return { success: true, count: inspections.length, pdfBase64: pdfBuffer.toString('base64') };
        } catch (error: any) {
          console.error('[inspections.generateReport] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao gerar relatório: ${error.message}` 
          });
        }
      }),

    sendReportByEmail: publicProcedure
      .input(z.object({
        inspectionIds: z.array(z.number()),
        email: z.string().email(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          const ids = input.inspectionIds.join(',');
          
          const result = await db.execute(sql.raw(`
            SELECT 
              i.*,
              v.name as vessel_name,
              b.booking_date,
              b.client_name as booking_client_name,
              u.name as inspected_by_name
            FROM inspections i
            JOIN vessels v ON i.vessel_id = v.id
            LEFT JOIN bookings b ON i.booking_id = b.id
            LEFT JOIN users u ON i.inspected_by = u.id
            WHERE i.id IN (${ids})
            ORDER BY i.created_at DESC
          `)) as any;

          const inspections = (Array.isArray(result[0]) ? result[0] : result).map((row: any) => ({
            ...row,
            inspection_data: typeof row.inspection_data === 'string' ? JSON.parse(row.inspection_data) : row.inspection_data
          }));

          // Gerar PDF
          const { generateInspectionsReportPDF } = await import('./_core/inspectionsPDF');
          const pdfBuffer = await generateInspectionsReportPDF(inspections);

          // Enviar email
          const { sendEmail } = await import('./_core/emailService');
          await sendEmail({
            to: input.email,
            subject: `Relatório de Vistorias - ${new Date().toLocaleDateString('pt-BR')}`,
            text: `Segue em anexo o relatório de ${inspections.length} vistoria(s).`,
            html: `
              <h2>Relatório de Vistorias</h2>
              <p>Prezado(a),</p>
              <p>Segue em anexo o relatório contendo ${inspections.length} vistoria(s) solicitada(s).</p>
              <p>Atenciosamente,<br/>Exclusive Club</p>
            `,
            attachments: [{
              filename: `relatorio-vistorias-${new Date().toISOString().split('T')[0]}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf',
            }],
          });

          // Notificar owner
          const { notifyOwner } = await import('./_core/notification');
          await notifyOwner({
            title: '📧 Relatório de Vistorias Enviado',
            content: `Relatório de ${inspections.length} vistoria(s) enviado para ${input.email}.`,
          });

          return { success: true, count: inspections.length };
        } catch (error: any) {
          console.error('[inspections.sendReportByEmail] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao enviar relatório: ${error.message}` 
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
