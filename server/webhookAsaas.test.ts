import { describe, it, expect, beforeAll } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

describe('Webhook Asaas - Schema Flexível', () => {
  let mockContext: TrpcContext;

  beforeAll(() => {
    // Garantir que o token está configurado para os testes
    if (!process.env.ASAAS_WEBHOOK_TOKEN) {
      process.env.ASAAS_WEBHOOK_TOKEN = 'test-token-for-unit-tests';
    }
    
    // Mock do contexto com headers do webhook
    mockContext = {
      user: null,
      req: {
        protocol: 'https',
        headers: {
          'asaas-access-token': process.env.ASAAS_WEBHOOK_TOKEN,
        },
      } as TrpcContext['req'],
      res: {} as TrpcContext['res'],
    };
  });

  it('deve aceitar payload com campos extras no nível raiz', async () => {
    const caller = appRouter.createCaller(mockContext);

    const payloadComCamposExtras = {
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_test_123',
        customer: 'cus_test_456',
        value: 100.50,
        status: 'RECEIVED',
        externalReference: 'ref_789',
      },
      // Campos extras que o Asaas pode enviar
      dateCreated: '2025-12-13',
      installment: '1',
      extraField1: 'valor1',
      extraField2: 'valor2',
    };

    // Não deve lançar erro de validação de schema
    await expect(
      caller.webhooks.asaas(payloadComCamposExtras)
    ).resolves.toBeDefined();
  });

  it('deve aceitar payload com campos extras no objeto payment', async () => {
    const caller = appRouter.createCaller(mockContext);

    const payloadComCamposExtrasPayment = {
      event: 'PAYMENT_OVERDUE',
      payment: {
        id: 'pay_test_456',
        status: 'OVERDUE',
        // Campos opcionais ausentes
        // customer: não enviado
        // value: não enviado
        // Campos extras no payment
        dueDate: '2025-12-20',
        description: 'Cobrança de teste',
        billingType: 'BOLETO',
      },
    };

    // Não deve lançar erro de validação de schema
    await expect(
      caller.webhooks.asaas(payloadComCamposExtrasPayment)
    ).resolves.toBeDefined();
  });

  it('deve aceitar payload mínimo válido', async () => {
    const caller = appRouter.createCaller(mockContext);

    const payloadMinimo = {
      event: 'PAYMENT_DELETED',
      payment: {
        id: 'pay_test_minimal',
        status: 'DELETED',
      },
    };

    // Não deve lançar erro de validação de schema
    await expect(
      caller.webhooks.asaas(payloadMinimo)
    ).resolves.toBeDefined();
  });
});
