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

    const result = await caller.employees.create({
      name: "Teste Funcionário",
      email: "teste@example.com",
      phone: "11999999999",
      vesselIds: [1, 2],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve cadastrar funcionário sem telefone", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employees.create({
      name: "Teste Sem Telefone",
      email: "semtelefone@example.com",
      vesselIds: [1],
    });

    expect(result).toEqual({ success: true });
  });
});
