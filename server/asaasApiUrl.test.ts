import { describe, expect, it } from "vitest";
import { resolveAsaasApiUrl } from "./_core/asaas";

/**
 * Story 17 (Fase 1, SYS-04): resolveAsaasApiUrl é a fonte única da lógica
 * de decisão sandbox/produção — antes duplicada (com pequenas divergências
 * de fallback) em 6 lugares (server/_core/asaas.ts,
 * server/_core/asaasService.ts, server/cronJobs.ts, server/routers.ts x2,
 * server/routers/expensesRouter.ts). Todos foram migrados para chamar esta
 * função em vez de reimplementar o prefixo `$aact_prod_`.
 */
describe("resolveAsaasApiUrl - Story 17", () => {
  it("retorna a URL de produção para chave com prefixo $aact_prod_", () => {
    expect(resolveAsaasApiUrl("$aact_prod_abc123")).toBe("https://api.asaas.com/v3");
  });

  it("retorna a URL de sandbox para chave sem prefixo de produção", () => {
    expect(resolveAsaasApiUrl("$aact_hmlg_abc123")).toBe("https://sandbox.asaas.com/api/v3");
  });

  it("retorna sandbox por padrão para qualquer chave que não comece com $aact_prod_", () => {
    expect(resolveAsaasApiUrl("qualquer-outra-coisa")).toBe("https://sandbox.asaas.com/api/v3");
  });
});
