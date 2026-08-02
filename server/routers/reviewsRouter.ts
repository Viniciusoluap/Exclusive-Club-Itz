/**
 * Reviews Router — avaliações de clientes
 *
 * Extraído de server/routers.ts (Story 40, SYS-03), montado em appRouter sob a
 * mesma chave de antes.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminProcedure, allowedClientProcedure } from "../_core/trpc";
import * as db from "../db";
import * as stats from "../stats";

export const reviewsRouter = router({
  create: allowedClientProcedure
    .input(z.object({
      bookingId: z.number(),
      vesselId: z.number(),
      vesselName: z.string(),
      rating: z.number().min(1).max(5),
      comment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await import('../db').then(m => m.getDb());
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
    const db = await import('../db').then(m => m.getDb());
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
      const db = await import('../db').then(m => m.getDb());
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
      const db = await import('../db').then(m => m.getDb());
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
});
