/**
 * As faixas de valor barram de verdade na entrada (Story 36 / DB-08, 2ª fatia).
 *
 * A 1ª fatia mediu que o banco está limpo hoje. Estes testes cobram que ele
 * continue: cada caminho que escreve dinheiro recusa valor impossível ANTES de
 * chegar ao banco.
 *
 * O caso que mais importa é `registerPartialPayment`: o valor ali é ACUMULADO
 * em `amount_paid`. Um negativo subtrai do que já foi pago — o saldo devedor
 * passa a mentir e nada na tela acusa. É o mesmo padrão de toda esta auditoria:
 * a operação "deu certo" e o número ficou errado.
 */

import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { naoNegativo, positivo, percentual } from "../_core/valoresDeEntrada";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function contextoAdmin(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-valores",
    email: "admin@exclusiveclub.com",
    name: "Admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("guardas de faixa de valor", () => {
  it("aceita zero onde zero é legítimo e recusa negativo", () => {
    expect(naoNegativo("Saldo").safeParse(0).success).toBe(true);
    expect(naoNegativo("Saldo").safeParse(10).success).toBe(true);
    expect(naoNegativo("Saldo").safeParse(-1).success).toBe(false);
  });

  it("recusa zero onde zero não é movimentação", () => {
    expect(positivo("Pagamento").safeParse(0).success).toBe(false);
    expect(positivo("Pagamento").safeParse(-5).success).toBe(false);
    expect(positivo("Pagamento").safeParse(0.01).success).toBe(true);
  });

  it("percentual fica entre 0 e 100", () => {
    expect(percentual("Progresso").safeParse(0).success).toBe(true);
    expect(percentual("Progresso").safeParse(100).success).toBe(true);
    expect(percentual("Progresso").safeParse(101).success).toBe(false);
    expect(percentual("Progresso").safeParse(-1).success).toBe(false);
  });

  it("a mensagem diz o que está errado, em português", () => {
    const erro = positivo("Valor recebido").safeParse(-1);
    expect(erro.success).toBe(false);
    if (!erro.success) {
      expect(erro.error.issues[0].message).toBe("Valor recebido precisa ser maior que zero");
    }
  });
});

describe("pagamento parcial recusa valor impossível", () => {
  const chamar = () => appRouter.createCaller(contextoAdmin());

  it("valor negativo é recusado", async () => {
    await expect(
      chamar().bpo.registerPartialPayment({ chargeId: 1, value: -100 }),
    ).rejects.toThrow(/maior que zero/i);
  });

  it("valor zero é recusado", async () => {
    await expect(
      chamar().bpo.registerPartialPayment({ chargeId: 1, value: 0 }),
    ).rejects.toThrow(/maior que zero/i);
  });

  /**
   * A contraprova. Sem ela, um guarda que recusasse TUDO passaria nos dois
   * testes acima e ninguém perceberia — até o clube não conseguir mais dar
   * baixa em pagamento nenhum.
   */
  it("valor positivo PASSA pela validação (falha adiante, por outro motivo)", async () => {
    const resultado = await chamar()
      .bpo.registerPartialPayment({ chargeId: 999999, value: 100 })
      .then(() => null)
      .catch((e: Error) => e);

    expect(resultado).toBeInstanceOf(Error);
    // Chegou ao resolver: o erro é de cobrança inexistente, não de faixa.
    expect((resultado as Error).message).not.toMatch(/maior que zero/i);
  });
});

describe("os outros caminhos de dinheiro também barram", () => {
  const chamar = () => appRouter.createCaller(contextoAdmin());

  it("markAsPaid recusa valor negativo", async () => {
    await expect(
      chamar().bpo.markAsPaid({ chargeId: 1, value: -50 }),
    ).rejects.toThrow(/maior que zero/i);
  });

  it("updateFromWebhook recusa valor negativo vindo do Asaas", async () => {
    await expect(
      chamar().bpo.updateFromWebhook({
        asaasChargeId: "pay_x",
        status: "RECEIVED",
        value: -10,
      }),
    ).rejects.toThrow(/não pode ser negativo/i);
  });

  it("rateio de PIX recusa parcela negativa", async () => {
    await expect(
      chamar().bpo.splitPayment({
        pixValue: 100,
        splits: [{ chargeId: 1, amount: -100 }],
      }),
    ).rejects.toThrow(/maior que zero/i);
  });
});
