import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

function createNonAdminContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("saasRouter", () => {
  describe("list", () => {
    it("deve permitir admin acessar lista de mensalidades", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.saas.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.saas.list()).rejects.toThrow("You do not have required permission");
    });
  });

  describe("getInvoiceDashboard", () => {
    it("deve retornar dashboard de inadimplência para admin", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.saas.getInvoiceDashboard();
      
      expect(result).toHaveProperty("totalPending");
      expect(result).toHaveProperty("totalPaid");
      expect(result).toHaveProperty("totalOverdue");
      expect(result).toHaveProperty("pendingCount");
      expect(result).toHaveProperty("paidCount");
      expect(result).toHaveProperty("overdueCount");
      expect(result).toHaveProperty("totalExpected");
      
      expect(typeof result.totalPending).toBe("number");
      expect(typeof result.totalPaid).toBe("number");
      expect(typeof result.totalOverdue).toBe("number");
    });

    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.saas.getInvoiceDashboard()).rejects.toThrow("You do not have required permission");
    });
  });

  describe("getCharges", () => {
    it("deve permitir admin listar cobranças", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.saas.getCharges({ status: "all" });
      expect(Array.isArray(result)).toBe(true);
    });

    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.saas.getCharges({ status: "all" })).rejects.toThrow("You do not have required permission");
    });
  });

  describe("syncWithAsaas", () => {
    it("deve permitir admin sincronizar com Asaas", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.saas.syncWithAsaas();
      
      expect(result).toHaveProperty("syncedCount");
      expect(result).toHaveProperty("errorCount");
      expect(result).toHaveProperty("success");
      expect(result.success).toBe(true);
    });

    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.saas.syncWithAsaas()).rejects.toThrow("You do not have required permission");
    });
  });
});

// ============================================================
// Testes de lógica de pagamento parcial (sem banco de dados)
// ============================================================
describe("partial payment logic", () => {
  // Simula a lógica central de cálculo de pagamento parcial
  function calculatePartialPayment(
    chargeValue: number,
    currentAmountPaid: number,
    newPaymentValue: number
  ) {
    const newAmountPaid = currentAmountPaid + newPaymentValue;
    const isPaid = newAmountPaid >= chargeValue;
    const newStatus = isPaid ? "paid" : "partial";
    const remaining = chargeValue - newAmountPaid;

    return {
      newAmountPaid,
      isPaid,
      newStatus,
      remaining: remaining > 0 ? remaining : 0,
    };
  }

  it("deve manter status 'partial' quando pagamento parcial não quita o total", () => {
    // Cobrança de R$ 961,46 - primeiro Pix de R$ 700,00
    const result = calculatePartialPayment(961.46, 0, 700.00);

    expect(result.isPaid).toBe(false);
    expect(result.newStatus).toBe("partial");
    expect(result.newAmountPaid).toBeCloseTo(700.00, 2);
    expect(result.remaining).toBeCloseTo(261.46, 2);
  });

  it("deve mudar status para 'paid' quando segundo pagamento completa o valor", () => {
    // Cobrança de R$ 961,46 - já recebeu R$ 700,00, agora recebe R$ 261,46
    const result = calculatePartialPayment(961.46, 700.00, 261.46);

    expect(result.isPaid).toBe(true);
    expect(result.newStatus).toBe("paid");
    expect(result.newAmountPaid).toBeCloseTo(961.46, 2);
    expect(result.remaining).toBe(0);
  });

  it("deve aceitar pagamento que excede o valor da cobrança (overpayment)", () => {
    // Pagamento maior que o valor da cobrança
    const result = calculatePartialPayment(961.46, 700.00, 300.00);

    expect(result.isPaid).toBe(true);
    expect(result.newStatus).toBe("paid");
    expect(result.remaining).toBe(0); // Não pode ser negativo
  });

  it("deve calcular saldo restante corretamente após múltiplos pagamentos parciais", () => {
    // Três pagamentos parciais
    const step1 = calculatePartialPayment(961.46, 0, 300.00);
    expect(step1.newStatus).toBe("partial");
    expect(step1.remaining).toBeCloseTo(661.46, 2);

    const step2 = calculatePartialPayment(961.46, step1.newAmountPaid, 300.00);
    expect(step2.newStatus).toBe("partial");
    expect(step2.remaining).toBeCloseTo(361.46, 2);

    const step3 = calculatePartialPayment(961.46, step2.newAmountPaid, 361.46);
    expect(step3.isPaid).toBe(true);
    expect(step3.newStatus).toBe("paid");
    expect(step3.remaining).toBe(0);
  });

  it("deve retornar status 'paid' para pagamento único que cobre o total", () => {
    const result = calculatePartialPayment(700.00, 0, 700.00);

    expect(result.isPaid).toBe(true);
    expect(result.newStatus).toBe("paid");
    expect(result.remaining).toBe(0);
  });
});

describe("getClientPendingCharges - access control", () => {
  it("deve negar acesso para não-admin", async () => {
    const { ctx } = createNonAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.saas.getClientPendingCharges({ clientId: 1 })
    ).rejects.toThrow("You do not have required permission");
  });

  it("deve permitir admin buscar cobranças pendentes de um cliente", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.saas.getClientPendingCharges({ clientId: 999999 });
    expect(Array.isArray(result)).toBe(true);
    // Cliente inexistente deve retornar array vazio
    expect(result.length).toBe(0);
  });
});

