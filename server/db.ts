import { and, desc, eq, gte, lte, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import { InsertUser, users, allowedClients, InsertAllowedClient, vessels, InsertVessel, bookings, InsertBooking, clientQuotas, InsertClientQuota, maintenances, InsertMaintenance, employees } from "../drizzle/schema";
import * as schema from "../drizzle/schema";
import * as relations from "../drizzle/relations";
import { ENV } from './_core/env';

const fullSchema = { ...schema, ...relations };

let _db: ReturnType<typeof drizzle<typeof fullSchema, Pool>> | null = null;

// Pool (not a single Connection) so mysql2 handles reconnects on dropped/idle
// connections automatically; a bare Connection dies permanently on the first
// network hiccup and getDb() would keep returning that dead connection forever
// (it's only created once, on first call). Passing `schema` here also enables
// the typed relational query builder (`db.query.<table>.findMany(...)`) as an
// alternative to `sql.raw()`/`db.execute(sql\`...\`)` for future queries.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = createPool(process.env.DATABASE_URL);
      _db = drizzle(pool, { schema: fullSchema, mode: "default" });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    // Verificar se o email está cadastrado como funcionário
    let isEmployee = false;
    if (user.email) {
      const { and } = await import('drizzle-orm');
      const employeeCheck = await db.select().from(employees)
        .where(and(
          eq(employees.email, user.email),
          eq(employees.isActive, 1)
        ))
        .limit(1);
      isEmployee = employeeCheck.length > 0;
    }

    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    } else if (isEmployee) {
      values.role = 'employee';
      updateSet.role = 'employee';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date().toISOString();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date().toISOString();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserPasswordHash(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function getAdminCount() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select().from(users).where(eq(users.role, "admin"));
  return result.length;
}

export async function createUser(user: InsertUser) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(users).values(user);
}

// Allowed Clients
export async function getAllowedClients() {
  const db = await getDb();
  if (!db) return [];
  const clients = await db.select().from(allowedClients).orderBy(desc(allowedClients.createdAt));
  
  // Fetch quotas for each client
  const clientsWithQuotas = await Promise.all(
    clients.map(async (client) => {
      const quotas = await getClientQuotasByClientId(client.id);
      return { ...client, quotas };
    })
  );
  
  return clientsWithQuotas;
}

export async function getActiveAllowedClients() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(allowedClients).where(eq(allowedClients.isActive, 1));
}

export async function getAllowedClientByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(allowedClients).where(eq(allowedClients.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllowedClientById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(allowedClients).where(eq(allowedClients.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createAllowedClient(client: InsertAllowedClient) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(allowedClients).values(client);
  return result;
}

export async function updateAllowedClient(id: number, data: Partial<InsertAllowedClient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(allowedClients).set(data).where(eq(allowedClients.id, id));
}

export async function deleteAllowedClient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(allowedClients).where(eq(allowedClients.id, id));
}

// Vessels
export async function getVessels() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(vessels).orderBy(desc(vessels.createdAt));
}

export async function getActiveVessels() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(vessels).where(eq(vessels.isActive, 1));
}

export async function getVesselById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(vessels).where(eq(vessels.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createVessel(vessel: InsertVessel) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vessels).values(vessel);
  return result;
}

export async function updateVessel(id: number, data: Partial<InsertVessel>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(vessels).set(data).where(eq(vessels.id, id));
}

export async function deleteVessel(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(vessels).where(eq(vessels.id, id));
}

// Bookings
export async function getBookings() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(bookings).orderBy(desc(bookings.bookingDate));
}

export async function getAllBookings() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(bookings);
}

export async function getBookingsByEmail(email: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(bookings).where(eq(bookings.clientEmail, email)).orderBy(desc(bookings.bookingDate));
}

export async function getActiveBookingsByEmail(email: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(bookings)
    .where(
      and(
        eq(bookings.clientEmail, email),
        eq(bookings.status, "confirmed")
      )
    )
    .orderBy(desc(bookings.bookingDate));
}

export async function getBookingsByDateRange(startDate: number, endDate: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(bookings)
    .where(
      and(
        gte(bookings.bookingDate, startDate),
        lte(bookings.bookingDate, endDate)
      )
    )
    .orderBy(bookings.bookingDate);
}

export async function getBookingsByVesselAndDate(vesselId: number, date: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(bookings)
    .where(
      and(
        eq(bookings.vesselId, vesselId),
        eq(bookings.bookingDate, date),
        eq(bookings.status, "confirmed")
      )
    );
}

export async function createBooking(booking: InsertBooking) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(bookings).values(booking);
  return result;
}

export async function updateBooking(id: number, data: Partial<InsertBooking>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(bookings).set(data).where(eq(bookings.id, id));
}

