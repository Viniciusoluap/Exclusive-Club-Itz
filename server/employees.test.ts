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

  it("deve cadastrar funcionário com email formato hotmail", async () => {
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
});

describe("employees.update", () => {
  it("deve atualizar funcionário (criar primeiro e depois atualizar)", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Criar funcionário primeiro
    const timestamp = Date.now();
    await caller.employees.create({
      name: "Teste Update",
      email: `update${timestamp}@hotmail.com`,
      phone: "99999999999",
      vesselIds: [1],
    });

    // Buscar o ID recém-criado
    const employees = await caller.employees.list();
    const newEmployee = employees.find((e: any) => e.email === `update${timestamp}@hotmail.com`);

    if (!newEmployee) {
      throw new Error("Funcionário não encontrado após criação");
    }

    // Atualizar com novo email
    const result = await caller.employees.update({
      id: newEmployee.id,
      name: "Teste Funcionário Atualizado",
      email: `atualizado${timestamp}@hotmail.com`,
      phone: "11999999999",
      vesselIds: [3, 4],
    });

    expect(result).toEqual({ success: true });
  });
});
