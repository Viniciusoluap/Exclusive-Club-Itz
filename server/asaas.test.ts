import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

/**
 * Teste de validação da API do Asaas
 * Verifica se a chave API está configurada corretamente
 *
 * Requer ASAAS_API_KEY (secret do repositório, ausente em PRs de forks) —
 * ver docs/reviews/fase0-known-test-failures.md. A URL base segue a mesma
 * detecção sandbox/produção usada em server/_core/asaas.ts (prefixo
 * $aact_prod_ = produção, qualquer outro = sandbox) — uma chave sandbox
 * contra api.asaas.com (produção) sempre falha com invalid_access_token.
 */
const hasAsaasKey = !!process.env.ASAAS_API_KEY;
const asaasBaseUrl = ENV.asaasApiKey.startsWith("$aact_prod_")
  ? "https://api.asaas.com/v3"
  : "https://sandbox.asaas.com/api/v3";

describe("Asaas API Integration", () => {
  it.skipIf(!hasAsaasKey)("should validate API key by fetching account info", async () => {
    console.log("🔑 Testando com chave:", ENV.asaasApiKey ? `${ENV.asaasApiKey.substring(0, 20)}...` : "VAZIA");

    const response = await fetch(`${asaasBaseUrl}/myAccount`, {
      method: "GET",
      headers: {
        "access_token": ENV.asaasApiKey,
      },
    });

    const text = await response.text();
    console.log("📥 Resposta recebida:", {
      status: response.status,
      ok: response.ok,
      bodyLength: text.length,
      body: text.substring(0, 200)
    });
    
    if (!response.ok) {
      console.error("❌ Erro na API Asaas:", {
        status: response.status,
        statusText: response.statusText,
        body: text
      });
    }
    
    expect(response.ok).toBe(true);
    
    const data = JSON.parse(text);
    
    // Verifica se retornou dados da conta
    expect(data).toHaveProperty("object");
    expect(data.object).toBe("account");
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("email");
    
    console.log("✅ Conta Asaas validada:", {
      name: data.name,
      email: data.email,
      company: data.company,
      status: data.status,
    });
  }, 10000);

  it.skipIf(!hasAsaasKey)("should be able to list customers", async () => {
    const response = await fetch(`${asaasBaseUrl}/customers?limit=1`, {
      method: "GET",
      headers: {
        "access_token": ENV.asaasApiKey,
      },
    });

    const text = await response.text();
    
    if (!response.ok) {
      console.error("❌ Erro ao listar clientes:", {
        status: response.status,
        statusText: response.statusText,
        body: text
      });
    }
    
    expect(response.ok).toBe(true);
    
    const data = JSON.parse(text);
    
    // Verifica se retornou estrutura de lista
    expect(data).toHaveProperty("object");
    expect(data.object).toBe("list");
    expect(data).toHaveProperty("data");
    expect(Array.isArray(data.data)).toBe(true);
    
    console.log("✅ API de clientes funcionando. Total:", data.totalCount);
  }, 10000);
});
