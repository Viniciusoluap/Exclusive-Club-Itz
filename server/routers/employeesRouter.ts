/**
 * Employees Router — funcionários (visão do próprio funcionário e gestão admin)
 *
 * Extraído de server/routers.ts (Story 40, SYS-03), montado em appRouter sob as
 * mesmas chaves de antes (employee, employees).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, employeeProcedure } from "../_core/trpc";
import * as db from "../db";

// Employee router - For employee and admin users
export const employeeRouter = router({
  // Get upcoming reservations (today + next 20 future confirmed)
  // Lógica: reservas do dia atual só aparecem até 18h (horário de Brasília)
  // Após 18h, reservas do dia atual são consideradas passadas
  upcomingReservations: employeeProcedure.query(async () => {
    const dbInstance = await import('../db').then(m => m.getDb());
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
});


// Employees router - Admin only
export const employeesRouter = router({
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }),
      phone: z.string().optional(),
      vesselIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { employees } = await import('../../drizzle/schema');

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
    const db = await import('../db').then(m => m.getDb());
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
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { employees } = await import('../../drizzle/schema');
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
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { employees, users } = await import('../../drizzle/schema');
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
});
