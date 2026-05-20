import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ADMIN_OPEN_ID = "admin-test-id";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUserContext(openId: string, email: string, name: string, role: "admin" | "user" | "employee" = "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId,
    email,
    name,
    loginMethod: "credentials",
    role,
    passwordHash: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSignedIn: new Date().toISOString(),
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

describe("Segurança de Acesso Admin", () => {
  it("deve permitir que admin acesse rotas admin", async () => {
    const ctx = createUserContext(ADMIN_OPEN_ID, "owner@example.com", "Owner", "admin");
    const caller = appRouter.createCaller(ctx);

    // Should be able to access admin routes
    const clients = await caller.allowedClients.list();
    expect(clients).toBeDefined();
    expect(Array.isArray(clients)).toBe(true);

    const vessels = await caller.vessels.listAll();
    expect(vessels).toBeDefined();
    expect(Array.isArray(vessels)).toBe(true);

    const bookings = await caller.bookings.listAll();
    expect(bookings).toBeDefined();
    expect(Array.isArray(bookings)).toBe(true);
  });

  it("deve bloquear usuário comum de acessar rotas admin", async () => {
    // Create context with non-owner openId
    const ctx = createUserContext("regular-user-id", "user@example.com", "Regular User");
    const caller = appRouter.createCaller(ctx);

    // Should NOT be able to access admin routes
    await expect(caller.allowedClients.list()).rejects.toThrow("Admin access required");
    await expect(caller.vessels.listAll()).rejects.toThrow();
    await expect(caller.bookings.listAll()).rejects.toThrow();
  });

  it("deve bloquear criação de cliente por usuário comum", async () => {
    const ctx = createUserContext("regular-user-id", "user@example.com", "Regular User");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.allowedClients.create({
        email: "test@example.com",
        name: "Test",
        phone: "+55 99999999999",
        quotas: [],
      })
    ).rejects.toThrow();
  });

  it("deve bloquear modificação de embarcações por usuário comum", async () => {
    const ctx = createUserContext("regular-user-id", "user@example.com", "Regular User");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.vessels.create({
        name: "Test Vessel",
        type: "lancha",
        description: "Test",
      })
    ).rejects.toThrow();
  });

  it("deve permitir que admin crie clientes", async () => {
    const ctx = createUserContext(ADMIN_OPEN_ID, "owner@example.com", "Owner", "admin");
    const caller = appRouter.createCaller(ctx);

    const testEmail = `test-owner-create-${Date.now()}@example.com`;
    const result = await caller.allowedClients.create({
      email: testEmail,
      name: "Test Owner Create",
      phone: "+55 99999999999",
      quotas: [],
    });

    expect(result.success).toBe(true);
  });

  it("deve verificar que role é atribuído corretamente", () => {
    const adminCtx = createUserContext(ADMIN_OPEN_ID, "owner@example.com", "Owner", "admin");
    expect(adminCtx.user?.role).toBe("admin");

    const userCtx = createUserContext("other-id", "user@example.com", "User", "user");
    expect(userCtx.user?.role).toBe("user");
  });
});
