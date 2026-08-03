/**
 * Inclusão dos anexos no backup.
 *
 * Antes, o backup guardava apenas as URLs dos arquivos: se o storage externo se
 * perdesse, restavam links quebrados e nenhuma foto ou documento. Estes testes
 * cobrem a coleta das URLs no banco e a honestidade do manifesto — sem precisar
 * de banco nem de rede.
 */

import { describe, expect, it } from "vitest";
import { collectAttachments, buildManifest, type AttachmentReport } from "./backupFiles";

/** db falso: devolve linhas fixas por tabela consultada. */
function fakeDb(rowsByTable: Record<string, any[]>) {
  return {
    async execute(statement: any) {
      // Reconstrói o SQL a partir dos pedaços do template do drizzle.
      const text = (statement?.queryChunks ?? [])
        .map((c: any) => (typeof c?.value === "object" ? c.value.join("") : String(c?.value ?? "")))
        .join(" ");
      const table = Object.keys(rowsByTable).find((t) => text.includes(t));
      return [table ? rowsByTable[table] : []];
    },
  };
}

describe("collectAttachments", () => {
  it("coleta documentos e contratos dos clientes", async () => {
    const db = fakeDb({
      allowed_clients: [
        { id: 7, document_url: "https://cdn.x/doc.pdf", contract_url: "https://cdn.x/c1.pdf", contract2_url: null },
      ],
    });
    const items = await collectAttachments(db);
    const clientes = items.filter((i) => i.category === "clientes");
    expect(clientes.map((i) => i.url)).toEqual(["https://cdn.x/doc.pdf", "https://cdn.x/c1.pdf"]);
    // Nome carrega o id, para dar para saber de quem é o arquivo na restauração.
    expect(clientes[0].name).toContain("cliente-7-documento");
  });

  it("coleta fotos de abastecimento, inclusive as por galão", async () => {
    const db = fakeDb({
      fuel_records: [{ id: 1, photo_before_url: "https://cdn.x/a.jpg", photo_after_url: "https://cdn.x/b.jpg", receipt_url: null }],
      fuel_record_containers: [{ id: 5, photo_before_url: "https://cdn.x/g1.jpg", photo_after_url: null }],
    });
    const items = await collectAttachments(db);
    const abast = items.filter((i) => i.category === "abastecimento");
    expect(abast).toHaveLength(3);
    expect(abast.some((i) => i.name.includes("galao-5-antes"))).toBe(true);
  });

  it("extrai as fotos de vistoria do JSON de itens reprovados", async () => {
    const db = fakeDb({
      inspections: [
        {
          id: 9,
          reprovation_photos: JSON.stringify([
            { itemName: "Casco", photoUrl: "https://cdn.x/casco.jpg" },
            { itemName: "Motor", photoUrl: "https://cdn.x/motor.jpg" },
          ]),
        },
      ],
    });
    const items = await collectAttachments(db);
    const vistorias = items.filter((i) => i.category === "vistorias");
    expect(vistorias).toHaveLength(2);
    expect(vistorias[0].name).toContain("vistoria-9-Casco");
  });

  it("não quebra com JSON inválido de vistoria", async () => {
    const db = fakeDb({ inspections: [{ id: 9, reprovation_photos: "{isso não é json" }] });
    await expect(collectAttachments(db)).resolves.toEqual([]);
  });

  it("ignora URLs vazias e não duplica a mesma URL", async () => {
    const db = fakeDb({
      allowed_clients: [
        { id: 1, document_url: "https://cdn.x/mesmo.pdf", contract_url: "   ", contract2_url: null },
        { id: 2, document_url: "https://cdn.x/mesmo.pdf", contract_url: "", contract2_url: null },
      ],
    });
    const items = await collectAttachments(db);
    expect(items).toHaveLength(1);
  });
});

describe("buildManifest", () => {
  it("declara explicitamente o que NÃO entrou no backup", () => {
    const report: AttachmentReport = {
      total: 3,
      downloaded: 2,
      totalBytes: 1024 * 1024,
      failed: [{ url: "https://cdn.x/perdido.jpg", category: "vistorias", reason: "404 Not Found" }],
    };
    const txt = buildManifest(report);
    expect(txt).toContain("Anexos encontrados no banco: 3");
    expect(txt).toContain("Anexos incluídos no backup:  2");
    expect(txt).toContain("NÃO estão neste backup");
    expect(txt).toContain("https://cdn.x/perdido.jpg");
    expect(txt).toContain("404 Not Found");
  });

  it("afirma completude apenas quando nada falhou", () => {
    const txt = buildManifest({ total: 2, downloaded: 2, totalBytes: 10, failed: [] });
    expect(txt).toContain("Todos os anexos referenciados no banco foram incluídos.");
  });
});
