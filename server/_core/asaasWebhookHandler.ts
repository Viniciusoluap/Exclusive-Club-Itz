/**
 * Lógica de processamento do webhook Asaas, extraída da rota Express
 * (server/_core/index.ts) para ser testável isoladamente.
 *
 * Story 9 (Fase 1, SYS-19): idempotente (reenvio do mesmo evento não
 * reprocessa), atômico (processamento local dentro de uma transação) e
 * projetado para a rota Express responder com o status HTTP real do
 * resultado (não mais 200 antecipado antes de processar).
 */
import { timingSafeEqual } from "node:crypto";
import { normalizeBpoStatus, syncStatusToSources } from "../routers/bpoRouter";
import { getDb } from "../db";
import { getSetting } from "../systemSettings";
import { sql } from "drizzle-orm";

export interface AsaasWebhookResult {
  /** Token e payload válidos e evento reconhecido (mesmo que não processado). */
  accepted: boolean;
  /** Motivo da rejeição, quando accepted=false — usado pela rota Express para escolher o status HTTP. */
  rejectReason?: "invalid_token" | "invalid_payload" | "database_unavailable" | "internal_error";
  event?: string;
  asaasPaymentId?: string;
  /** true se bpo_charges foi efetivamente atualizado (charge encontrada). */
  processed?: boolean;
  /** true quando este evento (event + payment.id) já tinha sido processado com sucesso antes — reenvio idempotente, nenhum efeito novo. */
  duplicate?: boolean;
}

