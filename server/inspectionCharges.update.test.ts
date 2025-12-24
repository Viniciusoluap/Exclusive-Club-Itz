import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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

describe("inspectionCharges.update", () => {
  let testChargeId: number;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(async () => {
    const ctx = createAdminContext();
    caller = appRouter.createCaller(ctx);

    // Criar uma cobrança de teste para editar
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const { sql } = await import("drizzle-orm");
    
    // Inserir cobrança de teste
    const insertResult = await db.execute(sql.raw(`
      INSERT INTO inspection_charges 
      (client_email, vessel_id, vessel_name, charge_type, amount, due_date, payment_status, created_at, updated_at)
      VALUES 
      ('test@example.com', 1, 'Test Vessel', 'repair', '100.00', '${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}', 'pending', NOW(), NOW())
    `)) as any;

    // Obter ID da cobrança criada
    const selectResult = await db.execute(sql.raw(`
      SELECT id FROM inspection_charges WHERE client_email = 'test@example.com' ORDER BY id DESC LIMIT 1
    `)) as any;

    testChargeId = (Array.isArray(selectResult[0]) ? selectResult[0][0] : selectResult[0])?.id;
  });

  it("deve atualizar valor de cobrança pendente com sucesso", async () => {
    const result = await caller.inspectionCharges.update({
      chargeId: testChargeId,
      newAmount: 150.50,
    });

    expect(result).toEqual({ success: true });

    // Verificar se foi atualizado no banco
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const { sql } = await import("drizzle-orm");
    const checkResult = await db.execute(sql.raw(`
      SELECT amount FROM inspection_charges WHERE id = ${testChargeId}
    `)) as any;

    const charge = (Array.isArray(checkResult[0]) ? checkResult[0][0] : checkResult[0]);
    expect(parseFloat(charge.amount)).toBe(150.50);
  });

  it("deve atualizar data de vencimento com sucesso", async () => {
    const newDueDate = Date.now() + 14 * 24 * 60 * 60 * 1000; // 14 dias no futuro

    const result = await caller.inspectionCharges.update({
      chargeId: testChargeId,
      newDueDate,
    });

    expect(result).toEqual({ success: true });

    // Verificar se foi atualizado no banco
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const { sql } = await import("drizzle-orm");
    const checkResult = await db.execute(sql.raw(`
      SELECT due_date FROM inspection_charges WHERE id = ${testChargeId}
    `)) as any;

    const charge = (Array.isArray(checkResult[0]) ? checkResult[0][0] : checkResult[0]);
    const dueDateMs = new Date(charge.due_date).getTime();
    
    // Verificar se a data está próxima (tolerância de 1 dia devido ao timezone)
    expect(Math.abs(dueDateMs - newDueDate)).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it("deve atualizar valor e vencimento simultaneamente", async () => {
    const newDueDate = Date.now() + 21 * 24 * 60 * 60 * 1000; // 21 dias no futuro

    const result = await caller.inspectionCharges.update({
      chargeId: testChargeId,
      newAmount: 200.00,
      newDueDate,
    });

    expect(result).toEqual({ success: true });

    // Verificar ambos os campos
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const { sql } = await import("drizzle-orm");
    const checkResult = await db.execute(sql.raw(`
      SELECT amount, due_date FROM inspection_charges WHERE id = ${testChargeId}
    `)) as any;

    const charge = (Array.isArray(checkResult[0]) ? checkResult[0][0] : checkResult[0]);
    expect(parseFloat(charge.amount)).toBe(200.00);
    
    const dueDateMs = new Date(charge.due_date).getTime();
    expect(Math.abs(dueDateMs - newDueDate)).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it("deve rejeitar atualização de cobrança paga", async () => {
    // Marcar cobrança como paga
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const { sql } = await import("drizzle-orm");
    await db.execute(sql.raw(`
      UPDATE inspection_charges SET payment_status = 'paid' WHERE id = ${testChargeId}
    `));

    // Tentar atualizar
    await expect(
      caller.inspectionCharges.update({
        chargeId: testChargeId,
        newAmount: 150.00,
      })
    ).rejects.toThrow("Não é possível editar cobrança paga");
  });

  it("deve rejeitar valor negativo ou zero", async () => {
    await expect(
      caller.inspectionCharges.update({
        chargeId: testChargeId,
        newAmount: 0,
      })
    ).rejects.toThrow();

    await expect(
      caller.inspectionCharges.update({
        chargeId: testChargeId,
        newAmount: -50,
      })
    ).rejects.toThrow();
  });

  it("deve retornar erro para cobrança inexistente", async () => {
    await expect(
      caller.inspectionCharges.update({
        chargeId: 999999,
        newAmount: 100.00,
      })
    ).rejects.toThrow("Cobrança não encontrada");
  });
});
