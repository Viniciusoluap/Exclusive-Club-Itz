import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { sql } from "drizzle-orm";

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

describe("inspectionCharges.getFailedInspectionsForCharges", () => {
  let testVesselId: number;
  let testInspectionId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Criar embarcação de teste
    const vesselResult = await db.execute(sql`
      INSERT INTO vessels (name, type, quota_count, is_active)
      VALUES ('Test Vessel', 'lancha', 6, 1)
    `) as any;
    testVesselId = vesselResult[0]?.insertId || vesselResult.insertId;

    // Criar vistoria reprovada de teste
    const inspectionData = JSON.stringify([
      { name: "Motor", status: "Reprovado", observations: "Vazamento de óleo" },
      { name: "Casco", status: "Aprovado", observations: "" }
    ]);

    const inspectionResult = await db.execute(sql`
      INSERT INTO inspections (
        vessel_id, vessel_name, vessel_type, client_name,
        inspection_data, status, inspected_by, created_at
      )
      VALUES (
        ${testVesselId}, 'Test Vessel', 'lancha', 'Test Client',
        ${inspectionData}, 'rejected', 'Test Inspector', NOW()
      )
    `) as any;
    testInspectionId = inspectionResult[0]?.insertId || inspectionResult.insertId;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Limpar dados de teste
    await db.execute(sql`DELETE FROM inspections WHERE id = ${testInspectionId}`);
    await db.execute(sql`DELETE FROM vessels WHERE id = ${testVesselId}`);
  });

  it("deve retornar vistorias reprovadas sem cobrança", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspectionCharges.getFailedInspectionsForCharges();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // Verificar limite de 5 vistorias
    expect(result.length).toBeLessThanOrEqual(5);

    // Verificar estrutura do primeiro item
    const firstInspection = result[0];
    expect(firstInspection).toHaveProperty("id");
    expect(firstInspection).toHaveProperty("vessel_name");
    expect(firstInspection).toHaveProperty("client_name");
    expect(firstInspection).toHaveProperty("inspection_data");
    expect(firstInspection).toHaveProperty("created_at");
  });

  it("deve retornar inspection_data como objeto JSON parseado", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspectionCharges.getFailedInspectionsForCharges();

    const testInspection = result.find((i: any) => i.id === testInspectionId);
    expect(testInspection).toBeDefined();
    expect(Array.isArray(testInspection?.inspection_data)).toBe(true);
    expect(testInspection?.inspection_data.length).toBeGreaterThan(0);
  });

  it("não deve retornar vistorias que já possuem cobrança", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Criar cobrança para a vistoria de teste
    await db.execute(sql`
      INSERT INTO inspection_charges (
        inspection_id, client_email, vessel_name, failed_items,
        amount, due_date, payment_status
      )
      VALUES (
        ${testInspectionId}, 'test@example.com', 'Test Vessel',
        '[]', 100.00, NOW(), 'pending'
      )
    `);

    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspectionCharges.getFailedInspectionsForCharges();

    // A vistoria de teste não deve aparecer pois já tem cobrança
    const testInspection = result.find((i: any) => i.id === testInspectionId);
    expect(testInspection).toBeUndefined();

    // Limpar cobrança de teste
    await db.execute(sql`DELETE FROM inspection_charges WHERE inspection_id = ${testInspectionId}`);
  });

  it("deve ordenar por data de criação decrescente", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspectionCharges.getFailedInspectionsForCharges();

    if (result.length > 1) {
      for (let i = 0; i < result.length - 1; i++) {
        const current = new Date(result[i].created_at).getTime();
        const next = new Date(result[i + 1].created_at).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    }
  });
});
