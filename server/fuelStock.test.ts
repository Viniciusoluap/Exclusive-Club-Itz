import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext } {
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

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("Sistema de Estoque de Gasolina", () => {
  const monthYear = "2025-12";

  describe("fuelPurchases.create", () => {
    it("deve registrar compra de gasolina e calcular preço/L automaticamente", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      // Registrar compra: 100L por R$ 650,00
      const result = await caller.fuelPurchases.create({
        monthYear,
        liters: 100,
        amountPaid: 650,
        notes: "Teste de compra",
      });

      expect(result).toEqual({ success: true });

      // Verificar se o orçamento foi atualizado com estoque e preço
      const budget = await caller.fuelBudget.get({ monthYear });
      
      // Preço/L = 650 / 100 = 6.50
      expect(budget.lastPricePerLiter).toBe(6.50);
      
      // Estoque deve ter aumentado em 100L
      expect(budget.stockLiters).toBeGreaterThanOrEqual(100);
    });

    it("deve calcular preço/L corretamente com valores decimais", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      // Registrar compra: 50.50L por R$ 328.25
      await caller.fuelPurchases.create({
        monthYear,
        liters: 50.50,
        amountPaid: 328.25,
        notes: "Teste com decimais",
      });

      const budget = await caller.fuelBudget.get({ monthYear });
      
      // Preço/L = 328.25 / 50.50 = 6.50
      expect(budget.lastPricePerLiter).toBeCloseTo(6.50, 2);
    });
  });

  describe("fuelPurchases.list", () => {
    it("deve listar compras do mês corretamente", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      // Registrar uma compra
      await caller.fuelPurchases.create({
        monthYear,
        liters: 75,
        amountPaid: 487.50,
        notes: "Compra para teste de listagem",
      });

      // Listar compras
      const purchases = await caller.fuelPurchases.list({ monthYear });

      expect(Array.isArray(purchases)).toBe(true);
      
      // Verificar se a compra está na lista
      const testPurchase = purchases.find((p: any) => p.notes === "Compra para teste de listagem");
      expect(testPurchase).toBeDefined();
      
      if (testPurchase) {
        expect(testPurchase.litersPurchased).toBe(75);
        expect(testPurchase.amountPaid).toBe(487.50);
        expect(testPurchase.pricePerLiter).toBeCloseTo(6.50, 2);
      }
    });
  });

  describe("fuelPurchases.delete", () => {
    it("deve excluir compra e devolver litros ao estoque", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      // Buscar estoque inicial
      const budgetBefore = await caller.fuelBudget.get({ monthYear });
      const stockBefore = budgetBefore.stockLiters || 0;

      // Registrar compra
      await caller.fuelPurchases.create({
        monthYear,
        liters: 30,
        amountPaid: 195,
        notes: "Compra para teste de exclusão",
      });

      // Verificar que estoque aumentou
      const budgetAfterCreate = await caller.fuelBudget.get({ monthYear });
      expect(budgetAfterCreate.stockLiters).toBeCloseTo(stockBefore + 30, 1);

      // Buscar ID da compra
      const purchases = await caller.fuelPurchases.list({ monthYear });
      const testPurchase = purchases.find((p: any) => p.notes === "Compra para teste de exclusão");
      
      if (testPurchase) {
        // Excluir compra
        await caller.fuelPurchases.delete({ purchaseId: testPurchase.id });

        // Verificar que estoque voltou ao valor anterior
        const budgetAfterDelete = await caller.fuelBudget.get({ monthYear });
        expect(budgetAfterDelete.stockLiters).toBeCloseTo(stockBefore, 1);
      }
    });
  });

  describe("fuelBudget.get", () => {
    it("deve retornar stockLiters e lastPricePerLiter", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const budget = await caller.fuelBudget.get({ monthYear });

      // Verificar que os novos campos existem
      expect(budget).toHaveProperty("stockLiters");
      expect(budget).toHaveProperty("lastPricePerLiter");
      expect(typeof budget.stockLiters).toBe("number");
      expect(typeof budget.lastPricePerLiter).toBe("number");
    });

    it("deve retornar valores zerados quando não há orçamento", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      // Usar mês futuro que não tem dados
      const futureBudget = await caller.fuelBudget.get({ monthYear: "2030-01" });

      expect(futureBudget.stockLiters).toBe(0);
      expect(futureBudget.lastPricePerLiter).toBe(0);
      expect(futureBudget.totalBudget).toBe(0);
    });
  });

  describe("Integração: Fluxo Completo", () => {
    it("deve executar fluxo completo: compra → estoque → preço/L", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);
      const testMonthYear = "2026-01"; // Usar mês futuro para evitar conflitos

      // 1. Verificar estoque inicial (deve ser zero)
      const initialBudget = await caller.fuelBudget.get({ monthYear: testMonthYear });
      expect(initialBudget.stockLiters).toBe(0);
      expect(initialBudget.lastPricePerLiter).toBe(0);

      // 2. Registrar primeira compra: 100L por R$ 650
      await caller.fuelPurchases.create({
        monthYear: testMonthYear,
        liters: 100,
        amountPaid: 650,
        notes: "Primeira compra",
      });

      // 3. Verificar estoque e preço atualizados
      const afterFirstPurchase = await caller.fuelBudget.get({ monthYear: testMonthYear });
      expect(afterFirstPurchase.stockLiters).toBeCloseTo(100, 1);
      expect(afterFirstPurchase.lastPricePerLiter).toBeCloseTo(6.50, 2);

      // 4. Registrar segunda compra: 50L por R$ 325
      await caller.fuelPurchases.create({
        monthYear: testMonthYear,
        liters: 50,
        amountPaid: 325,
        notes: "Segunda compra",
      });

      // 5. Verificar estoque acumulado e preço atualizado
      const afterSecondPurchase = await caller.fuelBudget.get({ monthYear: testMonthYear });
      expect(afterSecondPurchase.stockLiters).toBeCloseTo(150, 1); // 100 + 50
      expect(afterSecondPurchase.lastPricePerLiter).toBeCloseTo(6.50, 2); // Último preço

      // 6. Listar compras
      const purchases = await caller.fuelPurchases.list({ monthYear: testMonthYear });
      expect(purchases.length).toBeGreaterThanOrEqual(2);

      // 7. Verificar cálculos de cada compra
      const firstPurchase = purchases.find((p: any) => p.notes === "Primeira compra");
      const secondPurchase = purchases.find((p: any) => p.notes === "Segunda compra");

      expect(firstPurchase?.pricePerLiter).toBeCloseTo(6.50, 2);
      expect(secondPurchase?.pricePerLiter).toBeCloseTo(6.50, 2);
    });
  });
});
