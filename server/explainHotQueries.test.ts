import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

/**
 * Story 16 (Fase 1, DB-06/DB-07): prova, via EXPLAIN contra o banco real,
 * que as queries "quentes" de portal por client_email (a base de todo o
 * scoping por dono — Story 12/DB-03) usam índice em vez de full table scan.
 * Antes desta story, fuel_records/bookings/inspections/inspection_charges
 * não tinham nenhum índice além da PK.
 */
describe("EXPLAIN das queries quentes por client_email - Story 16", () => {
  const tables = [
    "fuel_records",
    "bookings",
    "bpo_charges",
    "inspections",
    "inspection_charges",
  ];

  it.each(tables)("%s: filtro por client_email usa índice, não full scan", async (table) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const rows = (await db.execute(
      sql.raw(`EXPLAIN SELECT * FROM ${table} WHERE client_email = 'nao-existe@example.com'`)
    )) as any;
    const list = Array.isArray(rows[0]) ? rows[0] : rows;
    const plan = list[0];

    expect(plan.type).not.toBe("ALL");
    expect(plan.key).toBeTruthy();
    expect(plan.key).toContain("client_email");
  });
});