export async function deleteBooking(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(bookings).where(eq(bookings.id, id));
}

// Client Quotas
export async function getClientQuotasByClientId(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(clientQuotas)
    .where(and(eq(clientQuotas.clientId, clientId), eq(clientQuotas.isActive, 1)));
}

export async function getClientQuotasByEmail(email: string) {
  const db = await getDb();
  if (!db) return [];
  
  const client = await getAllowedClientByEmail(email);
  if (!client) return [];
  
  return await getClientQuotasByClientId(client.id);
}

export async function getClientQuotaByVessel(clientId: number, vesselId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(clientQuotas)
    .where(
      and(
        eq(clientQuotas.clientId, clientId),
        eq(clientQuotas.vesselId, vesselId),
        eq(clientQuotas.isActive, 1)
      )
    );
}

export async function createClientQuota(quota: InsertClientQuota) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clientQuotas).values(quota);
  return result;
}

export async function deleteClientQuota(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(clientQuotas).where(eq(clientQuotas.id, id));
}

export async function deleteClientQuotasByClientId(clientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(clientQuotas).where(eq(clientQuotas.clientId, clientId));
}

// Maintenances
export async function getMaintenances() {
  const db = await getDb();
  if (!db) return [];
  
  // Usar SQL direto para fazer JOIN e retornar nome da embarcação e criador
  const result = await db.execute(`
    SELECT 
      m.*,
      v.name as vessel_name,
      u.name as created_by_name,
      u.role as created_by_role
    FROM maintenances m
    JOIN vessels v ON m.vessel_id = v.id
    LEFT JOIN users u ON m.created_by = u.id
    ORDER BY m.start_date DESC
  `);
  
  // db.execute retorna [rows, fields], pegar apenas rows
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];
  
  // Converter snake_case para camelCase para compatibilidade com frontend
  return rows.map((row: any) => ({
    id: row.id,
    vesselId: row.vessel_id,
    vesselName: row.vessel_name,
    startDate: row.start_date,
    endDate: row.end_date,
    description: row.description,
    status: row.status,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdByRole: row.created_by_role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getMaintenanceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(maintenances).where(eq(maintenances.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getMaintenancesByVesselId(vesselId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(maintenances)
    .where(eq(maintenances.vesselId, vesselId))
    .orderBy(desc(maintenances.startDate));
}

export async function getActiveMaintenancesByVesselAndDate(vesselId: number, date: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Check if date falls within any maintenance period
  return await db.select().from(maintenances)
    .where(
      and(
        eq(maintenances.vesselId, vesselId),
        lte(maintenances.startDate, date),
        gte(maintenances.endDate, date),
        ne(maintenances.status, 'cancelled')
      )
    );
}

export async function createMaintenance(maintenance: InsertMaintenance) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(maintenances).values(maintenance);
  // MySQL/TiDB returns insertId in result
  const insertId = (result as any).insertId || (result as any)[0]?.insertId;
  return { id: insertId };
}

export async function updateMaintenance(id: number, data: Partial<InsertMaintenance>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(maintenances).set(data).where(eq(maintenances.id, id));
}

export async function deleteMaintenance(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(maintenances).where(eq(maintenances.id, id));
}

export async function updateUserName(userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ name }).where(eq(users.id, userId));
}

export async function updateUserEmail(userId: number, email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ email }).where(eq(users.id, userId));
}

// ============================================================================
// FUNÇÕES DE HERANÇA DE ESTOQUE E SALDO DO MÊS ANTERIOR
// ============================================================================

/**
 * Busca o orçamento do último mês anterior com registro em fuel_budget
 * Corrigido: busca o mês mais recente ANTES do mês atual, não apenas o mês imediatamente anterior.
 * Isso evita saldo herdado zerado quando há meses sem registro (ex: pula de março para maio).
 * @param monthYear - Formato: YYYY-MM
 * @returns monthlyBudgetId do último mês anterior com registro, ou null
 */
export async function getPreviousMonthBudget(monthYear: string): Promise<{ id: number; monthYear: string } | null> {
  const db = await getDb();
  if (!db) return null;

  const { sql } = await import('drizzle-orm');

  // Busca o último mês com registro em fuel_budget que seja estritamente anterior ao mês atual
  const result = await db.execute(sql`
    SELECT id, month_year
    FROM fuel_budget
    WHERE month_year < ${monthYear}
    ORDER BY month_year DESC
    LIMIT 1
  `) as any;

  const row = Array.isArray(result[0]) ? result[0][0] : result[0];
  // Retorna objeto com id e month_year para que calculateCurrentBalance use o mês correto
  return row ? { id: row.id, monthYear: row.month_year } : null;
}

/**
 * Calcula o estoque final de um galão em um mês específico
 * @param gallonNumber - Número do galão (1, 2 ou 3)
 * @param monthYear - Formato: YYYY-MM
 * @returns Estoque final em centésimos de litro
 */
