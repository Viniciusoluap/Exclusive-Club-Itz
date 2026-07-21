import { describe, expect, it, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { runUpdateOverdueStatus } from "./updateOverdueStatus";

/**
 * Story 10 (Fase 1, SYS-23): prova contra o banco real (mesma filosofia de
 * server/db.transaction.test.ts) de que a fronteira de "vencido" usa o
 * calendário de America/Sao_Paulo — não CURDATE() (fuso do servidor de
 * banco) — e que rodar o job duas vezes no mesmo dia não gera efeito
 * duplicado (idempotência).
 */
describe("runUpdateOverdueStatus - integração (banco real)", () => {
  function todayInSaoPaulo(): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split("T")[0];
  }

  const seededIds: number[] = [];

  afterEach(async () => {
    const db = await getDb();
    if (!db || seededIds.length === 0) return;
    const ids = sql.join(seededIds.splice(0, seededIds.length).map((id) => sql`${id}`), sql`, `);
    await db.execute(sql`DELETE FROM bpo_charges WHERE id IN (${ids})`);
  });

  async function seedCharge(dueDate: string): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const marker = `overdue-story10-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [result] = (await db.execute(sql`
      INSERT INTO bpo_charges (asaas_charge_id, value, due_date, status)
      VALUES (${marker}, ${50}, ${dueDate}, ${"pending"})
    `)) as any;
    const id = result?.insertId;
    seededIds.push(id);
    return id;
  }

  async function statusOf(id: number): Promise<string> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const rows = (await db.execute(sql`SELECT status FROM bpo_charges WHERE id = ${id}`)) as any;
    const row = Array.isArray(rows[0]) ? rows[0][0] : rows[0];
    return row.status;
  }

  it("marca como vencida uma cobrança com due_date no passado", async () => {
    const today = todayInSaoPaulo();
    const yesterday = addDays(today, -1);
    const id = await seedCharge(yesterday);

    await runUpdateOverdueStatus();

    expect(await statusOf(id)).toBe("overdue");
  });

  it("NÃO marca como vencida uma cobrança com due_date de hoje (fronteira em America/Sao_Paulo, não CURDATE())", async () => {
    const today = todayInSaoPaulo();
    const id = await seedCharge(today);

    await runUpdateOverdueStatus();

    expect(await statusOf(id)).toBe("pending");
  });

  it("NÃO marca como vencida uma cobrança com due_date no futuro", async () => {
    const today = todayInSaoPaulo();
    const tomorrow = addDays(today, 1);
    const id = await seedCharge(tomorrow);

    await runUpdateOverdueStatus();

    expect(await statusOf(id)).toBe("pending");
  });

  it("é idempotente: rodar duas vezes no mesmo dia não reprocessa a mesma cobrança", async () => {
    const today = todayInSaoPaulo();
    const yesterday = addDays(today, -1);
    const id = await seedCharge(yesterday);

    const first = await runUpdateOverdueStatus();
    expect(first.bpoCharges).toBeGreaterThanOrEqual(1);
    expect(await statusOf(id)).toBe("overdue");

    // A cobrança já não está mais 'pending', então a segunda execução não a
    // toca de novo — o filtro WHERE status = 'pending' garante isso.
    await runUpdateOverdueStatus();
    expect(await statusOf(id)).toBe("overdue");
  });
});
