import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { notifyNewBooking, notifyBookingCancellation, notifyBookingUsed, notifyClientMaintenanceCancellation, notifyAdminMaintenanceCancellations } from "./_core/emailNotification";
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

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Allowed Clients Management (Admin only)
  allowedClients: router({
    list: adminProcedure.query(async () => {
      return await db.getAllowedClients();
    }),

    create: adminProcedure
      .input(z.object({
        email: z.string().email(),
        name: z.string().min(1),
        phone: z.string().optional(),
        quotas: z.array(z.object({
          vesselId: z.number(),
          quotaNumber: z.number().min(1).max(7), // 1-7 para lancha, 1-6 para jetski
          quotaType: z.enum(["full", "half"]),
        })),
      }))
      .mutation(async ({ input }) => {
        const existing = await db.getAllowedClientByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Email já cadastrado' });
        }
        
        // Validate quota numbers based on vessel type
        for (const quota of input.quotas) {
          const vessel = await db.getVesselById(quota.vesselId);
          if (!vessel) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Embarcação não encontrada' });
          }
          
          const maxQuota = vessel.type === 'lancha' ? 7 : 6;
          if (quota.quotaNumber < 1 || quota.quotaNumber > maxQuota) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: `Número de cota inválido para ${vessel.type}. Permitido: 1-${maxQuota}` 
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
        for (const quota of input.quotas) {
          await db.createClientQuota({
            clientId: client.id,
            vesselId: quota.vesselId,
            quotaNumber: quota.quotaNumber,
            quotaType: quota.quotaType,
          });
        }
        
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        email: z.string().email().optional(),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        isActive: z.boolean().optional(),
        quotas: z.array(z.object({
          vesselId: z.number(),
          quotaNumber: z.number().min(1).max(7),
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
    listAll: adminProcedure.query(async () => {
      return await db.getBookings();
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

        return { success: true };
      }),

    // Create booking for any client (admin only, no limits)
    createForClient: adminProcedure
      .input(z.object({
        clientEmail: z.string().email(),
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
    list: adminProcedure.query(async () => {
      return await db.getMaintenances();
    }),

    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getMaintenanceById(input.id);
      }),

    getByVessel: adminProcedure
      .input(z.object({ vesselId: z.number() }))
      .query(async ({ input }) => {
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

    create: adminProcedure
      .input(z.object({
        vesselId: z.number(),
        startDate: z.number(),
        endDate: z.number(),
        description: z.string().optional(),
        status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
      }))
      .mutation(async ({ input }) => {
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
        await db.createMaintenance({
          vesselId: input.vesselId,
          vesselName: vessel.name,
          startDate: input.startDate,
          endDate: input.endDate,
          description: input.description,
          status: input.status || 'scheduled',
        });

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

        // Enviar notificação para admin
        if (cancelledBookings.length > 0) {
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
        }

        return { 
          success: true,
          cancelledCount: cancelledBookings.length,
          cancelledBookings 
        };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        vesselId: z.number().optional(),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
        description: z.string().optional(),
        status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        
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
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
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
});

export type AppRouter = typeof appRouter;