export async function calculateGallonFinalStock(gallonNumber: number, monthYear: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const { fuelBudget, fuelPurchases, fuelRecords, fuelRecordContainers } = await import('../drizzle/schema');
  const { eq, and, sql } = await import('drizzle-orm');
  
  // Buscar id do fuel_budget
  const budgetResult = await db.select()
    .from(fuelBudget)
    .where(eq(fuelBudget.monthYear, monthYear))
    .limit(1);
  
  if (budgetResult.length === 0) return 0;
  
  const budgetId = budgetResult[0].id;
  
  // Calcular total comprado do galão
  const purchasesResult = await db.select({
    total: sql<number>`COALESCE(SUM(${fuelPurchases.litersPurchased}), 0)`
  })
    .from(fuelPurchases)
    .where(and(
      eq(fuelPurchases.monthYear, monthYear),
      eq(fuelPurchases.gallonNumber, gallonNumber)
    ));
  
  const totalPurchased = Number(purchasesResult[0]?.total || 0);
  
  // Calcular total consumido do galão (via DATE_FORMAT porque não temos monthlyBudgetId)
  const consumedResult = await db.execute(sql`
    SELECT COALESCE(SUM(frc.liters_used), 0) as total
    FROM fuel_record_containers frc
    INNER JOIN fuel_records fr ON frc.fuel_record_id = fr.id
    WHERE DATE_FORMAT(fr.created_at, '%Y-%m') = ${monthYear}
      AND frc.gallon_number = ${gallonNumber}
  `) as any;
  
  const consumedData = (Array.isArray(consumedResult[0]) ? consumedResult[0][0] : consumedResult[0]);
  
  const totalConsumed = Number(consumedData?.total || 0);
  
  // Estoque final = comprado - consumido
  return totalPurchased - totalConsumed;
}

/**
 * Calcula o estoque atual de um galão considerando herança do mês anterior
 * @param gallonNumber - Número do galão (1, 2 ou 3)
 * @param monthYear - Formato: YYYY-MM
 * @returns Estoque atual em centésimos de litro
 */
export async function calculateCurrentGallonStock(gallonNumber: number, monthYear: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // 1. Buscar estoque final do último mês anterior com registro
  const prevMonthRecord = await getPreviousMonthBudget(monthYear);
  let inheritedStock = 0;
  
  if (prevMonthRecord) {
    // Usa o month_year real do registro encontrado (não calcula aritmeticamente)
    inheritedStock = await calculateGallonFinalStock(gallonNumber, prevMonthRecord.monthYear);
  }
  
  // 2. Calcular compras e consumos do mês atual
  const { fuelPurchases, fuelRecordContainers } = await import('../drizzle/schema');
  const { eq, and, sql } = await import('drizzle-orm');
  
  // Total comprado no mês atual
  const purchasesResult = await db.select({
    total: sql<number>`COALESCE(SUM(${fuelPurchases.litersPurchased}), 0)`
  })
    .from(fuelPurchases)
    .where(and(
      eq(fuelPurchases.monthYear, monthYear),
      eq(fuelPurchases.gallonNumber, gallonNumber)
    ));
  
  const currentPurchased = Number(purchasesResult[0]?.total || 0);
  
  // Total consumido no mês atual
  const consumedResult2 = await db.execute(sql`
    SELECT COALESCE(SUM(frc.liters_used), 0) as total
    FROM fuel_record_containers frc
    INNER JOIN fuel_records fr ON frc.fuel_record_id = fr.id
    WHERE DATE_FORMAT(fr.created_at, '%Y-%m') = ${monthYear}
      AND frc.gallon_number = ${gallonNumber}
  `) as any;
  
  const consumedData2 = (Array.isArray(consumedResult2[0]) ? consumedResult2[0][0] : consumedResult2[0]);
  
  const currentConsumed = Number(consumedData2?.total || 0);
  
  // Estoque atual = herdado + comprado - consumido
  return inheritedStock + currentPurchased - currentConsumed;
}

/**
 * Calcula o saldo final de um mês (Herdado + Gasto - Orçamento)
 * Esta função é recursiva e considera a herança completa do mês anterior
 * @param monthYear - Formato: YYYY-MM
 * @returns Saldo final em centavos
 */
