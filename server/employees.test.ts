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

describe("employees.create", () => {
  it("deve cadastrar funcionário com sucesso", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const timestamp = Date.now();
    const result = await caller.employees.create({
      name: "Teste Funcionário",
      email: `teste${timestamp}@example.com`,
      phone: "11999999999",
      vesselIds: [1, 2],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve cadastrar funcionário sem telefone", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const timestamp = Date.now();
    const result = await caller.employees.create({
      name: "Teste Sem Telefone",
      email: `semtelefone${timestamp}@example.com`,
      vesselIds: [1],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve cadastrar funcionário com email formato hotmail.com", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const timestamp = Date.now();
    const result = await caller.employees.create({
      name: "Teste Hotmail",
      email: `teste${timestamp}@hotmail.com`,
      phone: "99981392210",
      vesselIds: [3, 4],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve cadastrar funcionário com email .com.br", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const timestamp = Date.now();
    const result = await caller.employees.create({
      name: "Teste Brasil",
      email: `teste${timestamp}@empresa.com.br`,
      phone: "11988887777",
      vesselIds: [1],
    });

    expect(result).toEqual({ success: true });
  });
});

describe("employees.update", () => {
  it("deve atualizar funcionário com email .com", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Criar funcionário primeiro
    const timestamp = Date.now();
    await caller.employees.create({
      name: "Teste Update COM",
      email: `update${timestamp}@test.com`,
      phone: "99999999999",
      vesselIds: [1],
    });

    // Buscar o ID recém-criado
    const employees = await caller.employees.list();
    const newEmployee = employees.find((e: any) => e.email === `update${timestamp}@test.com`);

    if (!newEmployee) {
      throw new Error("Funcionário não encontrado após criação");
    }

    // Atualizar com email .com
    const result = await caller.employees.update({
      id: newEmployee.id,
      name: "Teste Atualizado",
      email: `atualizado${timestamp}@prospectaconstrucoes.com`,
      phone: "11999999999",
      vesselIds: [3, 4],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve atualizar funcionário com email .com.br", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Criar funcionário primeiro
    const timestamp = Date.now();
    await caller.employees.create({
      name: "Teste Update BR",
      email: `updatebr${timestamp}@test.com`,
      phone: "99999999999",
      vesselIds: [1],
    });

    // Buscar o ID recém-criado
    const employees = await caller.employees.list();
    const newEmployee = employees.find((e: any) => e.email === `updatebr${timestamp}@test.com`);

    if (!newEmployee) {
      throw new Error("Funcionário não encontrado após criação");
    }

    // Atualizar com email .com.br
    const result = await caller.employees.update({
      id: newEmployee.id,
      name: "Teste Atualizado BR",
      email: `atualizado${timestamp}@empresa.com.br`,
      phone: "11988887777",
      vesselIds: [2],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve atualizar funcionário com email .net", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Criar funcionário primeiro
    const timestamp = Date.now();
    await caller.employees.create({
      name: "Teste Update NET",
      email: `updatenet${timestamp}@test.com`,
      phone: "99999999999",
      vesselIds: [1],
    });

    // Buscar o ID recém-criado
    const employees = await caller.employees.list();
    const newEmployee = employees.find((e: any) => e.email === `updatenet${timestamp}@test.com`);

    if (!newEmployee) {
      throw new Error("Funcionário não encontrado após criação");
    }

    // Atualizar com email .net
    const result = await caller.employees.update({
      id: newEmployee.id,
      name: "Teste Atualizado NET",
      email: `atualizado${timestamp}@servidor.net`,
      phone: "11977776666",
      vesselIds: [1, 2],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve atualizar funcionário com email formato prospectaconstrucoes.com", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Criar funcionário primeiro
    const timestamp = Date.now();
    await caller.employees.create({
      name: "Teste Real",
      email: `real${timestamp}@test.com`,
      phone: "99999999999",
      vesselIds: [1],
    });

    // Buscar o ID recém-criado
    const employees = await caller.employees.list();
    const newEmployee = employees.find((e: any) => e.email === `real${timestamp}@test.com`);

    if (!newEmployee) {
      throw new Error("Funcionário não encontrado após criação");
    }

    // Atualizar com email formato prospectaconstrucoes.com (único)
    const result = await caller.employees.update({
      id: newEmployee.id,
      name: "Teste 2",
      email: `atendimento${timestamp}@prospectaconstrucoes.com`,
      phone: "99981392210",
      vesselIds: [3, 4],
    });

    expect(result).toEqual({ success: true });
  });
});
