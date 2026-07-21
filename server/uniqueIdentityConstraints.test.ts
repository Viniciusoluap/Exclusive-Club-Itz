import { describe, expect, it, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

/**
 * Story 13 (Fase 1, DB-09/DB-14): prova contra o banco real que
 * users.openId, users.email e allowed_clients.email agora rejeitam
 * duplicatas via constraint UNIQUE — antes eram apenas index() comuns
 * (nomeados "..._unique" apesar de não serem), então nada impedia duas
 * linhas com o mesmo openId/email.
 */

// drizzle envolve o erro do MySQL: a mensagem de topo é "Failed query: ...",
// o "Duplicate entry" real fica em error.cause (mesmo padrão observado nas
// Stories 8/9 desta fase) — expect().rejects.toThrow() só olha a mensagem
// de topo, então checa a causa explicitamente.
async function expectDuplicateEntry(promise: Promise<unknown>) {
  let caught: any;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught, "esperava que a query rejeitasse por duplicidade").toBeDefined();
  const cause = caught?.cause ?? caught;
  const message = cause?.sqlMessage || cause?.message || String(cause);
  expect(message).toMatch(/Duplicate entry/i);
}

describe("Constraints UNIQUE de identidade - Story 13", () => {
  const seededUserIds: number[] = [];
  const seededClientIds: number[] = [];

  afterEach(async () => {
    const db = await getDb();
    if (!db) return;
    if (seededUserIds.length > 0) {
      const ids = sql.join(seededUserIds.splice(0, seededUserIds.length).map((id) => sql`${id}`), sql`, `);
      await db.execute(sql`DELETE FROM users WHERE id IN (${ids})`);
    }
    if (seededClientIds.length > 0) {
      const ids = sql.join(seededClientIds.splice(0, seededClientIds.length).map((id) => sql`${id}`), sql`, `);
      await db.execute(sql`DELETE FROM allowed_clients WHERE id IN (${ids})`);
    }
  });

  it("rejeita um segundo users.openId igual (condição de corrida do upsertUser)", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const openId = `story13-openid-${Date.now()}`;
    const [first] = (await db.execute(sql`
      INSERT INTO users (openId, email, name) VALUES (${openId}, ${`${openId}@example.com`}, 'Teste Story 13')
    `)) as any;
    seededUserIds.push(first.insertId);

    await expectDuplicateEntry(
      db.execute(sql`
        INSERT INTO users (openId, email, name) VALUES (${openId}, ${`${openId}-outro@example.com`}, 'Duplicata')
      `)
    );
  });

  it("rejeita um segundo users.email igual", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const email = `story13-email-${Date.now()}@example.com`;
    const [first] = (await db.execute(sql`
      INSERT INTO users (openId, email, name) VALUES (${`story13-a-${Date.now()}`}, ${email}, 'Teste A')
    `)) as any;
    seededUserIds.push(first.insertId);

    await expectDuplicateEntry(
      db.execute(sql`
        INSERT INTO users (openId, email, name) VALUES (${`story13-b-${Date.now()}`}, ${email}, 'Teste B')
      `)
    );
  });

  it("permite múltiplos users.email NULL (constraint UNIQUE não conflita com NULL)", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [first] = (await db.execute(sql`
      INSERT INTO users (openId, email, name) VALUES (${`story13-null-a-${Date.now()}`}, NULL, 'Sem email A')
    `)) as any;
    seededUserIds.push(first.insertId);

    const [second] = (await db.execute(sql`
      INSERT INTO users (openId, email, name) VALUES (${`story13-null-b-${Date.now()}`}, NULL, 'Sem email B')
    `)) as any;
    seededUserIds.push(second.insertId);

    expect(first.insertId).not.toBe(second.insertId);
  });

  it("rejeita um segundo allowed_clients.email igual", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const email = `story13-client-${Date.now()}@example.com`;
    const [first] = (await db.execute(sql`
      INSERT INTO allowed_clients (email, name) VALUES (${email}, 'Cliente A')
    `)) as any;
    seededClientIds.push(first.insertId);

    await expectDuplicateEntry(
      db.execute(sql`
        INSERT INTO allowed_clients (email, name) VALUES (${email}, 'Cliente B (duplicata)')
      `)
    );
  });
});