export async function calculateMonthFinalBalance(monthYear: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const { sql } = await import('drizzle-orm');
  
  // 1. Buscar saldo herdado do último mês anterior com registro (recursivo)
  const prevMonthRecord = await getPreviousMonthBudget(monthYear);
  let inheritedBalance = 0;
  
  if (prevMonthRecord) {
    // Usa o month_year real do registro encontrado (não calcula aritmeticamente)
    inheritedBalance = await calculateMonthFinalBalance(prevMonthRecord.monthYear); // Recursão
  }
  
  // 2. Calcular orçamento (soma das compras)
  const budgetResult = await db.execute(sql`
    SELECT COALESCE(SUM(amount_paid), 0) as total
    FROM fuel_purchases
    WHERE month_year = ${monthYear}
  `) as any;
  
  const budgetData = (Array.isArray(budgetResult[0]) ? budgetResult[0][0] : budgetResult[0]);
  const budget = Number(budgetData?.total || 0);
  
  // 3. Calcular gasto (soma dos abastecimentos NAO operacionais)
  // IMPORTANTE: excluir operacionais para ser consistente com o que a tela exibe
  const spentResult = await db.execute(sql`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM fuel_records
    WHERE DATE_FORMAT(created_at, '%Y-%m') = ${monthYear}
      AND (is_operational = 0 OR is_operational IS NULL)
  `) as any;
  
  const spentData = (Array.isArray(spentResult[0]) ? spentResult[0][0] : spentResult[0]);
  const spent = Number(spentData?.total || 0);
  
  // 4. Saldo Atual = Herdado + Gasto - Orçamento
  return inheritedBalance + spent - budget;
}

/**
 * Calcula o saldo atual considerando herança do mês anterior
 * @param monthYear - Formato: YYYY-MM
 * @returns Objeto com saldo herdado, orçamento, gasto e saldo atual (tudo em centavos)
 */
export async function calculateCurrentBalance(monthYear: string): Promise<{
  inherited: number;
  budget: number;
  spent: number;
  current: number;
}> {
  const db = await getDb();
  if (!db) return { inherited: 0, budget: 0, spent: 0, current: 0 };

  // 1. Buscar saldo final do último mês anterior com registro
  const prevMonthRecord = await getPreviousMonthBudget(monthYear);
  let inheritedBalance = 0;
  
  if (prevMonthRecord) {
    // Usa o month_year real do registro encontrado (não calcula aritmeticamente)
    inheritedBalance = await calculateMonthFinalBalance(prevMonthRecord.monthYear);
  }
  
  // 2. Calcular orçamento e gasto do mês atual
  const { sql } = await import('drizzle-orm');
  
  // Orçamento do mês (soma das compras)
  const budgetResult = await db.execute(sql`
    SELECT COALESCE(SUM(amount_paid), 0) as total
    FROM fuel_purchases
    WHERE month_year = ${monthYear}
  `) as any;
  
  const budgetData = (Array.isArray(budgetResult[0]) ? budgetResult[0][0] : budgetResult[0]);
  const currentBudget = Number(budgetData?.total || 0);
  
  // Gasto do mês (soma dos abastecimentos) - EXCLUINDO OPERACIONAIS
  const spentResult = await db.execute(sql`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM fuel_records
    WHERE DATE_FORMAT(created_at, '%Y-%m') = ${monthYear}
      AND (is_operational = 0 OR is_operational IS NULL)
  `) as any;
  
  const spentData = (Array.isArray(spentResult[0]) ? spentResult[0][0] : spentResult[0]);
  const currentSpent = Number(spentData?.total || 0);
  
  // Saldo atual = herdado + gasto - orçamento
  const currentBalance = inheritedBalance + currentSpent - currentBudget;
  
  return {
    inherited: inheritedBalance,
    budget: currentBudget,
    spent: currentSpent,
    current: currentBalance
  };
}

/**
 * Retorna apenas as compras do mês atual por galão (SEM herança)
 * @param monthYear - Formato: YYYY-MM
 * @returns Objeto com litros comprados por galão no mês
 */
export async function getMonthPurchasesByGallon(monthYear: string): Promise<{ gallon1: number; gallon2: number; gallon3: number; total: number }> {
  const db = await getDb();
  if (!db) return { gallon1: 0, gallon2: 0, gallon3: 0, total: 0 };

  const { fuelPurchases } = await import('../drizzle/schema');
  const { eq, and, sql } = await import('drizzle-orm');

  const result = { gallon1: 0, gallon2: 0, gallon3: 0, total: 0 };

  // Buscar compras por galão
  for (let gallonNum = 1; gallonNum <= 3; gallonNum++) {
    const purchasesResult = await db.select({
      total: sql<number>`COALESCE(SUM(${fuelPurchases.litersPurchased}), 0)`
    })
      .from(fuelPurchases)
      .where(and(
        eq(fuelPurchases.monthYear, monthYear),
        eq(fuelPurchases.gallonNumber, gallonNum)
      ));

    const liters = Number(purchasesResult[0]?.total || 0);
    result[`gallon${gallonNum}` as 'gallon1' | 'gallon2' | 'gallon3'] = liters;
    result.total += liters;
  }

  return result;
}
