import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(email: string = "test@example.com"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email,
    name: "Test User",
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

describe("inspectionCharges.myCharges", () => {
  beforeEach(async () => {
    // Limpar dados de teste
    const db = await getDb();
    if (!db) return;

    await db.execute(sql.raw(`DELETE FROM inspection_charges WHERE client_email LIKE 'test%'`));
    await db.execute(sql.raw(`DELETE FROM inspections WHERE client_name LIKE 'Test%'`));
    await db.execute(sql.raw(`DELETE FROM bookings WHERE client_email LIKE 'test%'`));
  });

  it("deve retornar vistoria reprovada sem cobrança (Aguardando Orçamento)", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const clientEmail = "test1@example.com";
    const clientName = "Test Client 1";

    // Criar booking para associar cliente
    await db.execute(sql.raw(`
      INSERT INTO bookings (client_email, client_name, vessel_id, vessel_name, booking_date, status)
      VALUES ('${clientEmail}', '${clientName}', 1, 'Test Vessel', ${Date.now()}, 'confirmed')
    `));

    // Criar vistoria reprovada SEM cobrança
    await db.execute(sql.raw(`
      INSERT INTO inspections (vessel_id, vessel_name, vessel_type, client_name, inspection_data, status, reprovation_photos)
      VALUES (
        1,
        'Test Vessel',
        'lancha',
        '${clientName}',
        '{"Motor": "REPROVADO", "Casco": "APROVADO"}',
        'rejected',
        '[{"itemName": "Motor", "photoUrl": "https://example.com/photo1.jpg"}]'
      )
    `));

    const ctx = createAuthContext(clientEmail);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspectionCharges.myCharges({});

    expect(result).toHaveLength(1);
    expect(result[0].vessel_name).toBe("Test Vessel");
    expect(result[0].failed_items).toHaveLength(1);
    expect(result[0].failed_items[0].name).toBe("Motor");
    expect(result[0].reprovation_photos).toHaveLength(1);
    expect(result[0].reprovation_photos[0].itemName).toBe("Motor");
    
    // Verificar que NÃO tem cobrança
    expect(result[0].charge.id).toBeNull();
    expect(result[0].charge.amount).toBeNull();
  });

  it("deve retornar vistoria reprovada COM cobrança", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const clientEmail = "test2@example.com";
    const clientName = "Test Client 2";

    // Criar booking
    await db.execute(sql.raw(`
      INSERT INTO bookings (client_email, client_name, vessel_id, vessel_name, booking_date, status)
      VALUES ('${clientEmail}', '${clientName}', 1, 'Test Vessel', ${Date.now()}, 'confirmed')
    `));

    // Criar vistoria reprovada
    const inspectionResult = await db.execute(sql.raw(`
      INSERT INTO inspections (vessel_id, vessel_name, vessel_type, client_name, inspection_data, status)
      VALUES (
        1,
        'Test Vessel',
        'lancha',
        '${clientName}',
        '{"Motor": "REPROVADO"}',
        'rejected'
      )
    `)) as any;

    const inspectionId = inspectionResult[0]?.insertId || inspectionResult.insertId;

    // Criar cobrança para a vistoria
    await db.execute(sql.raw(`
      INSERT INTO inspection_charges (
        inspection_id,
        client_email,
        vessel_name,
        charge_type,
        amount,
        due_date,
        payment_status
      )
      VALUES (
        ${inspectionId},
        '${clientEmail}',
        'Test Vessel',
        'inspection',
        150.00,
        '2025-12-31',
        'pending'
      )
    `));

    const ctx = createAuthContext(clientEmail);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspectionCharges.myCharges({});

    expect(result).toHaveLength(1);
    expect(result[0].vessel_name).toBe("Test Vessel");
    
    // Verificar que TEM cobrança
    expect(result[0].charge.id).not.toBeNull();
    expect(result[0].charge.amount).toBe("150.00");
    expect(result[0].charge.payment_status).toBe("pending");
  });

  it("deve filtrar por mês/ano corretamente", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const clientEmail = "test3@example.com";
    const clientName = "Test Client 3";

    // Criar booking
    await db.execute(sql.raw(`
      INSERT INTO bookings (client_email, client_name, vessel_id, vessel_name, booking_date, status)
      VALUES ('${clientEmail}', '${clientName}', 1, 'Test Vessel', ${Date.now()}, 'confirmed')
    `));

    // Criar vistoria em dezembro de 2025
    await db.execute(sql.raw(`
      INSERT INTO inspections (vessel_id, vessel_name, vessel_type, client_name, inspection_data, status, created_at)
      VALUES (
        1,
        'Test Vessel Dec',
        'lancha',
        '${clientName}',
        '{"Motor": "REPROVADO"}',
        'rejected',
        '2025-12-15 10:00:00'
      )
    `));

    // Criar vistoria em novembro de 2025
    await db.execute(sql.raw(`
      INSERT INTO inspections (vessel_id, vessel_name, vessel_type, client_name, inspection_data, status, created_at)
      VALUES (
        1,
        'Test Vessel Nov',
        'lancha',
        '${clientName}',
        '{"Motor": "REPROVADO"}',
        'rejected',
        '2025-11-15 10:00:00'
      )
    `));

    const ctx = createAuthContext(clientEmail);
    const caller = appRouter.createCaller(ctx);

    // Filtrar por dezembro de 2025
    const decResult = await caller.inspectionCharges.myCharges({ monthYear: "2025-12" });
    expect(decResult).toHaveLength(1);
    expect(decResult[0].vessel_name).toBe("Test Vessel Dec");

    // Filtrar por novembro de 2025
    const novResult = await caller.inspectionCharges.myCharges({ monthYear: "2025-11" });
    expect(novResult).toHaveLength(1);
    expect(novResult[0].vessel_name).toBe("Test Vessel Nov");

    // Sem filtro, deve retornar ambas
    const allResult = await caller.inspectionCharges.myCharges({});
    expect(allResult).toHaveLength(2);
  });

  it("deve retornar array vazio se não houver vistorias reprovadas", async () => {
    const ctx = createAuthContext("nonexistent@example.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspectionCharges.myCharges({});

    expect(result).toHaveLength(0);
  });

  it("deve parsear inspection_data e reprovation_photos corretamente", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const clientEmail = "test4@example.com";
    const clientName = "Test Client 4";

    await db.execute(sql.raw(`
      INSERT INTO bookings (client_email, client_name, vessel_id, vessel_name, booking_date, status)
      VALUES ('${clientEmail}', '${clientName}', 1, 'Test Vessel', ${Date.now()}, 'confirmed')
    `));

    await db.execute(sql.raw(`
      INSERT INTO inspections (vessel_id, vessel_name, vessel_type, client_name, inspection_data, status, reprovation_photos)
      VALUES (
        1,
        'Test Vessel',
        'lancha',
        '${clientName}',
        '{"Motor": "REPROVADO", "Casco": "REPROVADO", "Hélice": "APROVADO"}',
        'rejected',
        '[{"itemName": "Motor", "photoUrl": "https://example.com/motor.jpg"}, {"itemName": "Casco", "photoUrl": "https://example.com/casco.jpg"}]'
      )
    `));

    const ctx = createAuthContext(clientEmail);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspectionCharges.myCharges({});

    expect(result).toHaveLength(1);
    
    // Deve ter 2 itens reprovados (Motor e Casco)
    expect(result[0].failed_items).toHaveLength(2);
    const itemNames = result[0].failed_items.map((item: any) => item.name);
    expect(itemNames).toContain("Motor");
    expect(itemNames).toContain("Casco");
    expect(itemNames).not.toContain("Hélice");

    // Deve ter 2 fotos
    expect(result[0].reprovation_photos).toHaveLength(2);
    expect(result[0].reprovation_photos[0].itemName).toBe("Motor");
    expect(result[0].reprovation_photos[1].itemName).toBe("Casco");
  });
});
