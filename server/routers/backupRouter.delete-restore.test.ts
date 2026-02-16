import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

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

function createNonAdminContext(): TrpcContext {
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

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("backup.deleteBackup", () => {
  it("deve negar acesso para não-admin", async () => {
    const ctx = createNonAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.backup.deleteBackup({ backupId: 1 })
    ).rejects.toThrow();
  });

  it("deve retornar erro se backup não existe", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.backup.deleteBackup({ backupId: 999999 })
    ).rejects.toThrow("Backup não encontrado");
  });
});

describe("backup.restoreBackup", () => {
  it("deve negar acesso para não-admin", async () => {
    const ctx = createNonAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.backup.restoreBackup({ backupId: 1 })
    ).rejects.toThrow();
  });

  it("deve retornar erro se backup não existe", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.backup.restoreBackup({ backupId: 999999 })
    ).rejects.toThrow("Backup não encontrado");
  });
});
