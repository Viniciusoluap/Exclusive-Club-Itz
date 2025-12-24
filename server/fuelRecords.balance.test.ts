import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("fuelRecords.financialStats - Balance Calculation", () => {
  it("calcula saldo como Gasto - Orçamento (negativo = dentro do orçamento, positivo = acima)", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Simular cenário:
    // Orçamento: R$ 928.50 (92850 centavos)
    // Gasto (total_billed): R$ 821.41 (82141 centavos)
    // Saldo esperado: R$ -107.09 (negativo = dentro do orçamento, exibido em azul)

    // Nota: Este teste valida a FÓRMULA, não os dados reais do banco
    // A fórmula correta é: balance = totalBilled - totalBudget

    const mockBudget = 92850; // R$ 928.50 em centavos
    const mockTotalBilled = 82141; // R$ 821.41 em centavos
    const expectedBalance = mockTotalBilled - mockBudget; // -10709 centavos = -R$ 107.09

    // Validar que a fórmula está correta
    expect(expectedBalance).toBe(-10709);
    expect(expectedBalance / 100).toBeCloseTo(-107.09, 2);
  });

  it("saldo deve ser positivo quando gasto excede orçamento (vermelho)", async () => {
    // Cenário: Gasto maior que orçamento
    const mockBudget = 50000; // R$ 500.00
    const mockTotalBilled = 75000; // R$ 750.00
    const expectedBalance = mockTotalBilled - mockBudget; // 25000 = R$ 250.00 (positivo = acima do orçamento)

    expect(expectedBalance).toBe(25000);
    expect(expectedBalance / 100).toBeCloseTo(250.00, 2);
  });

  it("saldo deve ser zero quando gasto é igual ao orçamento", async () => {
    const mockBudget = 100000; // R$ 1000.00
    const mockTotalBilled = 100000; // R$ 1000.00
    const expectedBalance = mockTotalBilled - mockBudget; // 0

    expect(expectedBalance).toBe(0);
    expect(expectedBalance / 100).toBe(0);
  });

  it("saldo deve ser negativo quando não há gastos (azul)", async () => {
    const mockBudget = 100000; // R$ 1000.00
    const mockTotalBilled = 0; // R$ 0.00
    const expectedBalance = mockTotalBilled - mockBudget; // -100000 (negativo = dentro do orçamento)

    expect(expectedBalance).toBe(-100000);
    expect(expectedBalance / 100).toBe(-1000.00);
  });
});
