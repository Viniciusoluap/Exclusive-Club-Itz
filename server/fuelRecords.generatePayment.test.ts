import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(email: string = "client@example.com"): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-client",
    email,
    name: "Cliente Teste",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("fuelRecords.generatePayment", () => {
  it("deve validar ASAAS_API_KEY no início do endpoint", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Salvar valor original
    const originalApiKey = process.env.ASAAS_API_KEY;

    try {
      // Remover temporariamente a API key
      delete process.env.ASAAS_API_KEY;

      await expect(
        caller.fuelRecords.generatePayment({ recordIds: [1] })
      ).rejects.toThrow("Integração de pagamento não configurada");
    } finally {
      // Restaurar valor original
      if (originalApiKey) {
        process.env.ASAAS_API_KEY = originalApiKey;
      }
    }
  });

  it("deve rejeitar requisição sem autenticação", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: {
        protocol: "https",
        headers: {},
      } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.fuelRecords.generatePayment({ recordIds: [1] })
    ).rejects.toThrow('Usuário não autenticado');
  });

  it("deve rejeitar array vazio de recordIds", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.fuelRecords.generatePayment({ recordIds: [] })
    ).rejects.toThrow();
  });

  it("deve validar que recordIds é um array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // @ts-ignore - Testando validação de tipo
    await expect(
      caller.fuelRecords.generatePayment({ recordIds: "invalid" })
    ).rejects.toThrow();
  });

  it("deve rejeitar se nenhum abastecimento pendente for encontrado", async () => {
    // Este teste só pode ser executado se ASAAS_API_KEY estiver configurada
    const apiKey = process.env.ASAAS_API_KEY;
    
    if (!apiKey) {
      console.log('[Test] ASAAS_API_KEY não configurada - teste pulado');
      return;
    }

    const { ctx } = createAuthContext("novo-cliente@example.com");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.fuelRecords.generatePayment({ recordIds: [99999] })
    ).rejects.toThrow('Nenhum abastecimento pendente encontrado para pagamento');
  });

  it("deve validar estrutura do retorno quando bem-sucedido", async () => {
    // Este teste só passa se houver ASAAS_API_KEY configurada e abastecimentos pendentes
    // Em ambiente de teste sem API key, vai falhar (esperado)
    
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      // Primeiro buscar abastecimentos pendentes
      const records = await caller.fuelRecords.myRecords();
      const pendingRecords = records.filter((r: any) => 
        r.paymentStatus === 'pending' || r.paymentStatus === 'overdue'
      );

      if (pendingRecords.length > 0) {
        const result = await caller.fuelRecords.generatePayment({ 
          recordIds: [pendingRecords[0].id] 
        });

        // Validar estrutura do retorno
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('chargeId');
        expect(result).toHaveProperty('totalValue');
        expect(result).toHaveProperty('qrCode');
        expect(result).toHaveProperty('payload');
        expect(result).toHaveProperty('chargeDetails');
        
        expect(result.success).toBe(true);
        expect(typeof result.totalValue).toBe('number');
        expect(result.totalValue).toBeGreaterThan(0);
        expect(Array.isArray(result.chargeDetails)).toBe(true);
      } else {
        console.log('[Test] Nenhum abastecimento pendente para testar geração de pagamento');
      }
    } catch (error: any) {
      // Se falhar por falta de API key, é esperado
      if (error.message.includes('ASAAS_API_KEY')) {
        console.log('[Test] ASAAS_API_KEY não configurada - teste pulado');
      } else {
        throw error;
      }
    }
  });

  it("deve filtrar apenas abastecimentos do cliente logado", async () => {
    const { ctx } = createAuthContext("outro-cliente@example.com");
    const caller = appRouter.createCaller(ctx);

    // Tentar pagar abastecimento de outro cliente (deve falhar)
    await expect(
      caller.fuelRecords.generatePayment({ recordIds: [1, 2, 3] })
    ).rejects.toThrow();
  });
});
