import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createEmployeeContext(): TrpcContext {
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

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@exclusiveclub.com",
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

function createClientContext(): TrpcContext {
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

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("fuelBudget.get - Employee Access", () => {
  it("should allow employee to access fuel budget data", async () => {
    const ctx = createEmployeeContext();
    const caller = appRouter.createCaller(ctx);

    const currentDate = new Date();
    const monthYear = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    // Não deve lançar erro de autorização
    const result = await caller.fuelBudget.get({ monthYear });

    expect(result).toBeDefined();
    expect(result).toHaveProperty("monthYear");
    expect(result).toHaveProperty("lastPricePerLiter");
    expect(result).toHaveProperty("stockLiters");
    expect(result).toHaveProperty("totalBudget");
    expect(result).toHaveProperty("totalSpent");
    expect(result).toHaveProperty("totalReceived");
  });

  it("should allow admin to access fuel budget data", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const currentDate = new Date();
    const monthYear = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    const result = await caller.fuelBudget.get({ monthYear });

    expect(result).toBeDefined();
    expect(result).toHaveProperty("monthYear");
    expect(result).toHaveProperty("lastPricePerLiter");
  });

  it("should deny access to regular clients", async () => {
    const ctx = createClientContext();
    const caller = appRouter.createCaller(ctx);

    const currentDate = new Date();
    const monthYear = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    await expect(
      caller.fuelBudget.get({ monthYear })
    ).rejects.toThrow("Acesso negado");
  });

  it("should return lastPricePerLiter as a number", async () => {
    const ctx = createEmployeeContext();
    const caller = appRouter.createCaller(ctx);

    const currentDate = new Date();
    const monthYear = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    const result = await caller.fuelBudget.get({ monthYear });

    expect(typeof result.lastPricePerLiter).toBe("number");
    expect(result.lastPricePerLiter).toBeGreaterThanOrEqual(0);
  });

  it("should return correct monthYear format", async () => {
    const ctx = createEmployeeContext();
    const caller = appRouter.createCaller(ctx);

    const testMonthYear = "2025-12";
    const result = await caller.fuelBudget.get({ monthYear: testMonthYear });

    expect(result.monthYear).toBe(testMonthYear);
  });
});
