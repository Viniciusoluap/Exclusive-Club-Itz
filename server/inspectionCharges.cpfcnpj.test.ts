import { describe, expect, it } from "vitest";
import { getOrCreateCustomer } from "./_core/asaas";

/**
 * Teste para validar que a correção do bug de CPF/CNPJ está funcionando
 * 
 * Bug original: Ao criar cobrança de "Reparo da Embarcação", o Asaas retornava erro:
 * "invalid_customer.cpfCnpj" - "Para criar esta cobrança é necessário preencher o CPF ou CNPJ do cliente"
 * 
 * Causa raiz: A tabela allowed_clients não tinha campo cpf_cnpj e o código não estava
 * passando esse campo ao criar o customer no Asaas
 * 
 * Correção aplicada:
 * 1. Adicionado campo cpf_cnpj na tabela allowed_clients
 * 2. Query de busca de cotas agora inclui ac.cpf_cnpj
 * 3. Chamada getOrCreateCustomer agora passa cpfCnpj do cliente
 *
 * Requer ASAAS_API_KEY (secret do repositório, ausente em PRs de forks) —
 * ver docs/reviews/fase0-known-test-failures.md.
 */
const hasAsaasKey = !!process.env.ASAAS_API_KEY;

describe("inspectionCharges - Correção Bug CPF/CNPJ em Reparos", () => {
  it.skipIf(!hasAsaasKey)("getOrCreateCustomer aceita cpfCnpj como parâmetro", async () => {
    const customer = await getOrCreateCustomer({
      name: "Test Client with CPF",
      email: "test-cpf-fix@example.com",
      cpfCnpj: "24971563792", // CPF válido de teste
    });

    // Validar que retornou um customer válido
    expect(customer).toBeDefined();
    expect(customer.id).toBeDefined();
    expect(typeof customer.id).toBe("string");
    
    // ID do Asaas deve começar com "cus_"
    expect(customer.id).toMatch(/^cus_/);
    
    // Email deve estar correto
    expect(customer.email).toBe("test-cpf-fix@example.com");
    
    // CPF deve estar salvo (se API retornar)
    if (customer.cpfCnpj) {
      expect(customer.cpfCnpj).toBe("24971563792");
    }
  });

  it.skipIf(!hasAsaasKey)("getOrCreateCustomer funciona mesmo sem cpfCnpj (retrocompatibilidade)", async () => {
    const customer = await getOrCreateCustomer({
      name: "Test Client without CPF",
      email: "test-no-cpf@example.com",
    });

    // Validar que retornou um customer válido
    expect(customer).toBeDefined();
    expect(customer.id).toBeDefined();
    expect(typeof customer.id).toBe("string");
    
    // ID do Asaas deve começar com "cus_"
    expect(customer.id).toMatch(/^cus_/);
    
    // Email deve estar correto
    expect(customer.email).toBe("test-no-cpf@example.com");
  });

  it.skipIf(!hasAsaasKey)("getOrCreateCustomer aceita CNPJ (14 dígitos)", async () => {
    const customer = await getOrCreateCustomer({
      name: "Test Company",
      email: "test-cnpj-fix@example.com",
      cpfCnpj: "07526557000100", // CNPJ válido de teste
    });

    // Validar que retornou um customer válido
    expect(customer).toBeDefined();
    expect(customer.id).toBeDefined();
    expect(typeof customer.id).toBe("string");
    
    // ID do Asaas deve começar com "cus_"
    expect(customer.id).toMatch(/^cus_/);
    
    // Email deve estar correto
    expect(customer.email).toBe("test-cnpj-fix@example.com");
    
    // CNPJ deve estar salvo (se API retornar)
    if (customer.cpfCnpj) {
      expect(customer.cpfCnpj).toBe("07526557000100");
    }
  });
});