// ============================================================
// Testes da engine de auto-classificação (sem banco de dados)
// ============================================================
describe("autoClassify keyword detection logic", () => {
  // Simula a lógica de detecção de tipo por palavras-chave
  function detectTypeFromDescription(description: string): { type: string | null; confidence: number } {
    const desc_lower = description.toLowerCase();

    const fuelKeywords = ['abastecimento', 'combustivel', 'combustível', 'gasolina', 'etanol', 'diesel', 'litro'];
    const repairKeywords = ['reparo', 'conserto', 'manutenção', 'manutenção', 'revisao', 'revisão', 'dano', 'avaria', 'vistoria'];
    const quotaKeywords = ['cota', 'quota', 'parcela', 'venda de cota', 'entrada'];
    const monthlyKeywords = ['mensalidade', 'mensal', 'mensalidade clube', 'taxa mensal'];

    if (fuelKeywords.some(k => desc_lower.includes(k))) return { type: 'fuel', confidence: 90 };
    if (repairKeywords.some(k => desc_lower.includes(k))) return { type: 'repair', confidence: 85 };
    if (quotaKeywords.some(k => desc_lower.includes(k))) return { type: 'quota_sale', confidence: 80 };
    if (monthlyKeywords.some(k => desc_lower.includes(k))) return { type: 'monthly', confidence: 85 };

    return { type: null, confidence: 0 };
  }

  it("deve detectar tipo 'fuel' para descrição de abastecimento", () => {
    const result = detectTypeFromDescription("Abastecimento de combustível - 50 litros");
    expect(result.type).toBe("fuel");
    expect(result.confidence).toBe(90);
  });

  it("deve detectar tipo 'repair' para descrição de reparo", () => {
    const result = detectTypeFromDescription("Reparo no motor da lancha");
    expect(result.type).toBe("repair");
    expect(result.confidence).toBe(85);
  });

  it("deve detectar tipo 'quota_sale' para descrição de cota", () => {
    const result = detectTypeFromDescription("Venda de cota - parcela 3/12");
    expect(result.type).toBe("quota_sale");
    expect(result.confidence).toBe(80);
  });

  it("deve detectar tipo 'monthly' para descrição de mensalidade", () => {
    const result = detectTypeFromDescription("Mensalidade clube - março 2026");
    expect(result.type).toBe("monthly");
    expect(result.confidence).toBe(85);
  });

  it("deve retornar tipo null para descrição genérica sem palavras-chave", () => {
    const result = detectTypeFromDescription("Cobrança gerada automaticamente a partir de Pix recebido");
    expect(result.type).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("deve ser case-insensitive na detecção", () => {
    const result1 = detectTypeFromDescription("ABASTECIMENTO DE GASOLINA");
    const result2 = detectTypeFromDescription("abastecimento de gasolina");
    expect(result1.type).toBe("fuel");
    expect(result2.type).toBe("fuel");
  });
});

describe("splitPayment - access control", () => {
  it("deve negar acesso para não-admin", async () => {
    const { ctx } = createNonAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.saas.splitPayment({
        asaasChargeId: "pay_test_123",
        pixValue: 1384.00,
        splits: [{ chargeId: 1, amount: 700.00 }, { chargeId: 2, amount: 684.00 }],
      })
    ).rejects.toThrow("You do not have required permission");
  });

  it("deve rejeitar split quando soma excede o valor do Pix", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.saas.splitPayment({
        asaasChargeId: "pay_test_no_allocs",
        pixValue: 1000.00,
        splits: [
          { chargeId: 999991, amount: 700.00 },
          { chargeId: 999992, amount: 400.00 }, // Total: 1100 > 1000
        ],
      })
    ).rejects.toThrow(/excede o valor do Pix/);
  });
});

describe("autoClassifySuggestions - access control", () => {
  it("deve negar acesso para não-admin", async () => {
    const { ctx } = createNonAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.saas.autoClassifySuggestions({
        asaasChargeId: "pay_test_456",
        description: "Abastecimento de combustível",
        value: 500.00,
        clientId: 1,
        dueDate: "2026-03-17",
      })
    ).rejects.toThrow("You do not have required permission");
  });

  it("deve retornar sugestão de tipo 'fuel' para descrição de abastecimento", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.saas.autoClassifySuggestions({
      asaasChargeId: "pay_test_456",
      description: "Abastecimento de combustível - 50 litros",
      value: 500.00,
      clientId: 999999, // cliente inexistente
      dueDate: "2026-03-17",
    });

    expect(result.suggestedType).toBe("fuel");
    expect(result.typeConfidence).toBe(90);
    expect(result.matchingCharges).toEqual([]); // cliente inexistente
  });

  it("deve retornar tipo null para descrição genérica", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.saas.autoClassifySuggestions({
      asaasChargeId: "pay_test_789",
      description: "Cobrança gerada automaticamente a partir de Pix recebido",
      value: 1384.00,
      dueDate: "2026-03-17",
    });

    expect(result.suggestedType).toBeNull();
    expect(result.typeConfidence).toBe(0);
    expect(result.autoClassify).toBe(false);
  });
});
