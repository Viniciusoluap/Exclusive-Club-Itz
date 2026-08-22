import { sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  allowedClients,
  asaasCustomers,
  bookings,
  bpoCharges,
  employees,
  expenseRecords,
  inspections,
  maintenances,
  vessels,
  webhookLogs,
} from "../../drizzle/schema";

export const EXCLUSIVE_DOLORES_SOURCE = {
  system: "exclusive_club",
  companyCode: "EXC",
  canonicalDatabase: "MySQL independente",
  mode: "read_only" as const,
};

// As tabelas possuem formatos diferentes; o helper usa somente a operação comum de contagem.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countTable(db: Awaited<ReturnType<typeof getDb>>, table: any) {
  if (!db) return null;
  try {
    const rows = await db.select({ count: sql<number>`count(*)` }).from(table);
    return Number(rows[0]?.count ?? 0);
  } catch {
    return null;
  }
}

/**
 * Snapshot gerencial agregado da Exclusive.
 * A consulta não executa regras de negócio, não grava dados e não altera Asaas/BPO.
 */
export async function getExclusiveDoloresSnapshot() {
  const db = await getDb();
  const [clients, vesselsCount, bookingsCount, inspectionsCount, maintenancesCount, employeesCount, expensesCount, bpoCount, asaasCount, webhookCount] = await Promise.all([
    countTable(db, allowedClients),
    countTable(db, vessels),
    countTable(db, bookings),
    countTable(db, inspections),
    countTable(db, maintenances),
    countTable(db, employees),
    countTable(db, expenseRecords),
    countTable(db, bpoCharges),
    countTable(db, asaasCustomers),
    countTable(db, webhookLogs),
  ]);

  return {
    source: {
      ...EXCLUSIVE_DOLORES_SOURCE,
      capturedAt: new Date().toISOString(),
    },
    domains: {
      clients,
      vessels: vesselsCount,
      bookings: bookingsCount,
      inspections: inspectionsCount,
      maintenances: maintenancesCount,
      employees: employeesCount,
      expenses: expensesCount,
    },
    bpo: {
      records: bpoCount,
      mode: "read_only" as const,
      writeBack: false,
    },
    asaas: {
      customers: asaasCount,
      webhookEvents: webhookCount,
      mode: "read_only" as const,
      writeBack: false,
    },
    protections: {
      bpoTouched: false,
      financialRulesTouched: false,
      asaasRulesTouched: false,
    },
  };
}
