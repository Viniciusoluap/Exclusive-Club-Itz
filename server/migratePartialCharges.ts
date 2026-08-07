/**
 * Migração das cobranças legadas em `partiallyPaid`.
 *
 * POR QUE EXISTE: a regra do negócio é que pagamento parcial dá BAIXA pelo
 * valor realmente recebido e gera um SALDO DEVEDOR separado, no mesmo centro de
 * custo. O estado `partiallyPaid` não deveria existir. O código novo já segue
 * essa regra, mas as cobranças criadas antes ficaram presas no estado antigo.
 *
 * O ESTRAGO QUE ELAS CAUSAM: enquanto a cobrança fica `partiallyPaid`, ela soma
 * o valor ORIGINAL em "Total Cobrado" e o saldo devedor soma o restante — o
 * mesmo dinheiro contado duas vezes, inflando o faturamento. E o valor
 * efetivamente recebido não entra em "Recebido", porque as consultas de totais
 * só olham os status liquidados. Três números errados de uma vez.
 *
 * A REGRA É REUSADA, NÃO REESCRITA: esta migração chama a mesma
 * `applyPaymentToCharge` que os pagamentos novos usam, com `paymentAmount = 0`
 * — o que já foi pago continua sendo o que já foi pago. Uma segunda
 * implementação da regra seria uma segunda chance de divergir dela, que foi
 * exatamente o defeito original (três caminhos de pagamento, três
 * comportamentos).
 *
 * SEMPRE COM PRÉVIA: isto mexe em dinheiro. `preview` mostra linha a linha o
 * que mudaria, sem alterar nada.
 */

import { sql } from "drizzle-orm";
import { applyPaymentToCharge } from "./routers/bpoRouter";
import { todayInSaoPaulo } from "./_core/dateBR";

export type CobrancaParaMigrar = {
  id: number;
  cliente: string;
  descricao: string;
  valorOriginal: number;
  valorRecebido: number;
  saldoDevedor: number;
  dataPagamento: string;
};

export type PreviaMigracao = {
  total: number;
  somaOriginal: number;
  somaRecebida: number;
  somaSaldoDevedor: number;
  cobrancas: CobrancaParaMigrar[];
};

/**
 * Cobranças ainda presas em `partiallyPaid`.
 *
 * Exclui as que são elas mesmas um saldo devedor (`external_reference`
 * começando com `saldo-`): migrar um saldo devedor geraria saldo de saldo,
 * numa cascata sem fim.
 */
async function buscarLegadas(db: any): Promise<any[]> {
  const raw = (await db.execute(sql`
    SELECT id, value, amount_paid AS amountPaid, paid_date AS paidDate,
           type, client_id AS clientId, client_name AS clientName,
           client_email AS clientEmail, description,
           asaas_customer_id AS asaasCustomerId, asaas_charge_id AS asaasChargeId,
           external_reference AS externalReference, payment_links AS paymentLinks
    FROM bpo_charges
    WHERE status = 'partiallyPaid'
      AND (external_reference IS NULL OR external_reference NOT LIKE 'saldo-%')
    ORDER BY id
  `)) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  return Array.isArray(rows) ? rows : [];
}

function resumir(r: any): CobrancaParaMigrar {
  const valorOriginal = parseFloat(String(r.value ?? "0"));
  const valorRecebido = parseFloat(String(r.amountPaid ?? "0"));
  return {
    id: Number(r.id),
    cliente: String(r.clientName ?? r.clientEmail ?? "(sem cliente)"),
    descricao: String(r.description ?? ""),
    valorOriginal,
    valorRecebido,
    saldoDevedor: Math.max(0, valorOriginal - valorRecebido),
    dataPagamento: r.paidDate ? String(r.paidDate).substring(0, 10) : todayInSaoPaulo(),
  };
}

export async function previewPartialMigration(db: any): Promise<PreviaMigracao> {
  const legadas = await buscarLegadas(db);
  const cobrancas = legadas.map(resumir);

  return {
    total: cobrancas.length,
    somaOriginal: cobrancas.reduce((a, c) => a + c.valorOriginal, 0),
    somaRecebida: cobrancas.reduce((a, c) => a + c.valorRecebido, 0),
    somaSaldoDevedor: cobrancas.reduce((a, c) => a + c.saldoDevedor, 0),
    cobrancas,
  };
}

export type ResultadoMigracao = {
  migradas: number;
  falhas: Array<{ id: number; erro: string }>;
};

export async function runPartialMigration(db: any): Promise<ResultadoMigracao> {
  const legadas = await buscarLegadas(db);
  const falhas: Array<{ id: number; erro: string }> = [];
  let migradas = 0;

  for (const r of legadas) {
    try {
      // `paymentAmount = 0`: o que já foi pago continua sendo o que já foi
      // pago. A função liquida a cobrança pelo valor recebido e gera o saldo
      // devedor com a diferença — a mesma regra dos pagamentos novos.
      await applyPaymentToCharge(
        db,
        r,
        0,
        r.paidDate ? String(r.paidDate).substring(0, 10) : todayInSaoPaulo(),
      );
      migradas++;
    } catch (error) {
      // Uma cobrança que falha não pode impedir as outras: cada uma é
      // independente, e parar no meio deixaria o controle financeiro pela
      // metade — pior que o estado inicial.
      const erro = error instanceof Error ? error.message : String(error);
      console.error(`[migratePartialCharges] Falha na cobrança ${r.id}:`, erro);
      falhas.push({ id: Number(r.id), erro });
    }
  }

  return { migradas, falhas };
}
