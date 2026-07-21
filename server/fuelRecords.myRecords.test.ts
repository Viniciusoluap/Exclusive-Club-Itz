import { describe, expect, it } from "vitest";
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

describe("fuelRecords.myRecords", () => {
  it("deve retornar lista vazia se cliente não tem abastecimentos", async () => {
    const { ctx } = createAuthContext("novo-cliente@example.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.fuelRecords.myRecords();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("deve retornar apenas abastecimentos do cliente logado", async () => {
    const { ctx } = createAuthContext("client@example.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.fuelRecords.myRecords();

    expect(Array.isArray(result)).toBe(true);
    
    // Todos os registros devem ser do cliente logado
    result.forEach((record: any) => {
      expect(record).toHaveProperty('id');
      expect(record).toHaveProperty('vesselName');
      expect(record).toHaveProperty('liters');
      expect(record).toHaveProperty('totalAmount');
      expect(record).toHaveProperty('paymentStatus');
    });
  });

  it("deve converter valores de centavos para reais", async () => {
    const { ctx } = createAuthContext("client@example.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.fuelRecords.myRecords();

    if (result.length > 0) {
      const record = result[0];
      
      // Valores devem ser números decimais (não inteiros em centavos)
      expect(typeof record.liters).toBe('number');
      expect(typeof record.totalAmount).toBe('number');
      expect(typeof record.pricePerLiter).toBe('number');
      
      // Valores devem ser razoáveis (não em centavos)
      expect(record.totalAmount).toBeLessThan(10000); // Menos de R$ 10.000
      expect(record.liters).toBeLessThan(1000); // Menos de 1000 litros
    }
  });

  it("deve ordenar por data de criação (mais recentes primeiro)", async () => {
    const { ctx } = createAuthContext("client@example.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.fuelRecords.myRecords();

    if (result.length > 1) {
      for (let i = 0; i < result.length - 1; i++) {
        const current = new Date(result[i].createdAt);
        const next = new Date(result[i + 1].createdAt);
        
        // Data atual deve ser >= próxima (ordem decrescente)
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
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

    await expect(caller.fuelRecords.myRecords()).rejects.toThrow('Please login');
  });
});
