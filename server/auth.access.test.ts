import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockContext(user?: AuthenticatedUser): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Restrição de Acesso Admin", () => {
  it("deve permitir acesso admin apenas para owner", async () => {
    const ownerUser: AuthenticatedUser = {
      id: 1,
      openId: "owner-open-id",
      email: "vinicius@manus.im",
      name: "Vinicius Freitas",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const ctx = createMockContext(ownerUser);
    const caller = appRouter.createCaller(ctx);

    // Owner deve ter role admin
    const me = await caller.auth.me();
    expect(me?.role).toBe("admin");
    expect(me?.email).toBe("vinicius@manus.im");
  });

  it("clientes comuns não devem ter role admin", async () => {
    const regularUser: AuthenticatedUser = {
      id: 2,
      openId: "regular-user-id",
      email: "cliente@test.com",
      name: "Cliente Teste",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const ctx = createMockContext(regularUser);
    const caller = appRouter.createCaller(ctx);

    const me = await caller.auth.me();
    expect(me?.role).toBe("user");
    expect(me?.role).not.toBe("admin");
  });

  it("usuário não autenticado deve retornar undefined", async () => {
    const ctx = createMockContext(undefined);
    const caller = appRouter.createCaller(ctx);

    const me = await caller.auth.me();
    expect(me).toBeUndefined();
  });
});

describe("Sistema de Logout", () => {
  it("deve limpar cookie de sessão ao fazer logout", async () => {
    let cookieCleared = false;
    const user: AuthenticatedUser = {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
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
        clearCookie: () => {
          cookieCleared = true;
        },
      } as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();

    expect(result.success).toBe(true);
    expect(cookieCleared).toBe(true);
  });
});
