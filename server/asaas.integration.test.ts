import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-test",
    email: "admin@test.com",
    name: "Admin Test",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// Chamadas reais à API sandbox da Asaas exigem ASAAS_API_KEY (secret do
// repositório, ausente em PRs de forks) — ver docs/reviews/fase0-known-test-failures.md.
const hasAsaasKey = !!process.env.ASAAS_API_KEY;

describe("Asaas Integration", () => {
  it("should have ASAAS_API_KEY configured", () => {
    const apiKey = process.env.ASAAS_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey).not.toBe("");
    expect(apiKey).toMatch(/^\$aact_(prod_)?/);
  });

  it.skipIf(!hasAsaasKey)("should be able to create or get customer", async () => {
    const asaas = await import("./_core/asaas");
    
    const customer = await asaas.getOrCreateCustomer({
      name: "Cliente Teste",
      email: "cliente.teste@example.com",
    });

    expect(customer).toBeDefined();
    expect(customer.id).toBeDefined();
    expect(typeof customer.id).toBe("string");
  });

  it.skipIf(!hasAsaasKey)("should be able to create charge", async () => {
    const asaas = await import("./_core/asaas");
    
    // Primeiro criar/buscar cliente
    const customer = await asaas.getOrCreateCustomer({
      name: "Cliente Teste Cobrança",
      email: "cliente.cobranca@example.com",
    });

    // Criar cobrança
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const charge = await asaas.createCharge({
      customer: customer.id,
      billingType: "UNDEFINED",
      value: 100.00,
      dueDate: asaas.formatDateForAsaas(dueDate),
      description: "Teste de cobrança - Integração",
      externalReference: `test_${Date.now()}`,
    });

    expect(charge).toBeDefined();
    expect(charge.id).toBeDefined();
    expect(typeof charge.id).toBe("string");
  });

  it("syncWithAsaas endpoint should work for admin", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Nota: Este teste vai falhar se não houver registros no banco
    // É apenas para validar que o endpoint existe e está acessível
    try {
      const result = await caller.fuelRecords.syncWithAsaas({ id: 999999 });
      // Se chegar aqui, o endpoint funcionou (mesmo que o ID não exista)
      expect(true).toBe(true);
    } catch (error: any) {
      // Esperamos erro NOT_FOUND ou INTERNAL_SERVER_ERROR, não UNAUTHORIZED
      expect(error.code).not.toBe("UNAUTHORIZED");
    }
  });

  it("markAsPaid endpoint should work for admin", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    try {
      const result = await caller.fuelRecords.markAsPaid({ 
        id: 999999,
        note: "Teste de pagamento manual"
      });
      expect(true).toBe(true);
    } catch (error: any) {
      // Esperamos erro NOT_FOUND ou INTERNAL_SERVER_ERROR, não UNAUTHORIZED
      expect(error.code).not.toBe("UNAUTHORIZED");
    }
  });

  it("syncAllPending endpoint should work for admin", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.fuelRecords.syncAllPending();
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(typeof result.successCount).toBe("number");
    expect(typeof result.failCount).toBe("number");
  });
});
