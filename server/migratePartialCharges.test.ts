/**
 * A migração das cobranças parciais mexe em dinheiro.
 *
 * O QUE ESTÁ EM JOGO: enquanto a cobrança fica `partiallyPaid`, ela soma o
 * valor ORIGINAL em "Total Cobrado" e o saldo devedor soma o restante — o mesmo
 * dinheiro contado duas vezes. Estes testes fixam a identidade que precisa
 * valer depois da migração:
 *
 *     Total Cobrado = Recebido + Saldo devedor
 *
 * E fixam o que NÃO pode acontecer: migrar um saldo devedor (gerando saldo de
 * saldo, numa cascata sem fim) e uma falha isolada parando o lote inteiro.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const applyPaymentToCharge = vi.fn();

vi.mock("./routers/bpoRouter", () => ({
  applyPaymentToCharge: (...args: any[]) => applyPaymentToCharge(...args),
}));

const { previewPartialMigration, runPartialMigration } = await import("./migratePartialCharges");

/** db falso que devolve as linhas legadas informadas. */
function fakeDb(linhas: any[]) {
  const consultas: string[] = [];
  return {
    consultas,
    async execute(statement: any) {
      const texto = (statement?.queryChunks ?? [])
        .map((c: any) => (Array.isArray(c?.value) ? c.value.join("") : String(c?.value ?? "")))
        .join(" ");
      consultas.push(texto);
      return [linhas];
    },
  };
}

const PARCIAL = {
  id: 10,
  value: "1000.00",
  amountPaid: "400.00",
  paidDate: "2026-07-15",
  type: "monthly",
  clientId: 5,
  clientName: "Ana Souza",
  clientEmail: "ana@exemplo.com",
  description: "Mensalidade julho",
  asaasCustomerId: "cus_1",
  asaasChargeId: "pay_1",
  externalReference: null,
  paymentLinks: null,
};

beforeEach(() => {
  applyPaymentToCharge.mockReset();
  applyPaymentToCharge.mockResolvedValue({ isFullyPaid: false, settledValue: 400, remaining: 600 });
});

describe("prévia da migração", () => {
  it("mostra valor original, recebido e saldo devedor de cada cobrança", async () => {
    const p = await previewPartialMigration(fakeDb([PARCIAL]) as any);

    expect(p.total).toBe(1);
    expect(p.cobrancas[0]).toMatchObject({
      id: 10,
      cliente: "Ana Souza",
      valorOriginal: 1000,
      valorRecebido: 400,
      saldoDevedor: 600,
      dataPagamento: "2026-07-15",
    });
  });

  it("as somas fecham: original = recebido + saldo devedor", async () => {
    // É esta identidade que estava quebrada e inflava o faturamento.
    const p = await previewPartialMigration(
      fakeDb([
        PARCIAL,
        { ...PARCIAL, id: 11, value: "500.00", amountPaid: "125.50" },
      ]) as any,
    );

    expect(p.somaOriginal).toBeCloseTo(1500, 2);
    expect(p.somaRecebida).toBeCloseTo(525.5, 2);
    expect(p.somaSaldoDevedor).toBeCloseTo(974.5, 2);
    expect(p.somaRecebida + p.somaSaldoDevedor).toBeCloseTo(p.somaOriginal, 2);
  });

  it("a prévia NÃO altera nada", async () => {
    const db = fakeDb([PARCIAL]);
    await previewPartialMigration(db as any);

    expect(db.consultas.every((c) => !/UPDATE|INSERT|DELETE/i.test(c))).toBe(true);
    expect(applyPaymentToCharge).not.toHaveBeenCalled();
  });

  it("cai para a data de hoje quando a cobrança não tem data de pagamento", async () => {
    const p = await previewPartialMigration(fakeDb([{ ...PARCIAL, paidDate: null }]) as any);
    expect(p.cobrancas[0].dataPagamento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("execução da migração", () => {
  it("reusa a regra dos pagamentos novos, com paymentAmount = 0", async () => {
    // Passar 0 é o ponto: o que já foi pago continua sendo o que já foi pago.
    // Qualquer outro valor somaria em cima do amountPaid existente e liquidaria
    // a cobrança por um valor que ninguém recebeu.
    const r = await runPartialMigration(fakeDb([PARCIAL]) as any);

    expect(r.migradas).toBe(1);
    expect(applyPaymentToCharge).toHaveBeenCalledTimes(1);

    const [, cobranca, valor, data] = applyPaymentToCharge.mock.calls[0];
    expect(valor).toBe(0);
    expect(data).toBe("2026-07-15");
    expect(cobranca.id).toBe(10);
  });

  it("não migra cobranças que são elas mesmas um saldo devedor", async () => {
    // Migrar um saldo devedor geraria saldo de saldo, sem fim. A exclusão está
    // no SQL; aqui se confirma que ela continua na consulta.
    const db = fakeDb([]);
    await runPartialMigration(db as any);

    expect(db.consultas.join(" ")).toContain("NOT LIKE 'saldo-%'");
  });

  it("uma cobrança que falha não interrompe as outras", async () => {
    // Parar no meio deixaria o controle financeiro pela metade — pior que o
    // estado inicial, porque parte das contas mudou e parte não.
    applyPaymentToCharge
      .mockRejectedValueOnce(new Error("Asaas fora do ar"))
      .mockResolvedValueOnce({ isFullyPaid: false, settledValue: 100, remaining: 50 });

    const r = await runPartialMigration(
      fakeDb([PARCIAL, { ...PARCIAL, id: 11 }]) as any,
    );

    expect(r.migradas).toBe(1);
    expect(r.falhas).toEqual([{ id: 10, erro: "Asaas fora do ar" }]);
  });

  it("sem cobranças legadas, não faz nada", async () => {
    const r = await runPartialMigration(fakeDb([]) as any);

    expect(r.migradas).toBe(0);
    expect(r.falhas).toEqual([]);
    expect(applyPaymentToCharge).not.toHaveBeenCalled();
  });
});
