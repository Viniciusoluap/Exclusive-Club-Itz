import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

/**
 * Testes do endpoint bookings.getRecent
 * 
 * Valida que:
 * 1. Admin pode acessar reservas recentes
 * 2. Employee pode acessar reservas recentes
 * 3. Usuário comum (role 'user') é bloqueado
 * 4. Usuário não autenticado é bloqueado
 */

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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createEmployeeContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "employee-user",
    email: "employee@example.com",
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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 3,
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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUnauthenticatedContext(): TrpcContext {
  return {
    user: undefined,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("bookings.getRecent - Permissões", () => {
  it("Admin pode acessar reservas recentes", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Não deve lançar erro
    const result = await caller.bookings.getRecent({ onlyUsed: true });
    
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("Employee pode acessar reservas recentes", async () => {
    const ctx = createEmployeeContext();
    const caller = appRouter.createCaller(ctx);

    // Não deve lançar erro
    const result = await caller.bookings.getRecent({ onlyUsed: true });
    
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("Usuário comum (role 'user') é bloqueado", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    // Deve lançar erro UNAUTHORIZED
    await expect(
      caller.bookings.getRecent({ onlyUsed: true })
    ).rejects.toThrow(/UNAUTHORIZED|Acesso negado/);
  });

  it("Usuário não autenticado é bloqueado", async () => {
    const ctx = createUnauthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    // Deve lançar erro UNAUTHORIZED
    await expect(
      caller.bookings.getRecent({ onlyUsed: true })
    ).rejects.toThrow(/UNAUTHORIZED|Acesso negado/);
  });
});

describe("bookings.getRecent - Funcionalidade", () => {
  it("Retorna apenas reservas 'used' quando onlyUsed=true", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.bookings.getRecent({ onlyUsed: true });
    
    expect(Array.isArray(result)).toBe(true);
    
    // Se houver resultados, todos devem ter status 'used'
    if (result.length > 0) {
      result.forEach((booking: any) => {
        expect(booking.status).toBe('used');
      });
    }
  });

  it("Retorna reservas 'confirmed' e 'used' quando onlyUsed=false", async () => {
    const ctx = createEmployeeContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.bookings.getRecent({ onlyUsed: false });
    
    expect(Array.isArray(result)).toBe(true);
    
    // Se houver resultados, devem ter status 'confirmed' ou 'used'
    if (result.length > 0) {
      result.forEach((booking: any) => {
        expect(['confirmed', 'used']).toContain(booking.status);
      });
    }
  });

  it("Limita a 6 resultados quando onlyUsed=true", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.bookings.getRecent({ onlyUsed: true });
    
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(6);
  });
});
