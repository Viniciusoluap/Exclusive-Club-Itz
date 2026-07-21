import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

/**
 * Story 8 (Fase 1, DB-17): prova empírica de que db.transaction() reverte
 * TUDO quando uma escrita no meio falha — não basta assumir esse
 * comportamento do driver, os fluxos financeiros (fuelRecords.create,
 * fuelRecords.markAsPaid, inspectionCharges.markAsPaid) passaram a depender
 * dele para eliminar estado parcial.
 *
 * Usa a tabela `vessels` (schema simples, sem relação com dinheiro) como
 * cenário isolado, em vez de replicar a lógica de negócio complexa dos
 * routers — o que importa aqui é validar a primitiva de atomicidade em si,
 * contra a conexão pooled real (Story 7), não uma simulação.
 */
describe("db.transaction() - Story 8 (rollback em falha no meio da transação)", () => {
  it("reverte TODAS as escritas quando uma falha no meio", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const marker = `Teste rollback ${Date.now()}`;

    await expect(
      db.transaction(async (tx) => {
        // 1ª escrita: válida, deveria "pegar" se não fosse revertida
        await tx.execute(sql`
          INSERT INTO vessels (name, type) VALUES (${marker}, 'lancha')
        `);

        // 2ª escrita: viola a constraint do enum de `type` — força a
        // transação inteira a falhar no meio, exatamente o cenário do AC.
        await tx.execute(sql`
          INSERT INTO vessels (name, type) VALUES (${marker + " (segunda linha)"}, 'tipo-invalido')
        `);
      })
    ).rejects.toThrow();

    // Nenhuma das duas linhas deve existir — não só a segunda (que falhou),
    // mas também a primeira (que teria sucesso sozinha).
    const result = (await db.execute(sql`
      SELECT COUNT(*) as count FROM vessels WHERE name LIKE ${marker + "%"}
    `)) as any;
    const row = Array.isArray(result[0]) ? result[0][0] : result[0];
    expect(Number(row.count)).toBe(0);
  });

  it("confirma (caminho feliz) que todas as escritas persistem quando a transação inteira dá certo", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const marker = `Teste rollback ok ${Date.now()}`;

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO vessels (name, type) VALUES (${marker}, 'lancha')
      `);
      await tx.execute(sql`
        INSERT INTO vessels (name, type) VALUES (${marker + " (segunda linha)"}, 'jetski')
      `);
    });

    const result = (await db.execute(sql`
      SELECT COUNT(*) as count FROM vessels WHERE name LIKE ${marker + "%"}
    `)) as any;
    const row = Array.isArray(result[0]) ? result[0][0] : result[0];
    expect(Number(row.count)).toBe(2);

    // Limpeza (test-global-setup.ts também cobre "Teste%", mas evita
    // depender só do teardown global para não deixar lixo entre execuções).
    await db.execute(sql`DELETE FROM vessels WHERE name LIKE ${marker + "%"}`);
  });
});
