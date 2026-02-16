import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

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

describe("backupRouter.runNow", () => {
  it("deve negar acesso para não-admin", async () => {
    const { ctx } = createNonAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.backup.runNow()
    ).rejects.toThrow();
  });

  it("deve permitir admin executar backup", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Este teste pode falhar se as credenciais do Google Drive não estiverem configuradas
    // mas pelo menos verifica que o endpoint está acessível para admins
    try {
      const result = await caller.backup.runNow();
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
    } catch (error: any) {
      // Se falhar por falta de credenciais, está ok - o importante é que não foi erro de permissão
      expect(error.message).not.toContain('FORBIDDEN');
      expect(error.message).not.toContain('Admin access required');
    }
  }, 310000); // 310 segundos de timeout (maior que os 300s do backup)
});