// Comparação em tempo constante: `!==` em string vaza timing information
// (quanto mais chars corretos no início, mais devagar falha), o que é uma
// prática ruim para comparar segredos mesmo sendo de risco baixo aqui
// (token compartilhado, não senha de usuário).
function tokensMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function processAsaasWebhookEvent(
  payload: any,
  receivedToken: string
): Promise<AsaasWebhookResult> {
  try {
    const webhookToken =
      process.env.ASAAS_WEBHOOK_TOKEN ||
      (await getSetting("asaas_webhook_token")) ||
      "";
    console.log('[Webhook Asaas] Evento recebido:', payload?.event, '| ID:', payload?.payment?.id);
    if (!webhookToken) {
      console.error('[Webhook Asaas] ASAAS_WEBHOOK_TOKEN não configurado — rejeitando evento por segurança');
      return { accepted: false, rejectReason: "invalid_token" };
    }
    if (!receivedToken || !tokensMatch(receivedToken, webhookToken)) {
      console.warn('[Webhook Asaas] Token inválido — rejeitando evento');
      return { accepted: false, rejectReason: "invalid_token" };
    }
    const { event, payment } = payload || {};
    if (!event || !payment?.id) {
      console.warn('[Webhook Asaas] Payload inválido:', JSON.stringify(payload));
      return { accepted: false, rejectReason: "invalid_payload" };
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
      return { accepted: false, event, rejectReason: "database_unavailable" };
    }
    const asaasId = String(payment.id);
    const payloadStr = JSON.stringify(payload).substring(0, 4000);

    const newStatus = normalizeBpoStatus(payment.status || '');
    const isPaid = ['received', 'confirmed', 'receivedInCash'].includes(newStatus);
    // O Asaas envia paymentDate como string "YYYY-MM-DD" (mesmo formato do
    // resto do BPO, ver bpoRouter.ts), e bpo_charges.paid_date é VARCHAR(10)
    // — envolver em `new Date(...)` (como o código fazia antes) produz um
    // objeto Date, que o mysql2 tenta serializar como "YYYY-MM-DD HH:MM:SS"
    // e estoura o VARCHAR(10) com "Data too long for column 'paid_date'",
    // derrubando esta UPDATE (e portanto o webhook inteiro) sempre que o
    // evento tem paymentDate — ou seja, em todo pagamento confirmado.
    const paidDate: string | null = payment.paymentDate ? String(payment.paymentDate).slice(0, 10) : null;
    const value = payment.value ?? null;
    const amountPaidVal = isPaid && value !== null ? Number(value) : 0;

    // Reivindicação + processamento + marcação como concluído, tudo numa
    // única transação:
    //  - Reivindicar fora da transação (INSERT solto) permitiria um reenvio
    //    concorrente do MESMO evento escapar entre a reivindicação e o
    //    processamento real (race condition).
    //  - Se qualquer parte falhar, a transação inteira reverte — INCLUINDO a
    //    reivindicação. Isso é proposital: um reenvio seguinte do Asaas para
    //    o mesmo evento deve poder tentar de novo do zero, não ser
    //    descartado como "duplicata" de uma tentativa que nunca teve sucesso.
    //    O preço é não guardar o erro de tentativas que falharam no áudito
    //    permanente (webhook_logs só grava o resultado final) — o
    //    console.error abaixo ainda captura isso nos logs do servidor.
    let affectedRows = 0;
    let alreadyProcessed = false;
    await db.transaction(async (tx) => {
      // Upsert que nunca lança erro de duplicata (ON DUPLICATE KEY UPDATE
      // é um no-op aqui) — o controle de idempotência real é o SELECT ...
      // FOR UPDATE logo abaixo, que também serializa reenvios concorrentes
      // do mesmo evento via lock de linha até esta transação terminar.
      await tx.execute(sql`
        INSERT INTO webhook_logs (event, asaas_payment_id, payload, processed, created_at)
        VALUES (${event}, ${asaasId}, ${payloadStr}, 0, NOW())
        ON DUPLICATE KEY UPDATE id = id
      `);

      const [claimRows] = (await tx.execute(sql`
        SELECT id, processed FROM webhook_logs
        WHERE event = ${event} AND asaas_payment_id = ${asaasId}
        FOR UPDATE
      `)) as any;
      const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;

      if (claim.processed === 1) {
        alreadyProcessed = true;
        return;
      }

      const [bpoResult] = (await tx.execute(sql`
        UPDATE bpo_charges
        SET status = ${newStatus}, paid_date = ${paidDate},
            amount_paid = ${amountPaidVal}, synced_at = NOW(), source = 'asaas_webhook'
        WHERE asaas_charge_id = ${asaasId}
      `)) as any;
      affectedRows = (bpoResult as any)?.affectedRows ?? 0;
      console.log('[Webhook Asaas] bpo_charges atualizado:', asaasId, '->', newStatus, '| rows:', affectedRows);

      await syncStatusToSources(tx, asaasId, newStatus);

      // Se é pagamento de cobrança CONSOLIDADA, marcar cobranças originais como pagas
      if (isPaid) {
        const externalRef: string = payment.externalReference || '';
        if (externalRef.startsWith('consolidated-')) {
          // Formato: "consolidated-{ids separados por vírgula}-{timestamp}"
          const parts = externalRef.split('-');
          if (parts.length >= 3) {
            // parts[0] = 'consolidated', parts[1] = ids, parts[n-1] = timestamp
            const idsStr = parts.slice(1, -1).join('-');
            const originalIds = idsStr.split(',').map((s: string) => parseInt(s, 10)).filter((n: number) => !isNaN(n) && n > 0);
            if (originalIds.length > 0) {
              const idsSQL = sql.join(originalIds.map((id: number) => sql`${id}`), sql`, `);
              await tx.execute(sql`
                UPDATE bpo_charges
                SET status = 'receivedInCash', paid_date = ${paidDate}, synced_at = NOW(), source = 'asaas_webhook'
                WHERE id IN (${idsSQL})
                  AND status NOT IN ('receivedInCash','received','confirmed','cancelled')
              `);
              console.log('[Webhook Asaas] Cobranças originais marcadas como pagas:', originalIds.join(','));
              // Sincronizar inspection_charges e fuel_records para cada cobrança original
              const [origRows] = (await tx.execute(sql`
                SELECT asaas_charge_id FROM bpo_charges WHERE id IN (${idsSQL})
              `)) as any;
              for (const row of (Array.isArray(origRows) ? origRows : [])) {
                if (row?.asaas_charge_id) {
                  await syncStatusToSources(tx, row.asaas_charge_id, 'receivedInCash');
                }
              }
            }
          }
        }
      }

      const errorMsg: string | null = affectedRows === 0 ? `Cobrança não encontrada: ${asaasId.substring(0, 100)}` : null;
      await tx.execute(sql`
        UPDATE webhook_logs
        SET processed = ${affectedRows > 0 ? 1 : 0}, error = ${errorMsg}
        WHERE id = ${claim.id}
      `);
    });

    if (alreadyProcessed) {
      console.log('[Webhook Asaas] Evento duplicado (já processado antes), ignorando:', event, asaasId);
      return { accepted: true, event, asaasPaymentId: asaasId, duplicate: true };
    }

    console.log('[Webhook Asaas] Processamento concluído para:', asaasId);
    return { accepted: true, event, asaasPaymentId: asaasId, processed: affectedRows > 0 };
  } catch (err: any) {
    console.error('[Webhook Asaas] Erro ao processar:', err?.message || err);
    return { accepted: false, rejectReason: "internal_error" };
  }
}
