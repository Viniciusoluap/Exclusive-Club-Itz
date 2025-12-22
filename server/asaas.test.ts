import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

/**
 * Teste de validação da API do Asaas
 * Verifica se a chave API está configurada corretamente
 */
describe("Asaas API Integration", () => {
  it("should validate API key by fetching account info", async () => {
    console.log("🔑 Testando com chave:", ENV.asaasApiKey ? `${ENV.asaasApiKey.substring(0, 20)}...` : "VAZIA");
    
    const response = await fetch("https://api.asaas.com/v3/myAccount", {
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

  it("should be able to list customers", async () => {
    const response = await fetch("https://api.asaas.com/v3/customers?limit=1", {
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
