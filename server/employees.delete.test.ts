import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

/**
 * Testes do endpoint employees.delete
 * 
 * Valida que:
 * 1. Exclusão remove registro da tabela employees
 * 2. Exclusão também remove registro da tabela users (se existir)
 * 3. Previne registros órfãos na tabela users
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

describe("employees.delete - Limpeza Completa", () => {
  let testEmployeeId: number;
  let testEmployeeEmail: string;

  beforeEach(async () => {
    // Criar funcionário de teste
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const { employees } = await import('../drizzle/schema');
    
    testEmployeeEmail = `test-employee-${Date.now()}@example.com`;
    
    const result = await db.insert(employees).values({
      name: "Test Employee",
      email: testEmployeeEmail,
      phone: "11999999999",
      isActive: true,
    });

    // @ts-ignore - insertId exists in mysql2 result
    testEmployeeId = Number(result[0].insertId);

    // Criar registro correspondente na tabela users (simular login)
    const { users } = await import('../drizzle/schema');
    await db.insert(users).values({
      openId: `test-openid-${Date.now()}`,
      name: "Test Employee",
      email: testEmployeeEmail,
      loginMethod: "manus",
      role: "employee",
    });
  });

  afterEach(async () => {
    // Limpar registros de teste (caso o teste falhe)
    const db = await getDb();
    if (!db) return;

    const { employees, users } = await import('../drizzle/schema');
    const { eq } = await import('drizzle-orm');

    try {
      await db.delete(employees).where(eq(employees.email, testEmployeeEmail));
      await db.delete(users).where(eq(users.email, testEmployeeEmail));
    } catch (error) {
      // Ignorar erros de limpeza
    }
  });

  it("Remove funcionário da tabela employees", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Executar exclusão
    const result = await caller.employees.delete({ id: testEmployeeId });
    
    expect(result.success).toBe(true);

    // Verificar que foi removido da tabela employees
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const { employees } = await import('../drizzle/schema');
    const { eq } = await import('drizzle-orm');

    const employeeCheck = await db.select()
      .from(employees)
      .where(eq(employees.id, testEmployeeId))
      .limit(1);

    expect(employeeCheck.length).toBe(0);
  });

  it("Remove funcionário da tabela users (previne órfãos)", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Executar exclusão
    const result = await caller.employees.delete({ id: testEmployeeId });
    
    expect(result.success).toBe(true);

    // Verificar que foi removido da tabela users
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const { users } = await import('../drizzle/schema');
    const { eq } = await import('drizzle-orm');

    const userCheck = await db.select()
      .from(users)
      .where(eq(users.email, testEmployeeEmail))
      .limit(1);

    expect(userCheck.length).toBe(0);
  });

  it("Exclusão bem-sucedida mesmo se não houver registro na tabela users", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Remover registro da tabela users antes do teste
    const { users } = await import('../drizzle/schema');
    const { eq } = await import('drizzle-orm');
    await db.delete(users).where(eq(users.email, testEmployeeEmail));

    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Executar exclusão (deve funcionar mesmo sem registro em users)
    const result = await caller.employees.delete({ id: testEmployeeId });
    
    expect(result.success).toBe(true);

    // Verificar que foi removido da tabela employees
    const { employees } = await import('../drizzle/schema');
    const employeeCheck = await db.select()
      .from(employees)
      .where(eq(employees.id, testEmployeeId))
      .limit(1);

    expect(employeeCheck.length).toBe(0);
  });
});
