/**
 * Testes unitários para o webhook refatorado (Fase 2)
 * Verifica que subscription_charges é atualizado com prioridade sobre asaas_payments
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mocks devem ser declarados antes de qualquer import que os use
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./_core/asaasService", () => ({
  mapAsaasStatus: vi.fn().mockImplementation((s: string) => {
    if (s === 'RECEIVED' || s === 'CONFIRMED') return 'confirmed';
    if (s === 'OVERDUE') return 'overdue';
    return 'pending';
  }),
  mapToLegacyStatus: vi.fn().mockImplementation((s: string) => {
    if (s === 'confirmed') return 'paid';
    if (s === 'overdue') return 'overdue';
    return 'pending';
  }),
  logWebhook: vi.fn().mockResolvedValue(42),
  updateWebhookLog: vi.fn().mockResolvedValue(undefined),
  updatePaymentStatus: vi.fn().mockResolvedValue(undefined),
  getPaymentByAsaasId: vi.fn().mockResolvedValue(null),
}));

import { webhookRouter } from "./webhookRouter";
import { getDb } from "./db";
import { getPaymentByAsaasId } from "./_core/asaasService";
import type { TrpcContext } from "./_core/context";

const mockGetDb = vi.mocked(getDb);
const mockGetPaymentByAsaasId = vi.mocked(getPaymentByAsaasId);

function createMockDb(executeResults: any[] = []) {
  let callIndex = 0;
  return {
    execute: vi.fn().mockImplementation(() => {
      const result = executeResults[callIndex] ?? [[{ affectedRows: 1 }]];
      callIndex++;
      return Promise.resolve(result);
    }),
  };
}

function createWebhookContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {
        'asaas-access-token': 'test-token',
        'content-type': 'application/json',
      },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const basePayload = {
  event: 'PAYMENT_RECEIVED',
  payment: {
    id: 'pay_test_abc123',
    customer: 'cus_test',
    value: 900.00,
    netValue: 887.50,
    billingType: 'PIX',
    status: 'RECEIVED',
    paymentDate: '2026-04-11',
    externalReference: 'sc_test_ref',
  },
};

describe("webhook.asaas - Fase 2: Prioridade subscription_charges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASAAS_WEBHOOK_TOKEN = 'test-token';
  });

  it("deve atualizar subscription_charges quando asaas_payment_id é encontrado", async () => {
    const mockDb = createMockDb([
      [[{ id: 99, status: 'pending' }]],  // SELECT subscription_charges
      [{ affectedRows: 1 }],              // UPDATE subscription_charges
    ]);
    mockGetDb.mockResolvedValue(mockDb as any);

    const caller = webhookRouter.createCaller(createWebhookContext());
    const result = await caller.asaas(basePayload);

    expect(result.success).toBe(true);
    expect((result as any).source).toBe('subscription_charges');
    expect((result as any).chargeId).toBe(99);
    expect((result as any).newStatus).toBe('paid');
    // asaas_payments NÃO deve ser consultado
    expect(mockGetPaymentByAsaasId).not.toHaveBeenCalled();
  });

  it("deve cair para asaas_payments quando subscription_charges não tem o registro", async () => {
    const mockDb = createMockDb([
      [[]],                              // SELECT subscription_charges — vazio
      [{ affectedRows: 1 }],             // UPDATE fuel_records
    ]);
    mockGetDb.mockResolvedValue(mockDb as any);
    mockGetPaymentByAsaasId.mockResolvedValueOnce({
      id: 10,
      chargeType: 'fuel',
      chargeId: 5,
      asaasPaymentId: 'pay_test_abc123',
    } as any);

    const caller = webhookRouter.createCaller(createWebhookContext());
    const result = await caller.asaas(basePayload);

    expect(result.success).toBe(true);
    expect((result as any).source).toBe('asaas_payments');
    expect(mockGetPaymentByAsaasId).toHaveBeenCalledWith('pay_test_abc123');
  });

  it("deve rejeitar token inválido com erro UNAUTHORIZED", async () => {
    const mockDb = createMockDb([[[]]]);
    mockGetDb.mockResolvedValue(mockDb as any);

    const ctx = createWebhookContext();
    (ctx.req.headers as any)['asaas-access-token'] = 'wrong-token';

    const caller = webhookRouter.createCaller(ctx);
    await expect(caller.asaas(basePayload)).rejects.toThrow('Token inválido');
  });

  it("deve ignorar eventos não relevantes sem consultar o banco", async () => {
    const mockDb = createMockDb([]);
    mockGetDb.mockResolvedValue(mockDb as any);

    const caller = webhookRouter.createCaller(createWebhookContext());
    const result = await caller.asaas({
      ...basePayload,
      event: 'PAYMENT_CREATED',
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('ignorado');
    // Banco não deve ser consultado para eventos ignorados
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("deve mapear OVERDUE corretamente para subscription_charges", async () => {
    const mockDb = createMockDb([
      [[{ id: 77, status: 'pending' }]],
      [{ affectedRows: 1 }],
    ]);
    mockGetDb.mockResolvedValue(mockDb as any);

    const caller = webhookRouter.createCaller(createWebhookContext());
    const result = await caller.asaas({
      ...basePayload,
      event: 'PAYMENT_OVERDUE',
      payment: { ...basePayload.payment, status: 'OVERDUE', paymentDate: undefined },
    });

    expect(result.success).toBe(true);
    expect((result as any).source).toBe('subscription_charges');
    expect((result as any).newStatus).toBe('overdue');
  });

  it("deve retornar 'Registro não encontrado' quando nenhuma tabela tem o ID", async () => {
    const mockDb = createMockDb([
      [[]],  // subscription_charges vazio
      [[]],  // fuel_records vazio
      [[]],  // inspection_charges vazio
    ]);
    mockGetDb.mockResolvedValue(mockDb as any);
    mockGetPaymentByAsaasId.mockResolvedValueOnce(null);

    const caller = webhookRouter.createCaller(createWebhookContext());
    const result = await caller.asaas(basePayload);

    expect(result.success).toBe(true);
    expect(result.message).toContain('não encontrado');
  });
});
