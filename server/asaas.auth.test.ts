import { describe, expect, it } from "vitest";
import * as asaas from "./_core/asaas";

/**
 * Testes de autenticação e integração com API Asaas
 *
 * Estes testes validam:
 * 1. Credenciais ASAAS_API_KEY configuradas
 * 2. Autenticação básica com API Asaas
 * 3. Busca de clientes por email
 * 4. Criação de clientes
 * 5. Criação de cobranças
 *
 * Os testes que fazem chamadas reais à API sandbox da Asaas são pulados
 * quando ASAAS_API_KEY não está configurada (ex: PRs de forks, que não têm
 * acesso a secrets do repositório) — ver docs/reviews/fase0-known-test-failures.md.
 */
const hasAsaasKey = !!process.env.ASAAS_API_KEY;

describe("Asaas API - Autenticação e Credenciais", () => {
  it("deve ter ASAAS_API_KEY configurada", () => {
    const apiKey = process.env.ASAAS_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey).not.toBe("");
    expect(typeof apiKey).toBe("string");
  });

  it("deve determinar ambiente correto (sandbox ou produção)", () => {
    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) {
      throw new Error("ASAAS_API_KEY não configurada");
    }

    // Sandbox keys começam com $aact_YTU5YTE0M
    // Production keys começam com $aact_prod_
    const isSandbox = !apiKey.startsWith('$aact_prod_');
    const isProduction = apiKey.startsWith('$aact_prod_');

    expect(isSandbox || isProduction).toBe(true);
    console.log(`[Asaas] Ambiente detectado: ${isProduction ? 'PRODUÇÃO' : 'SANDBOX'}`);
  });
});

describe("Asaas API - Busca e Criação de Clientes", () => {
  it.skipIf(!hasAsaasKey)("deve buscar ou criar cliente por email", async () => {
    const testEmail = `teste-${Date.now()}@exclusiveclubitz.com`;
    
    try {
      const customer = await asaas.getOrCreateCustomer({
        name: "Cliente Teste Automático",
        email: testEmail,
      });

      expect(customer).toBeDefined();
      expect(customer.id).toBeDefined();
      expect(typeof customer.id).toBe("string");
      expect(customer.email).toBe(testEmail);
      
      console.log(`[Asaas] Cliente criado com sucesso: ${customer.id}`);
    } catch (error: any) {
      console.error("[Asaas] Erro ao buscar/criar cliente:", error.message);
      throw error;
    }
  }, 15000); // Timeout de 15s para chamadas de API

  it.skipIf(!hasAsaasKey)("deve retornar cliente existente ao buscar por email duplicado", async () => {
    const testEmail = `teste-duplicado-${Date.now()}@exclusiveclubitz.com`;
    
    try {
      // Primeira criação
      const customer1 = await asaas.getOrCreateCustomer({
        name: "Cliente Teste Duplicado",
        email: testEmail,
      });

      // Segunda tentativa (deve retornar o mesmo)
      const customer2 = await asaas.getOrCreateCustomer({
        name: "Cliente Teste Duplicado 2",
        email: testEmail,
      });

      expect(customer1.id).toBe(customer2.id);
      console.log(`[Asaas] Cliente existente retornado corretamente: ${customer1.id}`);
    } catch (error: any) {
      console.error("[Asaas] Erro ao testar duplicação:", error.message);
      throw error;
    }
  }, 20000);
});

describe("Asaas API - Criação de Cobranças", () => {
  it.skipIf(!hasAsaasKey)("deve criar cobrança com sucesso", async () => {
    const testEmail = `teste-cobranca-${Date.now()}@exclusiveclubitz.com`;
    
    try {
      // Primeiro cria o cliente (cpfCnpj obrigatório: Asaas rejeita criação de
      // cobrança para cliente sem CPF/CNPJ, mesmo cadastro válido de teste
      // usado em inspectionCharges.cpfcnpj.test.ts)
      const customer = await asaas.getOrCreateCustomer({
        name: "Cliente Teste Cobrança",
        email: testEmail,
        cpfCnpj: "24971563792",
      });

      // Depois cria a cobrança
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7); // Vencimento em 7 dias

      const charge = await asaas.createCharge({
        customer: customer.id,
        billingType: 'UNDEFINED',
        value: 150.50, // R$ 150,50
        dueDate: asaas.formatDateForAsaas(dueDate),
        description: "Teste de Abastecimento - Lancha #1 - 50L",
        externalReference: `test_${Date.now()}`,
      });

      expect(charge).toBeDefined();
      expect(charge.id).toBeDefined();
      expect(typeof charge.id).toBe("string");
      expect(charge.value).toBe(150.50);
      expect(charge.status).toBeDefined();
      
      console.log(`[Asaas] Cobrança criada com sucesso: ${charge.id}`);
      console.log(`[Asaas] Status: ${charge.status}`);
      console.log(`[Asaas] URL de pagamento: ${charge.invoiceUrl || charge.bankSlipUrl || 'N/A'}`);
    } catch (error: any) {
      console.error("[Asaas] Erro ao criar cobrança:", error.message);
      throw error;
    }
  }, 20000);

  it("deve formatar data corretamente para Asaas (YYYY-MM-DD)", () => {
    const testDate = new Date('2025-12-25T10:30:00');
    const formatted = asaas.formatDateForAsaas(testDate);
    
    expect(formatted).toBe('2025-12-25');
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Asaas API - Tratamento de Erros", () => {
  it.skipIf(!hasAsaasKey)("deve lançar erro ao tentar criar cobrança com customer_id inválido", async () => {
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      await asaas.createCharge({
        customer: 'cus_invalid_id_12345',
        billingType: 'UNDEFINED',
        value: 100.00,
        dueDate: asaas.formatDateForAsaas(dueDate),
        description: "Teste de erro",
      });

      // Se chegou aqui, o teste falhou
      throw new Error("Deveria ter lançado erro para customer_id inválido");
    } catch (error: any) {
      expect(error).toBeDefined();
      expect(error.message).toContain("Erro ao criar cobrança no Asaas");
      console.log(`[Asaas] Erro esperado capturado: ${error.message}`);
    }
  }, 15000);

  it("deve lançar erro se ASAAS_API_KEY não estiver configurada", async () => {
    const originalKey = process.env.ASAAS_API_KEY;
    delete process.env.ASAAS_API_KEY;

    try {
      await asaas.getOrCreateCustomer({
        name: "Teste",
        email: "teste@test.com",
      });

      throw new Error("Deveria ter lançado erro para API key ausente");
    } catch (error: any) {
      expect(error.message).toContain("ASAAS_API_KEY não configurada");
    } finally {
      // Restaura a chave
      if (originalKey) {
        process.env.ASAAS_API_KEY = originalKey;
      }
    }
  });
});
