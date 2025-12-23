import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AdminUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext } {
  const user: AdminUser = {
    id: 1,
    openId: "admin-test",
    email: "admin@exclusiveclub.com",
    name: "Admin Test",
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

function createUnauthContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("dueDateRequests", () => {
  describe("stats", () => {
    it("retorna estatísticas das solicitações", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const stats = await caller.dueDateRequests.stats();

      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("pending");
      expect(stats).toHaveProperty("approved");
      expect(stats).toHaveProperty("rejected");
      expect(typeof stats.total).toBe("number");
      expect(typeof stats.pending).toBe("number");
      expect(typeof stats.approved).toBe("number");
      expect(typeof stats.rejected).toBe("number");
    });

    it("requer autenticação de admin", async () => {
      const { ctx } = createUnauthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.dueDateRequests.stats()).rejects.toThrow();
    });
  });

  describe("list", () => {
    it("lista todas as solicitações sem filtros", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const requests = await caller.dueDateRequests.list({});

      expect(Array.isArray(requests)).toBe(true);
    });

    it("filtra por status pending", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const requests = await caller.dueDateRequests.list({ status: "pending" });

      expect(Array.isArray(requests)).toBe(true);
      // Se houver resultados, todos devem ter status pending
      requests.forEach((req: any) => {
        if (req.status) {
          expect(req.status).toBe("pending");
        }
      });
    });

    it("filtra por status approved", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const requests = await caller.dueDateRequests.list({ status: "approved" });

      expect(Array.isArray(requests)).toBe(true);
      requests.forEach((req: any) => {
        if (req.status) {
          expect(req.status).toBe("approved");
        }
      });
    });

    it("filtra por status rejected", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const requests = await caller.dueDateRequests.list({ status: "rejected" });

      expect(Array.isArray(requests)).toBe(true);
      requests.forEach((req: any) => {
        if (req.status) {
          expect(req.status).toBe("rejected");
        }
      });
    });

    it("requer autenticação de admin", async () => {
      const { ctx } = createUnauthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.dueDateRequests.list({})).rejects.toThrow();
    });
  });

  describe("approve", () => {
    it("rejeita solicitação inexistente", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.dueDateRequests.approve({ requestId: 999999 })
      ).rejects.toThrow("Solicitação não encontrada");
    });

    it("requer autenticação de admin", async () => {
      const { ctx } = createUnauthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.dueDateRequests.approve({ requestId: 1 })
      ).rejects.toThrow();
    });
  });

  describe("reject", () => {
    it("valida tamanho mínimo do motivo", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.dueDateRequests.reject({ requestId: 1, reason: "curto" })
      ).rejects.toThrow();
    });

    it("rejeita solicitação inexistente", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.dueDateRequests.reject({
          requestId: 999999,
          reason: "Motivo válido com mais de 10 caracteres",
        })
      ).rejects.toThrow("Solicitação não encontrada");
    });

    it("requer autenticação de admin", async () => {
      const { ctx } = createUnauthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.dueDateRequests.reject({
          requestId: 1,
          reason: "Motivo válido com mais de 10 caracteres",
        })
      ).rejects.toThrow();
    });
  });
});
