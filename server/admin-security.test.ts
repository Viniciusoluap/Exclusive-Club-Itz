import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUserContext(openId: string, email: string, name: string): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId,
    email,
    name,
    loginMethod: "manus",
    role: openId === ENV.ownerOpenId ? "admin" : "user",
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
  it("deve permitir que owner acesse rotas admin", async () => {
    // Create context with owner's openId
    const ctx = createUserContext(ENV.ownerOpenId, "owner@example.com", "Owner");
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
    await expect(caller.allowedClients.list()).rejects.toThrow("You do not have required permission");
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

  it("deve permitir que owner crie clientes", async () => {
    const ctx = createUserContext(ENV.ownerOpenId, "owner@example.com", "Owner");
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

  it("deve verificar que role é atribuído corretamente baseado em ownerOpenId", () => {
    // Owner context
    const ownerCtx = createUserContext(ENV.ownerOpenId, "owner@example.com", "Owner");
    expect(ownerCtx.user?.role).toBe("admin");

    // Regular user context
    const userCtx = createUserContext("other-id", "user@example.com", "User");
    expect(userCtx.user?.role).toBe("user");
  });
});
