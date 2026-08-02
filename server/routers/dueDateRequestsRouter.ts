/**
 * Due Date Requests Router — solicitações de mudança de vencimento
 *
 * Extraído de server/routers.ts (Story 40, SYS-03) sem alteração de
 * comportamento: montado em appRouter sob a mesma chave de antes.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import * as db from "../db";
import * as stats from "../stats";

// Due Date Change Requests - Solicitações de mudança de vencimento
export const dueDateRequestsRouter = router({
  // Admin: Listar todas as solicitações
  list: adminProcedure
    .input(z.object({
      status: z.enum(['all', 'pending', 'approved', 'rejected']).optional(),
      monthYear: z.string().optional(), // formato: YYYY-MM
    }))
    .query(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        
        const conditions: any[] = [];
        if (input.status && input.status !== 'all') {
          conditions.push(sql`r.status = ${input.status}`);
        }
        if (input.monthYear) {
          const [year, month] = input.monthYear.split('-');
          conditions.push(sql`YEAR(r.created_at) = ${Number(year)}`);
          conditions.push(sql`MONTH(r.created_at) = ${Number(month)}`);
        }
        const extraWhere = conditions.length > 0
          ? sql`AND ${sql.join(conditions, sql` AND `)}`
          : sql``;

        const result = await db.execute(sql`
          SELECT
            r.*,
            c.charge_type,
            c.vessel_name,
            c.amount,
            c.payment_status
          FROM due_date_change_requests r
          JOIN inspection_charges c ON r.charge_id = c.id
          WHERE 1=1
          ${extraWhere}
          ORDER BY r.created_at DESC
        `) as any;
        return (Array.isArray(result[0]) ? result[0] : result);
      } catch (error: any) {
        console.error('[dueDateRequests.list] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro ao listar solicitações. Tente novamente.'
        });
      }
    }),

  // Admin: Aprovar solicitação
  approve: adminProcedure
    .input(z.object({
      requestId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        
        // Buscar solicitação
        const requestResult = await db.execute(sql`
          SELECT * FROM due_date_change_requests WHERE id = ${input.requestId}
        `) as any;

        const requests = (Array.isArray(requestResult[0]) ? requestResult[0] : requestResult);
        if (requests.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitação não encontrada' });
        }

        const request = requests[0];
        const newDueDateApproved = new Date(request.new_due_date).toISOString().split('T')[0];

        // Atualizar vencimento na cobrança
        await db.execute(sql`
          UPDATE inspection_charges
          SET due_date = ${newDueDateApproved}
          WHERE id = ${request.charge_id}
        `);

        // Atualizar status da solicitação
        await db.execute(sql`
          UPDATE due_date_change_requests
          SET status = 'approved',
              processed_by = ${ctx.user?.email ?? null},
              updated_at = NOW()
          WHERE id = ${input.requestId}
        `);

        // Buscar dados da cobrança para enviar email
        const chargeResult = await db.execute(sql`
          SELECT charge_type, vessel_name, client_email
          FROM inspection_charges
          WHERE id = ${request.charge_id}
        `) as any;
        
        const charges = (Array.isArray(chargeResult[0]) ? chargeResult[0] : chargeResult);
        if (charges.length > 0) {
          const charge = charges[0];
          
          // Enviar email ao cliente confirmando
          const { notifyClientDueDateApproved } = await import('../_core/inspectionEmails');
          await notifyClientDueDateApproved({
            clientEmail: charge.client_email,
            clientName: request.client_email.split('@')[0], // Fallback: usar parte do email
            chargeType: charge.charge_type,
            vesselName: charge.vessel_name,
            newDueDate: request.new_due_date,
          }).catch(err => {
            console.error('[dueDateRequests.approve] Erro ao enviar email:', err);
            // Não falhar a operação se o email falhar
          });
        }
        
        return { success: true, message: 'Solicitação aprovada com sucesso!' };
      } catch (error: any) {
        console.error('[dueDateRequests.approve] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao aprovar solicitação: ${error.message}` 
        });
      }
    }),

  // Admin: Rejeitar solicitação
  reject: adminProcedure
    .input(z.object({
      requestId: z.number(),
      reason: z.string().min(10, 'Motivo deve ter pelo menos 10 caracteres'),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        
        // Buscar solicitação antes de atualizar
        const requestResult = await db.execute(sql`
          SELECT * FROM due_date_change_requests WHERE id = ${input.requestId}
        `) as any;
        
        const requests = (Array.isArray(requestResult[0]) ? requestResult[0] : requestResult);
        if (requests.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitação não encontrada' });
        }
        
        const request = requests[0];
        
        // Atualizar status da solicitação
        await db.execute(sql`
          UPDATE due_date_change_requests
          SET status = 'rejected',
              admin_response = ${input.reason},
              processed_by = ${ctx.user?.email ?? null},
              updated_at = NOW()
          WHERE id = ${input.requestId}
        `);
        
        // Buscar dados da cobrança para enviar email
        const chargeResult = await db.execute(sql`
          SELECT charge_type, vessel_name, client_email
          FROM inspection_charges
          WHERE id = ${request.charge_id}
        `) as any;
        
        const charges = (Array.isArray(chargeResult[0]) ? chargeResult[0] : chargeResult);
        if (charges.length > 0) {
          const charge = charges[0];
          
          // Enviar email ao cliente explicando
          const { notifyClientDueDateRejected } = await import('../_core/inspectionEmails');
          await notifyClientDueDateRejected({
            clientEmail: charge.client_email,
            clientName: request.client_email.split('@')[0], // Fallback: usar parte do email
            chargeType: charge.charge_type,
            vesselName: charge.vessel_name,
            reason: input.reason,
          }).catch(err => {
            console.error('[dueDateRequests.reject] Erro ao enviar email:', err);
            // Não falhar a operação se o email falhar
          });
        }
        
        return { success: true, message: 'Solicitação rejeitada com sucesso!' };
      } catch (error: any) {
        console.error('[dueDateRequests.reject] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao rejeitar solicitação: ${error.message}` 
        });
      }
    }),

  // Admin: Estatísticas
  stats: adminProcedure.query(async () => {
    const db = await import('../db').then(m => m.getDb());
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

    try {
      const { sql } = await import('drizzle-orm');
      
      const result = await db.execute(sql.raw(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM due_date_change_requests
      `)) as any;
      
      const stats = (Array.isArray(result[0]) ? result[0][0] : result[0]);
      
      return {
        total: Number(stats.total) || 0,
        pending: Number(stats.pending) || 0,
        approved: Number(stats.approved) || 0,
        rejected: Number(stats.rejected) || 0,
      };
    } catch (error: any) {
      console.error('[dueDateRequests.stats] Error:', error);
      throw new TRPCError({ 
        code: 'INTERNAL_SERVER_ERROR', 
        message: `Erro ao buscar estatísticas: ${error.message}` 
        });
      }
    }),
});
