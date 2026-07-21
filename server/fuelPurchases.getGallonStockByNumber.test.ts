import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

/**
 * Story 12 (Fase 1, DB-03/SYS-12): fuelPurchases.getGallonStockByNumber
 * (endpoint de estoque/preço-por-litro, apesar do nome do router) não tinha
 * NENHUM check de autorização antes desta story — qualquer requisição, mesmo
 * sem autenticação, conseguia ler estoque e preço/L de combustível. Prova
 * que agora exige employee/admin, igual ao resto do fuelBudget/fuelPurchases.
 */
describe("fuelPurchases.getGallonStockByNumber - Story 12 (authz antes ausente)", () => {
  it("rejeita requisição sem autenticação", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.fuelPurchases.getGallonStockByNumber({ gallonNumber: 1 })
    ).rejects.toThrow("Please login");
  });

  it("rejeita cliente comum (role user)", async () => {
    const user: AuthenticatedUser = {
      id: 3,
      openId: "client-user",
      email: "client@example.com",
      name: "Client User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const ctx: TrpcContext = {
      user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.fuelPurchases.getGallonStockByNumber({ gallonNumber: 1 })
    ).rejects.toThrow("Employee access required");
  });

  it("permite employee acessar", async () => {
    const user: AuthenticatedUser = {
      id: 2,
      openId: "employee-user",
      email: "employee@exclusiveclub.com",
      name: "Employee User",
      loginMethod: "manus",
      role: "employee",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const ctx: TrpcContext = {
      user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);

    const result = await caller.fuelPurchases.getGallonStockByNumber({ gallonNumber: 1 });
    expect(result).toHaveProperty("gallonNumber");
    expect(result).toHaveProperty("stockLiters");
  });
});
