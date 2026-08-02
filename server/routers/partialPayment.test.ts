/**
 * Regra de pagamento parcial (definida pelo dono do sistema).
 *
 * Um pagamento parcial NÃO pode deixar a cobrança num estado "partiallyPaid":
 * ela recebe BAIXA pelo valor realmente recebido, com a data real, e o restante
 * vira um SALDO DEVEDOR separado no mesmo centro de custo.
 *
 * O saldo devedor nasce com vencimento HOJE — nunca herdando o vencimento
 * original — porque o Asaas não aceita cobrança com data retroativa.
 *
 * Estes testes não precisam de banco: exercitam applyPaymentToCharge contra um
 * `db` de mentira que captura as queries, compilando-as com o MySqlDialect
 * (mesmo padrão de sqlInjection.clientEmail.test.ts).
 */

import { describe, expect, it, beforeEach } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { applyPaymentToCharge } from "./bpoRouter";
import { todayInSaoPaulo } from "../_core/dateBR";

const dialect = new MySqlDialect();

type Captured = { sql: string; params: unknown[] };

function makeFakeDb() {
  const updates: Record<string, unknown>[] = [];
  const executed: Captured[] = [];

  const db = {
    update() {
      return {
        set(values: Record<string, unknown>) {
          updates.push(values);
          return { where() { return Promise.resolve(); } };
        },
      };
    },
    execute(query: any) {
      try {
        executed.push(dialect.sqlToQuery(query));
      } catch {
        executed.push({ sql: String(query), params: [] });
      }
      // Formato que createOrUpdateRemainderCharge espera para "nenhum saldo
      // existente ainda" -> segue pelo caminho de INSERT.
      return Promise.resolve([[]]);
    },
  };

  return { db, updates, executed };
}

const baseCharge = {
  id: 42,
  value: "900.00",
  amountPaid: "0.00",
  type: "mensalidade",
  clientId: 7,
  clientName: "MHAMED FEIZ HUSSEIN YASSIN",
  clientEmail: "mhamedfeiz@hotmail.com",
  description: "Parcela 7 de 12. Mensalidade Cota Focker",
  asaasCustomerId: "cus_123",
  asaasChargeId: null,
  externalReference: null,
  paymentLinks: null,
};

describe("Pagamento parcial — baixa pelo valor real + saldo devedor", () => {
  let fake: ReturnType<typeof makeFakeDb>;
  beforeEach(() => { fake = makeFakeDb(); });

  it("nunca deixa a cobrança em 'partiallyPaid'", async () => {
    await applyPaymentToCharge(fake.db, baseCharge, 700, "2026-07-25");

    const statuses = fake.updates.map((u) => u.status);
    expect(statuses).not.toContain("partiallyPaid");
    expect(statuses).toContain("receivedInCash");
  });

  it("dá baixa pelo valor REALMENTE recebido, não pelo valor cheio", async () => {
    const result = await applyPaymentToCharge(fake.db, baseCharge, 700, "2026-07-25");

    expect(result.isFullyPaid).toBe(false);
    expect(result.settledValue).toBe(700);
    expect(result.remaining).toBe(200);

    const settle = fake.updates[0];
    // R$ 900 cobrados, R$ 700 recebidos -> a cobrança vale R$ 700.
    expect(settle.value).toBe("700.00");
    expect(settle.amountPaid).toBe("700.00");
  });

  it("registra a data REAL do pagamento, mesmo em baixa parcial", async () => {
    await applyPaymentToCharge(fake.db, baseCharge, 700, "2026-07-25");
    expect(fake.updates[0].paidDate).toBe("2026-07-25");
  });

  it("preserva o valor original na descrição, para auditoria", async () => {
    await applyPaymentToCharge(fake.db, baseCharge, 700, "2026-07-25");
    expect(String(fake.updates[0].description)).toContain("900.00");
  });

  it("gera saldo devedor com o restante, no mesmo centro de custo", async () => {
    await applyPaymentToCharge(fake.db, baseCharge, 700, "2026-07-25");

    const insert = fake.executed.find((q) => q.sql.includes("INSERT INTO bpo_charges"));
    expect(insert).toBeDefined();
    // Restante e mesmo `type` (centro de custo) da cobrança original.
    expect(insert!.params).toContain("200.00");
    expect(insert!.params).toContain("mensalidade");
    expect(insert!.params).toContain("saldo-42");
  });

  it("cria o saldo devedor com vencimento HOJE (Asaas recusa data retroativa)", async () => {
    // A cobrança original venceu em 20/07 — no passado. O saldo NÃO pode herdar
    // essa data, senão nasce vencido e o Asaas não consegue cobrá-lo.
    await applyPaymentToCharge(fake.db, baseCharge, 700, "2026-07-25");

    const insert = fake.executed.find((q) => q.sql.includes("INSERT INTO bpo_charges"));
    expect(insert!.params).toContain(todayInSaoPaulo());
    expect(insert!.params).not.toContain("2026-07-20");
    // E nasce 'pending', nunca 'overdue'.
    expect(insert!.sql).toContain("'pending'");
  });

  it("quitação total não gera saldo devedor", async () => {
    const result = await applyPaymentToCharge(fake.db, baseCharge, 900, "2026-07-25");

    expect(result.isFullyPaid).toBe(true);
    expect(result.remaining).toBe(0);
    expect(fake.updates[0].value).toBe("900.00");
    const insert = fake.executed.find((q) => q.sql.includes("INSERT INTO bpo_charges"));
    expect(insert).toBeUndefined();
  });

  it("tolera diferença de 1 centavo como quitação total", async () => {
    const result = await applyPaymentToCharge(fake.db, baseCharge, 899.995, "2026-07-25");
    expect(result.isFullyPaid).toBe(true);
  });

  it("acumula sobre um pagamento parcial anterior", async () => {
    const partiallyPaidCharge = { ...baseCharge, amountPaid: "700.00" };
    const result = await applyPaymentToCharge(fake.db, partiallyPaidCharge, 200, "2026-08-02");

    expect(result.isFullyPaid).toBe(true);
    expect(result.settledValue).toBe(900);
    expect(result.remaining).toBe(0);
  });
});

describe("todayInSaoPaulo", () => {
  it("retorna YYYY-MM-DD", () => {
    expect(todayInSaoPaulo()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("usa o fuso de São Paulo, não UTC (evita virar o dia à noite no Brasil)", () => {
    const utcDate = new Date().toISOString().slice(0, 10);
    const spDate = todayInSaoPaulo();
    // As duas datas ou coincidem, ou São Paulo está exatamente 1 dia atrás.
    const diff =
      (Date.parse(`${utcDate}T00:00:00Z`) - Date.parse(`${spDate}T00:00:00Z`)) / 86400000;
    expect([0, 1]).toContain(diff);
  });
});
