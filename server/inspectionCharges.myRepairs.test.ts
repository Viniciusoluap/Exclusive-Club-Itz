import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(email: string, role: 'user' | 'admin' = 'user'): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email,
    name: "Sample User",
    loginMethod: "manus",
    role,
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

describe("inspectionCharges.myRepairs", () => {
  it("retorna array vazio quando cliente não tem embarcações", async () => {
    const { ctx } = createAuthContext("cliente-sem-embarcacao@test.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspectionCharges.myRepairs({});

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("requer autenticação", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: {
        protocol: "https",
        headers: {},
      } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);

    await expect(caller.inspectionCharges.myRepairs({})).rejects.toThrow('Please login');
  });

  it("aceita filtro de mês/ano opcional", async () => {
    const { ctx } = createAuthContext("cliente@test.com");
    const caller = appRouter.createCaller(ctx);

    // Deve aceitar sem filtro
    const resultAll = await caller.inspectionCharges.myRepairs({});
    expect(Array.isArray(resultAll)).toBe(true);

    // Deve aceitar com filtro
    const resultFiltered = await caller.inspectionCharges.myRepairs({ monthYear: "2025-12" });
    expect(Array.isArray(resultFiltered)).toBe(true);
  });

  it("retorna campos corretos para reparos", async () => {
    const { ctx } = createAuthContext("cliente@test.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspectionCharges.myRepairs({});

    // Se houver reparos, validar estrutura
    if (result.length > 0) {
      const repair = result[0];
      expect(repair).toHaveProperty('id');
      expect(repair).toHaveProperty('chargeType');
      expect(repair).toHaveProperty('vesselId');
      expect(repair).toHaveProperty('vesselName');
      expect(repair).toHaveProperty('description');
      expect(repair).toHaveProperty('totalAmount');
      expect(repair).toHaveProperty('individualAmount');
      expect(repair).toHaveProperty('quotaShare');
      expect(repair).toHaveProperty('dueDate');
      expect(repair).toHaveProperty('paymentStatus');
      expect(repair).toHaveProperty('receiptUrl');
      expect(repair).toHaveProperty('asaasChargeId');
      expect(repair).toHaveProperty('createdAt');
    }
  });

  it("calcula valor individual baseado em quota_share", async () => {
    const { ctx } = createAuthContext("cliente@test.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspectionCharges.myRepairs({});

    // Se houver reparos, validar cálculo
    if (result.length > 0) {
      const repair = result[0];
      expect(typeof repair.totalAmount).toBe('number');
      expect(typeof repair.individualAmount).toBe('number');
      expect(typeof repair.quotaShare).toBe('number');
      
      // Validar que individualAmount = totalAmount * quotaShare
      const expectedIndividual = repair.totalAmount * repair.quotaShare;
      expect(repair.individualAmount).toBeCloseTo(expectedIndividual, 2);
    }
  });
});
