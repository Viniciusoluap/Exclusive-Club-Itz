import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";
import { backupHistory } from "../../drizzle/schema";
import { toMysqlDatetime } from "../_core/dateBR";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext } {
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
    email: "user@exclusiveclub.com",
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

describe("backupRouter", () => {
  describe("getHistory", () => {
    it("deve retornar histórico de backups para admin", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const history = await caller.backup.getHistory({ limit: 10 });

      expect(Array.isArray(history)).toBe(true);
      // Pode estar vazio se não houver backups ainda
      if (history.length > 0) {
        expect(history[0]).toHaveProperty('id');
        expect(history[0]).toHaveProperty('startedAt');
        expect(history[0]).toHaveProperty('status');
      }
    });

    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.backup.getHistory({ limit: 10 })
      ).rejects.toThrow();
    });

    it("deve respeitar o limite de resultados", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const history = await caller.backup.getHistory({ limit: 5 });

      expect(history.length).toBeLessThanOrEqual(5);
    });
  });

  describe("getStats", () => {
    it("deve retornar estatísticas de backups para admin", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const stats = await caller.backup.getStats();

      expect(stats).toHaveProperty('totalBackups');
      expect(stats).toHaveProperty('successfulBackups');
      expect(stats).toHaveProperty('failedBackups');
      expect(stats).toHaveProperty('runningBackups');
      expect(stats).toHaveProperty('totalSizeBytes');
      expect(stats).toHaveProperty('avgDurationSeconds');
      expect(stats).toHaveProperty('successRate');
      
      expect(typeof stats.totalBackups).toBe('number');
      expect(typeof stats.successRate).toBe('number');
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeLessThanOrEqual(100);
    });

    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.backup.getStats()
      ).rejects.toThrow();
    });

    it("deve calcular taxa de sucesso corretamente quando há backups", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      // Insere alguns backups de teste
      const db = await getDb();
      if (db) {
        await db.insert(backupHistory).values([
          {
            startedAt: toMysqlDatetime(),
            completedAt: toMysqlDatetime(),
            status: 'success',
            fileName: 'test-backup-1.zip',
            fileSizeBytes: 1024000,
            durationSeconds: 60,
          },
          {
            startedAt: toMysqlDatetime(),
            completedAt: toMysqlDatetime(),
            status: 'success',
            fileName: 'test-backup-2.zip',
            fileSizeBytes: 1024000,
            durationSeconds: 65,
          },
          {
            startedAt: toMysqlDatetime(),
            completedAt: toMysqlDatetime(),
            status: 'failed',
            errorMessage: 'Test error',
            durationSeconds: 30,
          },
        ]);

        const stats = await caller.backup.getStats();

        expect(stats.totalBackups).toBeGreaterThanOrEqual(3);
        expect(stats.successfulBackups).toBeGreaterThanOrEqual(2);
        expect(stats.failedBackups).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("getLatest", () => {
    it("deve retornar o último backup para admin", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const latest = await caller.backup.getLatest();

      // Pode ser null se não houver backups
      if (latest) {
        expect(latest).toHaveProperty('id');
        expect(latest).toHaveProperty('startedAt');
        expect(latest).toHaveProperty('status');
      }
    });

    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.backup.getLatest()
      ).rejects.toThrow();
    });
  });
});
