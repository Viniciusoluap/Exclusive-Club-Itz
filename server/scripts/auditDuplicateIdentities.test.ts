import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Story 13 (Fase 1, DB-09/DB-14): prova que o script de auditoria detecta e
 * relata duplicatas corretamente. Usa `../db` mockado (não o banco real) —
 * depois da migration 0002, allowed_clients.email/users.openId/users.email
 * já rejeitam duplicatas via UNIQUE, então não é mais possível semear uma
 * duplicata real nessas colunas para testar a detecção; a lógica de
 * agrupamento/relato em si (o que este script realmente faz) é testada
 * isoladamente aqui. A rejeição em si (constraint funcionando) está coberta
 * por server/uniqueIdentityConstraints.test.ts contra o banco real.
 */
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../db";
import { auditDuplicateIdentities } from "./auditDuplicateIdentities";

const mockGetDb = vi.mocked(getDb);

function rowsFor(groups: Record<string, { count: number; ids: number[] }>) {
  return Object.entries(groups).map(([key, { count, ids }]) => ({
    dup_key: key,
    dup_count: count,
    dup_ids: ids.join(","),
  }));
}

describe("auditDuplicateIdentities - Story 13", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reporta duplicatas encontradas e tabelas limpas corretamente", async () => {
    const execute = vi
      .fn()
      // users.openId — 1 duplicata
      .mockResolvedValueOnce([rowsFor({ "open-1": { count: 2, ids: [10, 11] } })])
      // users.email — sem duplicata
      .mockResolvedValueOnce([[]])
      // allowed_clients.email — 1 duplicata
      .mockResolvedValueOnce([rowsFor({ "dup@example.com": { count: 2, ids: [5, 6] } })])
      // employees.email — sem duplicata
      .mockResolvedValueOnce([[]]);
    mockGetDb.mockResolvedValue({ execute } as any);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let output: string;
    try {
      await auditDuplicateIdentities();
      // Captura antes de mockRestore() — ele também limpa .mock.calls.
      output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    } finally {
      logSpy.mockRestore();
    }

    expect(output).toContain("users.open_id: 1 valor(es) duplicado(s)");
    expect(output).toContain('"open-1" aparece 2x (ids: 10, 11)');
    expect(output).toContain("✅ users.email (ignorando NULL): nenhuma duplicata encontrada.");
    expect(output).toContain("allowed_clients.email: 1 valor(es) duplicado(s)");
    expect(output).toContain('"dup@example.com" aparece 2x (ids: 5, 6)');
    expect(output).toContain("✅ employees.email: nenhuma duplicata encontrada.");
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it("não reporta nada quando não há duplicatas em nenhuma tabela", async () => {
    const execute = vi.fn().mockResolvedValue([[]]);
    mockGetDb.mockResolvedValue({ execute } as any);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let output: string;
    try {
      await auditDuplicateIdentities();
      output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    } finally {
      logSpy.mockRestore();
    }

    expect(output).not.toContain("valor(es) duplicado(s)");
    expect(output).toContain("✅ employees.email: nenhuma duplicata encontrada.");
  });
});
