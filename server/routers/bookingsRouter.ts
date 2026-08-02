/**
 * Bookings Router — domínio de reservas
 *
 * Extraído de server/routers.ts (Story 40, SYS-03) sem alteração de
 * comportamento: montado em appRouter sob a mesma chave de antes (bookings),
 * mantendo o contrato da API idêntico para o frontend.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, employeeProcedure, allowedClientProcedure } from "../_core/trpc";
import {
  notifyNewBooking,
  notifyBookingCancellation,
  notifyBookingUsed,
  notifyClientBookingConfirmation,
  notifyClientBookingCancellation,
} from "../_core/emailNotification";
import * as db from "../db";

// Bookings
export const bookingsRouter = router({
  // Get recent bookings for fuel registration and inspections (Admin and Employee)
  getRecent: employeeProcedure
    .input(z.object({
      days: z.number().optional(), // Se não fornecido, retorna todas
      includeUsed: z.boolean().default(false), // Incluir reservas já usadas
      onlyUsed: z.boolean().default(false) // Apenas reservas já usadas (para abastecimento)
    }))
    .query(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql: sqlTag } = await import('drizzle-orm');

      const conditions: ReturnType<typeof sqlTag>[] = [];

      if (input.onlyUsed) {
        conditions.push(sqlTag`b.status = 'used'`);
      } else {
        conditions.push(sqlTag`(b.status = 'confirmed' OR b.status = 'used')`);
      }

      if (input.days !== undefined) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - input.days);
        conditions.push(sqlTag`b.booking_date >= ${cutoffDate.getTime()}`);
      }

      let query = sqlTag`
        SELECT
          b.id,
          b.vessel_id as vesselId,
          b.booking_date as startTime,
          b.booking_date as endTime,
          b.status,
          b.client_name as clientName,
          b.client_email as clientEmail,
          b.vessel_name as vesselName
        FROM bookings b
        WHERE ${sqlTag.join(conditions, sqlTag` AND `)}
        ORDER BY b.booking_date DESC
      `;

      if (input.onlyUsed) {
        query = sqlTag`${query} LIMIT 6`;
      }

      const result = await db.execute(query) as any;
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
      const dbInstance = await import('../db').then(m => m.getDb());
      if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql: sqlTag } = await import('drizzle-orm');
      const now = Date.now();
      const timeFilter = input?.timeFilter || "future";

      const query = timeFilter === "future"
        ? sqlTag`
            SELECT
              b.id, b.client_email as clientEmail, b.client_name as clientName,
              b.vessel_id as vesselId, b.vessel_name as vesselName,
              b.booking_date as bookingDate, b.status, b.notes,
              b.created_at as createdAt, b.updated_at as updatedAt
            FROM bookings b
            WHERE b.booking_date >= ${now}
            ORDER BY b.booking_date ASC
          `
        : sqlTag`
            SELECT
              b.id, b.client_email as clientEmail, b.client_name as clientName,
              b.vessel_id as vesselId, b.vessel_name as vesselName,
              b.booking_date as bookingDate, b.status, b.notes,
              b.created_at as createdAt, b.updated_at as updatedAt
            FROM bookings b
            WHERE b.booking_date < ${now}
            ORDER BY b.booking_date DESC
          `;

      const result = await dbInstance.execute(query) as any;
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
  getByMonth: employeeProcedure
    .input(z.object({
      year: z.number(),
      month: z.number(), // 1-12
    }))
    .query(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Calculate start and end of month in UTC
      const startDate = new Date(Date.UTC(input.year, input.month - 1, 1, 0, 0, 0)).getTime();
      const endDate = new Date(Date.UTC(input.year, input.month, 0, 23, 59, 59)).getTime();
      
      const { sql: sqlTag } = await import('drizzle-orm');
      const result = await db.execute(sqlTag`
        SELECT
          b.id,
          b.vessel_id as vesselId,
          b.booking_date as booking_date,
          b.status,
          b.notes,
          u.name as client_name,
          u.email as client_email,
          v.name as vessel_name
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN vessels v ON b.vessel_id = v.id
        WHERE b.booking_date >= ${startDate} AND b.booking_date <= ${endDate}
        ORDER BY b.booking_date ASC
      `) as any;
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
});
