/**
 * Recuperar de volta um anexo arquivado — a metade que faltava.
 *
 * POR QUE ESTE TESTE EXISTE: até 05/09/2026 o sistema sabia ARQUIVAR anexos e
 * LISTAR o índice, mas não tinha nenhuma forma de trazer um arquivo de volta —
 * via de mão única. Relatado em produção quando um administrador tentou
 * recuperar o documento pessoal de um cliente e não havia nenhum jeito de
 * pegar o arquivo, só o índice dizendo onde ele supostamente estava.
 *
 * Estes casos não dependem do storage externo (Forge) — cobrem as duas
 * respostas que a função dá SEM baixar nada: id inexistente e anexo que nunca
 * chegou a ser arquivado com sucesso. O caminho feliz (descriptografar um
 * arquivo de verdade) depende de credenciais reais de storage e não é
 * reproduzível em CI.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { downloadArchivedAttachment } from "./backupAttachmentsArchive";

const db = await getDb();

describe.skipIf(!db)("downloadArchivedAttachment", () => {
  it("devolve erro claro quando o id não existe no índice", async () => {
    const resultado = await downloadArchivedAttachment(db, 999999999);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toContain("não encontrado");
  });

  it("nunca tenta baixar um anexo que falhou ao arquivar — devolve o motivo original", async () => {
    await db!.execute(sql`
      INSERT IGNORE INTO backup_attachments (source_url, category, file_name, status, error_message)
      VALUES ('https://cdn.exemplo/restore-teste-falhou.jpg', 'vistorias', 'restore-teste-falhou.jpg', 'failed', 'Request failed with status code 404')
    `);
    const raw = (await db!.execute(
      sql`SELECT id FROM backup_attachments WHERE source_url = 'https://cdn.exemplo/restore-teste-falhou.jpg'`,
    )) as any;
    const rows = Array.isArray(raw[0]) ? raw[0] : raw;
    const id = Number(rows[0].id);

    try {
      const resultado = await downloadArchivedAttachment(db, id);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) expect(resultado.error).toContain("404");
    } finally {
      await db!.execute(sql`DELETE FROM backup_attachments WHERE source_url = 'https://cdn.exemplo/restore-teste-falhou.jpg'`);
    }
  });
});
