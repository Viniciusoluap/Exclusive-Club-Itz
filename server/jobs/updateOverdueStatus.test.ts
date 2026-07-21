import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Story 10 (Fase 1, SYS-23): testa o módulo real (não uma reimplementação
 * local da lógica, como o teste anterior fazia — isso nunca pegaria uma
 * regressão real no arquivo). Mocka `../db` e `../_core/notification` para
 * cobrir os caminhos que dependem de uma falha de fato (difícil de forçar
 * contra um banco real sem quebrar a conexão) — a cobertura de atomicidade,
 * fuso horário e idempotência contra um banco real está em
 * updateOverdueStatus.integration.test.ts.
 */
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { getDb } from "../db";
import { notifyOwner } from "../_core/notification";
import { runUpdateOverdueStatus } from "./updateOverdueStatus";

const mockGetDb = vi.mocked(getDb);
const mockNotifyOwner = vi.mocked(notifyOwner);

function createMockTx(affectedRowsSequence: number[]) {
  const execute = vi.fn();
  affectedRowsSequence.forEach((affectedRows) => {
    execute.mockResolvedValueOnce([{ affectedRows }]);
  });
  return { execute };
}

describe("runUpdateOverdueStatus (Story 10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna zeros e success:false quando o banco não está disponível (sem alertar)", async () => {
    mockGetDb.mockResolvedValue(null as any);

    const result = await runUpdateOverdueStatus();

    expect(result).toEqual({ inspectionCharges: 0, bpoCharges: 0, fuelRecords: 0, total: 0, success: false });
    expect(mockNotifyOwner).not.toHaveBeenCalled();
  });

  it("soma corretamente os registros atualizados dentro de uma única transação", async () => {
    const tx = createMockTx([5, 3, 2]);
    const transaction = vi.fn().mockImplementation(async (cb: any) => cb(tx));
    mockGetDb.mockResolvedValue({ transaction } as any);

    const result = await runUpdateOverdueStatus();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ inspectionCharges: 5, bpoCharges: 3, fuelRecords: 2, total: 10, success: true });
    expect(mockNotifyOwner).not.toHaveBeenCalled();
  });

  it("quando a transação falha no meio, reverte tudo, retorna success:false e alerta o proprietário", async () => {
    const tx = {
      execute: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 5 }]) // inspection_charges: sucesso
        .mockRejectedValueOnce(new Error("Deadlock simulado")), // bpo_charges: falha no meio
    };
    const transaction = vi.fn().mockImplementation(async (cb: any) => cb(tx));
    mockGetDb.mockResolvedValue({ transaction } as any);

    const result = await runUpdateOverdueStatus();

    // A falha no meio não deixa nenhum contador "pela metade" no retorno —
    // toda a transação é tratada como perdida (rollback real fica a cargo do
    // driver, comprovado em server/db.transaction.test.ts).
    expect(result).toEqual({ inspectionCharges: 0, bpoCharges: 0, fuelRecords: 0, total: 0, success: false });
    expect(mockNotifyOwner).toHaveBeenCalledTimes(1);
    const alertPayload = mockNotifyOwner.mock.calls[0][0];
    expect(alertPayload.title).toMatch(/Falha/i);
    expect(alertPayload.content).toContain("Deadlock simulado");
  });
});
