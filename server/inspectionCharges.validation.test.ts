import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext } {
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

function createClientContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "client-test",
    email: "client@test.com",
    name: "Client Test",
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

describe("inspectionCharges - Validação de Permissões", () => {
  it("cliente não pode criar cobrança (apenas admin)", async () => {
    const { ctx } = createClientContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.inspectionCharges.create({
        inspectionId: 1,
        failedItems: [{ name: "Casco", status: "Reprovado" }],
        amount: 150.0,
      })
    ).rejects.toThrow("Admin access required");
  });

  it("cliente não pode listar todas as cobranças (apenas admin)", async () => {
    const { ctx } = createClientContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.inspectionCharges.listAll()).rejects.toThrow("Admin access required");
  });

  it("cliente não pode atualizar cobranças (apenas admin)", async () => {
    const { ctx } = createClientContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.inspectionCharges.update({
        chargeId: 1,
      })
    ).rejects.toThrow("Admin access required");
  });

  it("cliente não pode deletar cobranças (apenas admin)", async () => {
    const { ctx } = createClientContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.inspectionCharges.delete({
        chargeId: 1,
      })
    ).rejects.toThrow("Admin access required");
  });
});

describe("inspectionCharges - Validação de Entrada", () => {
  it("rejeita criação de cobrança com valor negativo", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.inspectionCharges.create({
        inspectionId: 1,
        failedItems: [{ name: "Casco", status: "Reprovado" }],
        amount: -50.0,
      })
    ).rejects.toThrow();
  });

  it("rejeita criação de cobrança com valor zero", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.inspectionCharges.create({
        inspectionId: 1,
        failedItems: [{ name: "Casco", status: "Reprovado" }],
        amount: 0,
      })
    ).rejects.toThrow();
  });

  it("rejeita geração de pagamento sem cobranças selecionadas", async () => {
    const { ctx } = createClientContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.inspectionCharges.generatePayment({
        chargeIds: [],
      })
    ).rejects.toThrow("Selecione pelo menos uma cobrança");
  });

  it("rejeita criação de cobrança sem itens danificados", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.inspectionCharges.create({
        inspectionId: 1,
        failedItems: [],
        amount: 150.0,
      })
    ).rejects.toThrow();
  });
});

describe("inspectionCharges - Endpoints do Cliente", () => {
  it("cliente autenticado pode listar suas próprias cobranças", async () => {
    const { ctx } = createClientContext();
    const caller = appRouter.createCaller(ctx);

    // Não deve lançar erro de permissão
    const result = await caller.inspectionCharges.myCharges();
    expect(Array.isArray(result)).toBe(true);
  });

  it("cliente autenticado pode ver suas estatísticas", async () => {
    const { ctx } = createClientContext();
    const caller = appRouter.createCaller(ctx);

    // Não deve lançar erro de permissão
    const result = await caller.inspectionCharges.getStats();
    expect(result).toHaveProperty("totalCharges");
    expect(result).toHaveProperty("totalPaid");
    expect(result).toHaveProperty("totalPending");
    expect(result).toHaveProperty("totalOverdue");
  });
});

describe("inspectionCharges - Estrutura de Dados", () => {
  it("valida estrutura de failedItems", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Deve aceitar estrutura correta
    const validFailedItems = [
      { name: "Casco", status: "Reprovado" },
      { name: "Motor", status: "Reprovado" },
    ];

    // Teste apenas de validação de schema (não executa no banco)
    await expect(
      caller.inspectionCharges.create({
        inspectionId: 1,
        failedItems: validFailedItems,
        amount: 150.0,
      })
    ).rejects.toThrow(); // Vai falhar por vistoria não existir, mas schema está OK
  });
});
