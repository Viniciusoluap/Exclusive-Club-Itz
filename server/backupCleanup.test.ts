/**
 * A regra de limpeza precisa remover repetição SEM deixar dia descoberto.
 *
 * Aqui o risco é o oposto do resto da auditoria: um erro não deixa de apagar,
 * apaga demais — e backup apagado não volta. Os testes fixam as garantias que
 * importam: um backup preservado por dia, o mais recente nunca removido, e o
 * dia calculado em São Paulo (não em UTC — senão tudo que roda depois das 21h
 * conta como o dia seguinte e a regra preserva o backup errado).
 *
 * Roda contra o banco real porque a regra VIVE no SQL (CONVERT_TZ, IN(...)):
 * um teste com banco falso validaria a minha imitação do banco, não a regra.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { previewCleanup, runCleanup } from "./backupCleanup";

const db = await getDb();

/** Insere um histórico controlado, do zero. */
async function semear(linhas: Array<{ id: number; status: string; startedAt: string }>) {
  await db!.execute(sql`DELETE FROM backup_history`);
  for (const l of linhas) {
    await db!.execute(sql`
      INSERT INTO backup_history (id, started_at, status)
      VALUES (${l.id}, ${l.startedAt}, ${l.status})
    `);
  }
}

async function idsRestantes(): Promise<number[]> {
  const raw = (await db!.execute(sql`SELECT id FROM backup_history ORDER BY id`)) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  return (Array.isArray(rows) ? rows : []).map((r: any) => Number(r.id));
}

/** started_at é gravado em UTC; -3h dá o horário de São Paulo. */
const diasAtras = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

describe.skipIf(!db)("limpeza de backups redundantes", () => {
  beforeEach(async () => {
    await db!.execute(sql`DELETE FROM backup_history`);
  });

  it("mantém exatamente um backup por dia e preserva o MAIS RECENTE de cada", async () => {
    await semear([
      { id: 100, status: "success", startedAt: "2026-08-07 14:00:00" },
      { id: 99, status: "success", startedAt: "2026-08-07 13:50:00" },
      { id: 98, status: "success", startedAt: "2026-08-07 13:40:00" },
      { id: 97, status: "success", startedAt: "2026-08-06 14:00:00" },
      { id: 96, status: "success", startedAt: "2026-08-06 13:00:00" },
      { id: 95, status: "success", startedAt: "2026-06-14 18:00:00" },
    ]);

    const p = await previewCleanup(db);
    expect(p.duplicados).toBe(3);
    expect(p.restantes).toBe(3);

    await runCleanup(db);
    expect(await idsRestantes()).toEqual([95, 97, 100]);
  });

  it("nunca remove o backup mais recente de todos", async () => {
    await semear([
      { id: 3, status: "success", startedAt: "2026-08-07 14:00:00" },
      { id: 2, status: "success", startedAt: "2026-08-07 13:00:00" },
      { id: 1, status: "success", startedAt: "2026-08-07 12:00:00" },
    ]);

    await runCleanup(db);
    expect(await idsRestantes()).toEqual([3]);
  });

  it("não remove um backup que é o único do seu dia", async () => {
    await semear([
      { id: 2, status: "success", startedAt: "2026-08-07 14:00:00" },
      { id: 1, status: "success", startedAt: "2026-06-14 18:00:00" },
    ]);

    const p = await previewCleanup(db);
    expect(p.total).toBe(0);

    await runCleanup(db);
    expect(await idsRestantes()).toEqual([1, 2]);
  });

  it("usa o dia de São Paulo, não o de UTC", async () => {
    // 08/08 00:30 UTC ainda é 07/08 21:30 em São Paulo. Em UTC estes dois
    // backups cairiam em dias diferentes e NENHUM seria removido; em São Paulo
    // são o mesmo dia e o mais antigo sai.
    await semear([
      { id: 2, status: "success", startedAt: "2026-08-08 00:30:00" },
      { id: 1, status: "success", startedAt: "2026-08-07 23:30:00" },
    ]);

    const p = await previewCleanup(db);
    expect(p.duplicados).toBe(1);

    await runCleanup(db);
    expect(await idsRestantes()).toEqual([2]);
  });

  it("remove falhas antigas, mas preserva as recentes", async () => {
    await semear([
      { id: 5, status: "success", startedAt: diasAtras(0) },
      { id: 4, status: "failed", startedAt: diasAtras(1) },
      { id: 3, status: "failed", startedAt: diasAtras(30) },
      { id: 2, status: "running", startedAt: diasAtras(40) },
    ]);

    const p = await previewCleanup(db);
    expect(p.falhasAntigas).toBe(2);
    expect(p.duplicados).toBe(0);

    await runCleanup(db);
    expect(await idsRestantes()).toEqual([4, 5]);
  });

  it("com a lista vazia, não faz nada", async () => {
    const r = await runCleanup(db);
    expect(r.removidos).toBe(0);
  });
});
