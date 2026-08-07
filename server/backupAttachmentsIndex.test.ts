/**
 * O índice dos anexos precisa estar DENTRO do backup do banco.
 *
 * POR QUE ESTE TESTE EXISTE: o zip do backup tem ~320 KB e as 238 fotos e
 * documentos não estão nele — ficam à parte, criptografados no armazenamento.
 * Isso é decisão de projeto (juntá-los fazia o backup inteiro morrer no meio),
 * mas cria uma dependência frágil: o único lugar que sabe ONDE cada anexo foi
 * parar é a tabela `backup_attachments`.
 *
 * Se essa tabela não entrar no dump, restaurar o banco recupera o sistema e
 * perde para sempre a referência dos 238 arquivos — eles viram blobs
 * criptografados órfãos no armazenamento, sem nome, sem dono e sem categoria.
 *
 * O export percorre `SHOW TABLES`, então a tabela entra. Este teste garante
 * que continue entrando: fixa que o dump não filtra tabelas e que a linha de
 * um anexo arquivado aparece no SQL gerado.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync, existsSync, unlinkSync } from "fs";
import path from "path";
import os from "os";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { exportDatabaseToSQL } from "./databaseBackup";
import { listArchivedAttachments } from "./backupAttachmentsArchive";

const db = await getDb();

const URL_ANEXO = "https://cdn.exemplo/contrato-cliente-42.pdf";
const URL_STORAGE = "https://storage.exemplo/backups/anexos/clientes/cliente-42-contrato.pdf.enc";

describe.skipIf(!db)("índice dos anexos dentro do backup do banco", () => {
  beforeEach(async () => {
    await db!.execute(sql`
      CREATE TABLE IF NOT EXISTS backup_attachments (
        id int AUTO_INCREMENT NOT NULL,
        source_url varchar(500) NOT NULL,
        category varchar(50) NOT NULL,
        file_name varchar(255) NOT NULL,
        storage_url text,
        size_bytes int,
        status enum('archived','failed') NOT NULL,
        error_message text,
        archived_at timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT backup_attachments_id PRIMARY KEY(id),
        CONSTRAINT backup_attachments_source_url_unique UNIQUE(source_url)
      )
    `);
    await db!.execute(sql`DELETE FROM backup_attachments`);
  });

  it("a tabela de anexos e seus dados entram no SQL exportado", async () => {
    await db!.execute(sql`
      INSERT INTO backup_attachments (source_url, category, file_name, storage_url, size_bytes, status)
      VALUES (${URL_ANEXO}, 'clientes', 'cliente-42-contrato.pdf', ${URL_STORAGE}, 20480, 'archived')
    `);

    const destino = path.join(os.tmpdir(), `dump-teste-${Date.now()}.sql`);
    try {
      await exportDatabaseToSQL(destino);
      const sqlGerado = readFileSync(destino, "utf8");

      // A estrutura da tabela precisa estar lá...
      expect(sqlGerado).toContain("backup_attachments");
      // ...e o conteúdo também: sem a URL de armazenamento, o arquivo
      // criptografado fica órfão e irrecuperável depois de uma restauração.
      expect(sqlGerado).toContain(URL_STORAGE);
      expect(sqlGerado).toContain(URL_ANEXO);
    } finally {
      if (existsSync(destino)) unlinkSync(destino);
    }
  });

  it("o índice devolve origem, destino e tamanho de cada anexo", async () => {
    await db!.execute(sql`
      INSERT INTO backup_attachments (source_url, category, file_name, storage_url, size_bytes, status)
      VALUES (${URL_ANEXO}, 'clientes', 'cliente-42-contrato.pdf', ${URL_STORAGE}, 20480, 'archived')
    `);

    const indice = await listArchivedAttachments(db);
    const item = indice.find((i) => i.origem === URL_ANEXO);

    expect(item).toBeDefined();
    expect(item!.categoria).toBe("clientes");
    expect(item!.armazenamento).toBe(URL_STORAGE);
    expect(item!.bytes).toBe(20480);
    expect(item!.situacao).toBe("archived");
  });

  it("anexos com falha aparecem no índice com o motivo", async () => {
    // Um anexo que falhou precisa ser visível: é justamente o que NÃO está
    // salvo, e some se o índice mostrar apenas os que deram certo.
    await db!.execute(sql`
      INSERT INTO backup_attachments (source_url, category, file_name, status, error_message)
      VALUES ('https://cdn.exemplo/perdido.jpg', 'vistorias', 'vistoria-9.jpg', 'failed', 'Request failed with status code 404')
    `);

    const indice = await listArchivedAttachments(db);
    const item = indice.find((i) => i.arquivo === "vistoria-9.jpg");

    expect(item!.situacao).toBe("failed");
    expect(item!.erro).toContain("404");
    expect(item!.armazenamento).toBeNull();
  });
});
