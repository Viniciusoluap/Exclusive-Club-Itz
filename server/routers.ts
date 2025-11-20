import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";

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
      }))
      .mutation(async ({ input }) => {
        const existing = await db.getAllowedClientByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Email já cadastrado' });
        }
        await db.createAllowedClient(input);
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        email: z.string().email().optional(),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateAllowedClient(id, data);
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
        const date = new Date(input.bookingDate);
        if (date.getDay() === 1) {
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

        // Check if vessel is already booked for this date
        const existingBookings = await db.getBookingsByVesselAndDate(input.vesselId, input.bookingDate);
        if (existingBookings.length > 0) {
          throw new TRPCError({ 
            code: 'CONFLICT', 
            message: 'Esta embarcação já está reservada para esta data' 
          });
        }

        // Check user's active bookings (max 2)
        const activeBookings = await db.getActiveBookingsByEmail(ctx.user.email);
        if (activeBookings.length >= 2) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Você já possui 2 reservas ativas. Utilize uma reserva para liberar um novo agendamento.' 
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
        return { success: true };
      }),

    // Mark as used (admin only)
    markAsUsed: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.updateBooking(input.id, { status: 'used' });
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
});

export type AppRouter = typeof appRouter;
