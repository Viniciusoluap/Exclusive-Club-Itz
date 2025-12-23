import { describe, expect, it } from "vitest";
import { getOrCreateCustomer } from "./_core/asaas";

/**
 * Teste para validar que a correção do bug "invalid_customer" está funcionando
 * 
 * Bug original: O endpoint inspectionCharges.create estava passando email diretamente
 * para o campo "customer" do Asaas, mas a API espera um customer ID (ex: cus_000012345)
 * 
 * Correção: Agora o código chama getOrCreateCustomer() primeiro para obter o ID
 */
describe("inspectionCharges - Correção Bug invalid_customer", () => {
  it("getOrCreateCustomer retorna customer com ID válido", async () => {
    const customer = await getOrCreateCustomer({
      name: "Test Client",
      email: "test-customer-fix@example.com",
    });

    // Validar que retornou um customer válido
    expect(customer).toBeDefined();
    expect(customer.id).toBeDefined();
    expect(typeof customer.id).toBe("string");
    
    // ID do Asaas deve começar com "cus_"
    expect(customer.id).toMatch(/^cus_/);
    
    // Email deve estar correto
    expect(customer.email).toBe("test-customer-fix@example.com");
  });

  it("getOrCreateCustomer reutiliza customer existente", async () => {
    const email = "test-reuse-customer@example.com";
    
    // Criar customer pela primeira vez
    const customer1 = await getOrCreateCustomer({
      name: "Test Client",
      email,
    });

    // Buscar novamente com mesmo email
    const customer2 = await getOrCreateCustomer({
      name: "Test Client Updated",
      email,
    });

    // Deve retornar o mesmo customer ID
    expect(customer1.id).toBe(customer2.id);
  });
});
