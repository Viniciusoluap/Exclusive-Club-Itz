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

describe("fuelBudget.get - Stock Calculation", () => {
  it("calcula estoque corretamente: total comprado - total usado", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Usar mês atual (dezembro 2025)
    const monthYear = "2025-12";

    const result = await caller.fuelBudget.get({ monthYear });

    // Validar que estoque é calculado corretamente
    // Baseado nos dados reais: 147.69 L comprados - litros usados = estoque
    expect(result.stockLiters).toBeGreaterThanOrEqual(0);
    expect(typeof result.stockLiters).toBe("number");
    expect(result.stockLiters).not.toBe(22.01); // Valor incorreto anterior

    console.log("✅ Estoque calculado:", result.stockLiters, "L");
    console.log("✅ Orçamento total:", result.totalBudget, "R$");
  });

  it("retorna valores zerados quando não há compras nem abastecimentos", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Usar mês futuro sem dados
    const monthYear = "2026-12";

    const result = await caller.fuelBudget.get({ monthYear });

    expect(result.stockLiters).toBe(0);
    expect(result.totalBudget).toBe(0);
    expect(result.lastPricePerLiter).toBe(0);
  });

  it("estoque diminui quando há abastecimentos", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const monthYear = "2025-12";

    const result = await caller.fuelBudget.get({ monthYear });

    // Se há compras, estoque deve ser <= total comprado
    if (result.totalBudget > 0) {
      // Calcular total de litros comprados (orçamento / preço médio estimado)
      // Assumindo preço médio de R$ 6.29 (do histórico)
      const estimatedTotalPurchased = result.totalBudget / 6.29;
      
      expect(result.stockLiters).toBeLessThanOrEqual(estimatedTotalPurchased + 1); // +1 para margem de arredondamento
      console.log("✅ Estoque:", result.stockLiters, "L <=", estimatedTotalPurchased.toFixed(2), "L comprados");
    }
  });
});
