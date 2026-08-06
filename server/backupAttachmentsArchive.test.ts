/**
 * A tabela de controle precisa existir mesmo sem a migração aplicada.
 *
 * POR QUE ESTE TESTE EXISTE: a migração `0005_backup_attachments` passou no CI
 * e mesmo assim o botão "Arquivar anexos" quebrou em produção com
 * "Failed query: SELECT source_url FROM backup_attachments". A causa é que a
 * hospedagem publica o código novo mas não roda as migrações — o CI validava
 * que a migração APLICA, nunca que ela CHEGOU no banco de produção.
 *
 * O teste abaixo reproduz exatamente essa situação: derruba a tabela e chama a
 * função. Se ela voltar a depender da migração ter sido aplicada, isto falha.
 */

import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { getArchiveProgress } from "./backupAttachmentsArchive";

const db = await getDb();

describe.skipIf(!db)("backupAttachmentsArchive — tabela ausente", () => {
  it("cria a tabela de controle quando ela não existe", async () => {
    await db!.execute(sql`DROP TABLE IF EXISTS backup_attachments`);

    // Sem o CREATE TABLE IF NOT EXISTS, esta chamada estoura com
    // ER_NO_SUCH_TABLE — que é o erro visto em produção.
    const progress = await getArchiveProgress(db);

    expect(progress.archived).toBe(0);
    expect(progress.failed).toBe(0);
    expect(progress.total).toBeGreaterThanOrEqual(0);
  });

  it("é idempotente: chamar de novo com a tabela já existente não quebra", async () => {
    await getArchiveProgress(db);
    const progress = await getArchiveProgress(db);
    expect(progress).toBeDefined();
  });

  it("preserva a restrição UNIQUE de que o INSERT IGNORE depende", async () => {
    await db!.execute(sql`DROP TABLE IF EXISTS backup_attachments`);
    await getArchiveProgress(db);

    await db!.execute(sql`
      INSERT IGNORE INTO backup_attachments (source_url, category, file_name, status)
      VALUES ('https://cdn.x/dup.jpg', 'vistorias', 'a.jpg', 'archived')
    `);
    // A segunda inserção da MESMA url precisa ser ignorada, não duplicada.
    await db!.execute(sql`
      INSERT IGNORE INTO backup_attachments (source_url, category, file_name, status)
      VALUES ('https://cdn.x/dup.jpg', 'vistorias', 'b.jpg', 'archived')
    `);

    const raw = (await db!.execute(
      sql`SELECT COUNT(*) AS total FROM backup_attachments WHERE source_url = 'https://cdn.x/dup.jpg'`,
    )) as any;
    const rows = Array.isArray(raw[0]) ? raw[0] : raw;
    expect(Number(rows[0].total)).toBe(1);

    await db!.execute(sql`DELETE FROM backup_attachments WHERE source_url = 'https://cdn.x/dup.jpg'`);
  });
});
