import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

function createNonAdminContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("reportsRouter", () => {
  describe("financial", () => {
    it("deve retornar relatório financeiro para admin", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];

      const result = await caller.reports.financial({ startDate, endDate });

      expect(result).toHaveProperty("totalRevenue");
      expect(result).toHaveProperty("avgTicket");
      expect(result).toHaveProperty("revenueByVessel");
      expect(result).toHaveProperty("revenueByQuotaType");
      expect(result).toHaveProperty("defaultRate");
      expect(result).toHaveProperty("maintenanceVsRevenue");
      expect(result).toHaveProperty("fuelVsRevenue");
      expect(result).toHaveProperty("projections");
      expect(result).toHaveProperty("monthlyRevenue");
      expect(result).toHaveProperty("clientLTV");

      expect(typeof result.totalRevenue).toBe("number");
      expect(typeof result.avgTicket).toBe("number");
      expect(Array.isArray(result.revenueByVessel)).toBe(true);
      expect(result.revenueByQuotaType).toHaveProperty("full");
      expect(result.revenueByQuotaType).toHaveProperty("half");
      expect(result.projections).toHaveProperty("days30");
      expect(result.projections).toHaveProperty("days60");
      expect(result.projections).toHaveProperty("days90");
    });

    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];

      await expect(caller.reports.financial({ startDate, endDate })).rejects.toThrow("You do not have required permission");
    });
  });

  describe("executive", () => {
    it("deve retornar dashboard executivo para admin", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.reports.executive();

      expect(result).toHaveProperty("alerts");
      expect(result).toHaveProperty("score");
      expect(result).toHaveProperty("scoreLabel");

      expect(Array.isArray(result.alerts)).toBe(true);
      expect(typeof result.score).toBe("number");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(typeof result.scoreLabel).toBe("string");
    });

    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.reports.executive()).rejects.toThrow("You do not have required permission");
    });
  });
});
