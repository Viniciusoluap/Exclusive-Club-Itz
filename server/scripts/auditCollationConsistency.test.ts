import { describe, expect, it } from "vitest";
import { auditCollationConsistency } from "./auditCollationConsistency";

/**
 * Story 14 (Fase 1, DB-20): prova contra o banco real (não mockado — o
 * ponto é justamente confirmar o information_schema de verdade) que todas
 * as colunas de email/client_email usam o mesmo charset/collation. Se uma
 * migration futura introduzir uma coluna de email com collation
 * divergente, este teste falha e avisa antes que isso vire um bug de join
 * silencioso em produção.
 */
describe("auditCollationConsistency - Story 14", () => {
  it("todas as colunas de email têm charset/collation consistentes", async () => {
    const { consistent, columns } = await auditCollationConsistency();

    expect(columns.length).toBeGreaterThan(0);
    expect(consistent).toBe(true);

    const collations = new Set(columns.map((c) => c.collation));
    expect(collations.size).toBe(1);
  });
});
