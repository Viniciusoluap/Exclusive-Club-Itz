import { router, publicProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { 
  mapAsaasStatus, 
  mapToLegacyStatus,
  logWebhook, 
  updateWebhookLog,
  updatePaymentStatus,
  getPaymentByAsaasId,
  logPaymentAudit
} from "./_core/asaasService";
import { getDb } from "./db";
import { sql } from "drizzle-orm";

/**
 * Router para webhooks externos
 * Endpoints públicos que recebem notificações de serviços externos
 */
export const webhookRouter = router({
  /**
   * Webhook do Asaas - recebe notificações de mudanças de status de pagamento
   * Documentação: https://docs.asaas.com/reference/webhooks
   * 
   * Suporta múltiplos tipos de cobrança:
   * - fuel: Abastecimentos
   * - inspection: Vistorias
   * - repair: Reparos
   * - booking: Reservas
   * - monthly: Mensalidades
   */
  asaas: publicProcedure
    .input(z.object({
      event: z.string(),
      payment: z.object({
        id: z.string(),
        customer: z.string().optional(),
        value: z.number().optional(),
        netValue: z.number().optional(),
        status: z.string(),
        externalReference: z.string().optional(),
        paymentDate: z.string().optional(),
      }).passthrough(),
    }).passthrough())
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Extrai IP do request
      const ipAddress = ctx.req.headers['x-forwarded-for'] as string || 
                        ctx.req.headers['x-real-ip'] as string ||
                        ctx.req.socket?.remoteAddress || 
                        'unknown';

      // Registra log do webhook
      const webhookLogId = await logWebhook({
        source: 'asaas',
        eventType: input.event,
        payload: input as unknown as Record<string, unknown>,
        headers: {
          'asaas-access-token': ctx.req.headers['asaas-access-token'] as string || '',
          'content-type': ctx.req.headers['content-type'] as string || '',
        },
        ipAddress,
      });

      console.log('[Webhook Asaas] Payload recebido:', JSON.stringify(input, null, 2));
      console.log('[Webhook Asaas] Log ID:', webhookLogId);
      
      // Validar token de autenticação do webhook
      const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
      const receivedToken = ctx.req.headers['asaas-access-token'] || 
                           ctx.req.headers['authorization']?.replace('Bearer ', '');
      
      if (!webhookToken || receivedToken !== webhookToken) {
        console.error('[Webhook Asaas] Token inválido ou ausente');
        if (webhookLogId) {
          await updateWebhookLog({
            id: webhookLogId,
            processed: false,
            errorMessage: 'Token inválido ou ausente',
          });
        }
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Token inválido' });
      }

      // Processar apenas eventos de pagamento relevantes
      const relevantEvents = [
        'PAYMENT_RECEIVED', 
        'PAYMENT_CONFIRMED',
        'PAYMENT_OVERDUE', 
        'PAYMENT_DELETED',
        'PAYMENT_REFUNDED',
        'PAYMENT_UPDATED',
      ];
      
      if (!relevantEvents.includes(input.event)) {
        console.log('[Webhook Asaas] Evento ignorado:', input.event);
        if (webhookLogId) {
          await updateWebhookLog({
            id: webhookLogId,
            processed: true,
            errorMessage: `Evento ignorado: ${input.event}`,
          });
        }
        return { success: true, message: 'Evento ignorado' };
      }

      const asaasPaymentId = input.payment.id;
      const newStatus = mapAsaasStatus(input.payment.status);
      const legacyStatus = mapToLegacyStatus(newStatus);
      const paymentDate = input.payment.paymentDate ? new Date(input.payment.paymentDate) : null;

      // 1. Primeiro tenta atualizar na tabela central asaas_payments
      const centralPayment = await getPaymentByAsaasId(asaasPaymentId);
      
      if (centralPayment) {
        // Atualiza na tabela central
        await updatePaymentStatus({
          asaasPaymentId,
          status: input.payment.status,
          paymentDate: paymentDate || undefined,
          netValue: input.payment.netValue,
          source: 'webhook',
        });

        // Atualiza na tabela de origem baseado no tipo
        await updateSourceTable(db, centralPayment.chargeType, centralPayment.chargeId, legacyStatus, paymentDate);

        if (webhookLogId) {
          await updateWebhookLog({
            id: webhookLogId,
            processed: true,
            relatedPaymentId: centralPayment.id,
          });
        }

        console.log('[Webhook Asaas] Pagamento central atualizado:', {
          paymentId: centralPayment.id,
          chargeType: centralPayment.chargeType,
          chargeId: centralPayment.chargeId,
          newStatus,
        });

        return { 
          success: true, 
          message: 'Status atualizado com sucesso',
          paymentId: centralPayment.id,
          chargeType: centralPayment.chargeType,
          newStatus,
        };
      }

      // 2. Fallback: busca em tabelas legadas (fuel_records, inspection_charges)
      let found = false;
      let recordInfo: { type: string; id: number } | null = null;

      // Busca em fuel_records
      const fuelResult = await db.execute(sql`
        SELECT id FROM fuel_records WHERE asaas_charge_id = ${asaasPaymentId}
      `) as any;
      
      const fuelRecord = Array.isArray(fuelResult[0]) ? fuelResult[0][0] : fuelResult[0];
      
      if (fuelRecord) {
        await updateSourceTable(db, 'fuel', fuelRecord.id, legacyStatus, paymentDate);
        found = true;
        recordInfo = { type: 'fuel', id: fuelRecord.id };
      }

      // Busca em inspection_charges
      if (!found) {
        const inspectionResult = await db.execute(sql`
          SELECT id, charge_type FROM inspection_charges WHERE asaas_charge_id = ${asaasPaymentId}
        `) as any;
        
        const inspectionRecord = Array.isArray(inspectionResult[0]) ? inspectionResult[0][0] : inspectionResult[0];
        
        if (inspectionRecord) {
          await db.execute(sql`
            UPDATE inspection_charges 
            SET payment_status = ${legacyStatus},
                updated_at = NOW()
            WHERE id = ${inspectionRecord.id}
          `);
          found = true;
          recordInfo = { type: inspectionRecord.charge_type || 'inspection', id: inspectionRecord.id };
        }
      }

      if (!found) {
        console.warn('[Webhook Asaas] Registro não encontrado para cobrança:', asaasPaymentId);
        if (webhookLogId) {
          await updateWebhookLog({
            id: webhookLogId,
            processed: false,
            errorMessage: 'Registro não encontrado',
          });
        }
        return { success: true, message: 'Registro não encontrado' };
      }

      if (webhookLogId) {
        await updateWebhookLog({
          id: webhookLogId,
          processed: true,
        });
      }

      console.log('[Webhook Asaas] Status atualizado (legado):', {
        ...recordInfo,
        asaasPaymentId,
        newStatus: legacyStatus,
        event: input.event,
      });

      return { 
        success: true, 
        message: 'Status atualizado com sucesso',
        ...recordInfo,
        newStatus: legacyStatus,
      };
    }),
});

/**
 * Atualiza tabela de origem baseado no tipo de cobrança
 */
async function updateSourceTable(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  chargeType: string,
  chargeId: number,
  status: 'pending' | 'paid' | 'overdue',
  paymentDate: Date | null
): Promise<void> {
  const paidAtValue = paymentDate 
    ? `'${paymentDate.toISOString().slice(0, 19).replace('T', ' ')}'` 
    : (status === 'paid' ? 'NOW()' : 'NULL');

  switch (chargeType) {
    case 'fuel':
      await db.execute(sql.raw(`
        UPDATE fuel_records 
        SET payment_status = '${status}',
            paid_at = ${paidAtValue}
        WHERE id = ${chargeId}
      `));
      break;
      
    case 'inspection':
    case 'repair':
      await db.execute(sql`
        UPDATE inspection_charges 
        SET payment_status = ${status},
            updated_at = NOW()
        WHERE id = ${chargeId}
      `);
      break;
      
    case 'booking':
      // Futura implementação para reservas
      console.log('[Webhook] Booking payment update not implemented yet');
      break;
      
    case 'monthly':
      // Futura implementação para mensalidades
      console.log('[Webhook] Monthly payment update not implemented yet');
      break;
  }
}
