/**
 * O lote precisa ser fechado pelo RELÓGIO, não por contagem de arquivos.
 *
 * POR QUE ESTE TESTE EXISTE: o lote era de 5 arquivos fixos. Cinco fotos
 * pequenas terminam em segundos; cinco fotos grandes levam minutos — e aí o
 * proxy da hospedagem encerra a requisição e devolve uma página HTML de erro,
 * que o navegador não consegue interpretar. O sintoma que chegou ao usuário foi
 * "The string did not match the expected pattern.", que não diz nada sobre a
 * causa real.
 *
 * Contar arquivos não controla tempo. Estes testes fixam o comportamento que
 * controla: cada chamada respeita um orçamento de tempo, mas sempre avança pelo
 * menos um arquivo — senão o laço do frontend nunca terminaria.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const encryptBackupBuffer = vi.fn((buf: Buffer) => buf);
const storagePut = vi.fn(async () => ({ url: "https://storage/x.enc" }));
let downloadDelayMs = 0;

vi.mock("axios", () => ({
  default: {
    get: async () => {
      await new Promise((r) => setTimeout(r, downloadDelayMs));
      return { data: Buffer.from("conteudo") };
    },
  },
}));

vi.mock("./backup", () => ({
  getBackupEncryptionKey: () => Buffer.alloc(32),
  encryptBackupBuffer: (buf: Buffer) => encryptBackupBuffer(buf),
}));

vi.mock("./storage", () => ({
  storagePut: () => storagePut(),
}));

vi.mock("./_core/urlSafety", () => ({
  assertSafeExternalUrl: () => {},
}));

const { archiveAttachmentsBatch } = await import("./backupAttachmentsArchive");

/** db falso: N anexos de clientes pendentes, nada arquivado ainda. */
function fakeDb(quantidade: number) {
  const inseridos: string[] = [];
  return {
    inseridos,
    async execute(statement: any) {
      const text = (statement?.queryChunks ?? [])
        .map((c: any) => (Array.isArray(c?.value) ? c.value.join("") : String(c?.value ?? "")))
        .join(" ");

      if (text.includes("CREATE TABLE")) return [[]];
      if (text.includes("INSERT IGNORE")) {
        inseridos.push("x");
        return [[]];
      }
      if (text.includes("GROUP BY")) return [[]];
      if (text.includes("SELECT source_url FROM backup_attachments")) return [[]];
      if (text.includes("allowed_clients")) {
        return [
          Array.from({ length: quantidade }, (_, i) => ({
            id: i + 1,
            document_url: `https://cdn.x/doc-${i}.pdf`,
            contract_url: null,
            contract2_url: null,
          })),
        ];
      }
      return [[]];
    },
  };
}

beforeEach(() => {
  downloadDelayMs = 0;
  storagePut.mockClear();
});

describe("orçamento de tempo do arquivamento", () => {
  it("para de processar quando o orçamento acaba, em vez de seguir até o fim da lista", async () => {
    downloadDelayMs = 30;
    const db = fakeDb(50);

    // Orçamento curto: cabem poucos arquivos, não os 50.
    const p = await archiveAttachmentsBatch(db as any, 50, 100);

    expect(p.processedNow).toBeGreaterThan(0);
    expect(p.processedNow).toBeLessThan(50);
    expect(p.done).toBe(false);
    expect(p.remaining).toBe(50 - p.processedNow);
  });

  it("processa pelo menos um arquivo mesmo com orçamento zerado", async () => {
    // Sem esta garantia, um arquivo lento faria toda chamada voltar com
    // processedNow = 0 e o laço do frontend giraria para sempre sem avançar.
    downloadDelayMs = 20;
    const db = fakeDb(10);

    const p = await archiveAttachmentsBatch(db as any, 10, 0);

    expect(p.processedNow).toBe(1);
    expect(p.remaining).toBe(9);
  });

  it("com arquivos rápidos, aproveita o orçamento e termina a lista", async () => {
    downloadDelayMs = 0;
    const db = fakeDb(8);

    const p = await archiveAttachmentsBatch(db as any, 25, 5000);

    expect(p.processedNow).toBe(8);
    expect(p.remaining).toBe(0);
    expect(p.done).toBe(true);
  });

  it("respeita o teto de arquivos por chamada mesmo com orçamento sobrando", async () => {
    downloadDelayMs = 0;
    const db = fakeDb(30);

    const p = await archiveAttachmentsBatch(db as any, 4, 60000);

    expect(p.processedNow).toBe(4);
    expect(p.done).toBe(false);
  });
});
