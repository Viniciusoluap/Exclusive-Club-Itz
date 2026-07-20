/**
 * Lógica de processamento do webhook Asaas, extraída da rota Express
 * (server/_core/index.ts) para ser testável isoladamente.
 *
 * Comportamento idêntico ao handler original — apenas movido para uma função
 * importável, sem nenhuma mudança de lógica. A rota Express continua
 * respondendo 200 imediatamente e só então chama esta função (fire-and-forget).
 */
import { normalizeBpoStatus, syncStatusToSources } from "../routers/bpoRouter";
import { getDb } from "../db";
import { sql as drizzleSql } from "drizzle-orm";

export interface AsaasWebhookResult {
  /** Token e payload válidos e evento reconhecido (mesmo que não processado). */
  accepted: boolean;
  event?: string;
  asaasPaymentId?: string;
  /** true se bpo_charges foi efetivamente atualizado (charge encontrada). */
  processed?: boolean;
}

export async function processAsaasWebhookEvent(
  payload: any,
  receivedToken: string
): Promise<AsaasWebhookResult> {
  try {
    const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN || '';
    console.log('[Webhook Asaas] Evento recebido:', payload?.event, '| ID:', payload?.payment?.id);
    if (!webhookToken) {
      console.error('[Webhook Asaas] ASAAS_WEBHOOK_TOKEN não configurado — rejeitando evento por segurança');
      return { accepted: false };
    }
    if (receivedToken !== webhookToken) {
      console.warn('[Webhook Asaas] Token inválido — ignorando evento');
      return { accepted: false };
    }
    const { event, payment } = payload || {};
    if (!event || !payment?.id) {
      console.warn('[Webhook Asaas] Payload inválido:', JSON.stringify(payload));
      return { accepted: false };
    }
    const relevantEvents = [
      'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_OVERDUE',
      'PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_UPDATED',
    ];
    if (!relevantEvents.includes(event)) {
      console.log('[Webhook Asaas] Evento ignorado:', event);
      return { accepted: true, event };
    }
    const db = await getDb();
    if (!db) {
      console.error('[Webhook Asaas] Database não disponível');
      return { accepted: true, event, processed: false };
    }
    const asaasId = String(payment.id);
    const newStatus = normalizeBpoStatus(payment.status || '');
    const isPaid = ['received', 'confirmed', 'receivedInCash'].includes(newStatus);
    const paidDate: Date | null = payment.paymentDate ? new Date(payment.paymentDate) : null;
    const value = payment.value ?? null;
    const amountPaidVal = isPaid && value !== null ? Number(value) : 0;
    const [bpoResult] = (await db.execute(drizzleSql`
      UPDATE bpo_charges
      SET status = ${newStatus}, paid_date = ${paidDate},
          amount_paid = ${amountPaidVal}, synced_at = NOW(), source = 'asaas_webhook'
      WHERE asaas_charge_id = ${asaasId}
    `)) as any;
    const affectedRows = (bpoResult as any)?.affectedRows ?? 0;
    console.log('[Webhook Asaas] bpo_charges atualizado:', asaasId, '->', newStatus, '| rows:', affectedRows);

    // Sincronizar status para inspection_charges e fuel_records
    try {
      await syncStatusToSources(db, asaasId, newStatus);
    } catch (syncErr: any) {
      console.warn('[Webhook Asaas] Falha ao sincronizar tabelas de origem:', syncErr?.message);
    }

    // Se é pagamento de cobrança CONSOLIDADA, marcar cobranças originais como pagas
    if (isPaid) {
      try {
        const externalRef: string = payment.externalReference || '';
        if (externalRef.startsWith('consolidated-')) {
          // Formato: "consolidated-{ids separados por vírgula}-{timestamp}"
          const parts = externalRef.split('-');
          if (parts.length >= 3) {
            // parts[0] = 'consolidated', parts[1] = ids, parts[n-1] = timestamp
            const idsStr = parts.slice(1, -1).join('-');
            const originalIds = idsStr.split(',').map((s: string) => parseInt(s, 10)).filter((n: number) => !isNaN(n) && n > 0);
            if (originalIds.length > 0) {
              const idsSQL = drizzleSql.join(originalIds.map((id: number) => drizzleSql`${id}`), drizzleSql`, `);
              await db.execute(drizzleSql`
                UPDATE bpo_charges
                SET status = 'receivedInCash', paid_date = ${paidDate}, synced_at = NOW(), source = 'asaas_webhook'
                WHERE id IN (${idsSQL})
                  AND status NOT IN ('receivedInCash','received','confirmed','cancelled')
              `);
              console.log('[Webhook Asaas] Cobranças originais marcadas como pagas:', originalIds.join(','));
              // Sincronizar inspection_charges e fuel_records para cada cobrança original
              const [origRows] = (await db.execute(drizzleSql`
                SELECT asaas_charge_id FROM bpo_charges WHERE id IN (${idsSQL})
              `)) as any;
              for (const row of (Array.isArray(origRows) ? origRows : [])) {
                if (row?.asaas_charge_id) {
                  await syncStatusToSources(db, row.asaas_charge_id, 'receivedInCash');
                }
              }
            }
          }
        }
      } catch (consolidatedErr: any) {
        console.warn('[Webhook Asaas] Falha ao processar cobranças consolidadas:', consolidatedErr?.message);
      }
    }
    // Gravar log do webhook para auditoria
    try {
      const payloadStr = JSON.stringify(payload).substring(0, 4000);
      const errorMsg: string | null = affectedRows === 0 ? `Cobrança não encontrada: ${asaasId.substring(0, 100)}` : null;
      await db.execute(drizzleSql`
        INSERT INTO webhook_logs (event, asaas_payment_id, payload, processed, error, created_at)
        VALUES (${event}, ${asaasId}, ${payloadStr}, ${affectedRows > 0 ? 1 : 0}, ${errorMsg}, NOW())
      `);
    } catch (logErr: any) {
      console.warn('[Webhook Asaas] Falha ao gravar log:', logErr?.message);
    }
    console.log('[Webhook Asaas] Processamento concluído para:', asaasId);
    return { accepted: true, event, asaasPaymentId: asaasId, processed: affectedRows > 0 };
  } catch (err: any) {
    console.error('[Webhook Asaas] Erro ao processar:', err?.message || err);
    return { accepted: false };
  }
}
