/**
 * O servidor drena os anexos sozinho — e sem atrapalhar o backup.
 *
 * POR QUE ESTE TESTE EXISTE: arquivar pelo botão da tela dependia de uma
 * requisição HTTP, e o proxy devolveu HTTP 503 no meio do caminho porque a
 * instância estava ocupada — havia um backup rodando ao mesmo tempo. A disputa
 * por recursos era a causa. Aqui o trabalho sai de dentro da requisição, e o
 * job se recusa a rodar enquanto um backup estiver em andamento.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const archiveAttachmentsBatch = vi.fn();
let dbAtual: any = null;

vi.mock("../db", () => ({
  getDb: async () => dbAtual,
}));

vi.mock("../backupAttachmentsArchive", () => ({
  archiveAttachmentsBatch: (...args: any[]) => archiveAttachmentsBatch(...args),
}));

const { runArchiveAttachmentsTick } = await import("./archiveAttachments");

/** db falso: responde quantos backups estão em execução. */
function fakeDb(backupsRodando: number) {
  return {
    async execute() {
      return [[{ total: backupsRodando }]];
    },
  };
}

beforeEach(() => {
  archiveAttachmentsBatch.mockReset();
  archiveAttachmentsBatch.mockResolvedValue({
    total: 238,
    archived: 12,
    failed: 0,
    remaining: 226,
    processedNow: 8,
    done: false,
  });
  dbAtual = fakeDb(0);
});

describe("job de arquivamento de anexos", () => {
  it("arquiva um lote quando não há backup em andamento", async () => {
    const r = await runArchiveAttachmentsTick();

    expect(r.skipped).toBe(false);
    expect(r.archived).toBe(12);
    expect(r.remaining).toBe(226);
    expect(archiveAttachmentsBatch).toHaveBeenCalledTimes(1);
  });

  it("NÃO roda enquanto um backup está em execução", async () => {
    // Foi exatamente essa disputa que produziu o HTTP 503 em produção.
    dbAtual = fakeDb(1);

    const r = await runArchiveAttachmentsTick();

    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("backup em andamento");
    expect(archiveAttachmentsBatch).not.toHaveBeenCalled();
  });

  it("uma rodada que falha não derruba o processo — a próxima tenta de novo", async () => {
    archiveAttachmentsBatch.mockRejectedValue(new Error("storage fora do ar"));

    const r = await runArchiveAttachmentsTick();

    expect(r.skipped).toBe(true);
    expect(r.reason).toContain("storage fora do ar");
  });

  it("sem banco disponível, apenas ignora a rodada", async () => {
    dbAtual = null;

    const r = await runArchiveAttachmentsTick();

    expect(r.skipped).toBe(true);
    expect(archiveAttachmentsBatch).not.toHaveBeenCalled();
  });
});
