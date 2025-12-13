import { router, publicProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { mapAsaasStatus } from "./_core/asaas";
import { getDb } from "./db";

/**
 * Router para webhooks externos
 * Endpoints públicos que recebem notificações de serviços externos
 */
export const webhookRouter = router({
  /**
   * Webhook do Asaas - recebe notificações de mudanças de status de pagamento
   * Documentação: https://docs.asaas.com/reference/webhooks
   */
  asaas: publicProcedure
    .input(z.object({
      event: z.string(),
      payment: z.object({
        id: z.string(),
        customer: z.string(),
        value: z.number(),
        status: z.string(),
        externalReference: z.string().optional(),
      }).passthrough(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Validar token de autenticação do webhook
      const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
      const receivedToken = ctx.req.headers['asaas-access-token'] || ctx.req.headers['authorization']?.replace('Bearer ', '');
      
      if (!webhookToken || receivedToken !== webhookToken) {
        console.error('[Webhook Asaas] Token inválido ou ausente');
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Token inválido' });
      }

      console.log('[Webhook Asaas] Evento recebido:', input.event, 'Payment ID:', input.payment.id);

      // Processar apenas eventos de pagamento relevantes
      const relevantEvents = ['PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED'];
      if (!relevantEvents.includes(input.event)) {
        console.log('[Webhook Asaas] Evento ignorado:', input.event);
        return { success: true, message: 'Evento ignorado' };
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Buscar registro de abastecimento pela cobrança do Asaas
      const { sql } = await import('drizzle-orm');
      const result = await db.execute(sql`
        SELECT id FROM fuel_records WHERE asaas_charge_id = ${input.payment.id}
      `) as any;
      
      const record = (Array.isArray(result[0]) ? result[0][0] : result[0]);
      
      if (!record) {
        console.error('[Webhook Asaas] Registro de abastecimento não encontrado para cobrança:', input.payment.id);
        return { success: true, message: 'Registro não encontrado' };
      }

      // Mapear status do Asaas para status do sistema
      const newStatus = mapAsaasStatus(input.payment.status);
      const paidAt = newStatus === 'paid' ? new Date() : null;
      const paidAtValue = paidAt ? `'${paidAt.toISOString().slice(0, 19).replace('T', ' ')}'` : 'NULL';

      // Atualizar status do pagamento
      await db.execute(sql.raw(`
        UPDATE fuel_records 
        SET payment_status = '${newStatus}',
            paid_at = ${paidAtValue}
        WHERE id = ${record.id}
      `));

      console.log('[Webhook Asaas] Status atualizado:', {
        recordId: record.id,
        chargeId: input.payment.id,
        oldStatus: 'pending',
        newStatus,
        event: input.event,
      });

      return { 
        success: true, 
        message: 'Status atualizado com sucesso',
        recordId: record.id,
        newStatus,
      };
    }),
});
