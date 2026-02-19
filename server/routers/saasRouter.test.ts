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

describe("saasRouter", () => {
  describe("list", () => {
    it("deve permitir admin acessar lista de mensalidades", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.saas.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.saas.list()).rejects.toThrow("You do not have required permission");
    });
  });

  describe("getInvoiceDashboard", () => {
    it("deve retornar dashboard de inadimplência para admin", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.saas.getInvoiceDashboard();
      
      expect(result).toHaveProperty("totalPending");
      expect(result).toHaveProperty("totalPaid");
      expect(result).toHaveProperty("totalOverdue");
      expect(result).toHaveProperty("pendingCount");
      expect(result).toHaveProperty("paidCount");
      expect(result).toHaveProperty("overdueCount");
      expect(result).toHaveProperty("totalExpected");
      
      expect(typeof result.totalPending).toBe("number");
      expect(typeof result.totalPaid).toBe("number");
      expect(typeof result.totalOverdue).toBe("number");
    });

    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.saas.getInvoiceDashboard()).rejects.toThrow("You do not have required permission");
    });
  });

  describe("getCharges", () => {
    it("deve permitir admin listar cobranças", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.saas.getCharges({ status: "all" });
      expect(Array.isArray(result)).toBe(true);
    });

    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.saas.getCharges({ status: "all" })).rejects.toThrow("You do not have required permission");
    });
  });

  describe("syncWithAsaas", () => {
    it("deve permitir admin sincronizar com Asaas", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.saas.syncWithAsaas();
      
      expect(result).toHaveProperty("syncedCount");
      expect(result).toHaveProperty("errorCount");
      expect(result).toHaveProperty("success");
      expect(result.success).toBe(true);
    });

    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.saas.syncWithAsaas()).rejects.toThrow("You do not have required permission");
    });
  });
});
