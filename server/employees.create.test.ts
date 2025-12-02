import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("employees.create - Email .com Test", () => {
  it("deve criar funcionário com email .com (hotmail.com)", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const timestamp = Date.now();
    const result = await caller.employees.create({
      name: `Teste Email COM ${timestamp}`,
      email: `teste${timestamp}@hotmail.com`,
      phone: "11999999999",
      vesselIds: [3, 4],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve criar funcionário com email .com.br", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const timestamp = Date.now();
    const result = await caller.employees.create({
      name: `Teste Email BR ${timestamp}`,
      email: `teste${timestamp}@empresa.com.br`,
      phone: "11988888888",
      vesselIds: [3],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve criar funcionário com email .net", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const timestamp = Date.now();
    const result = await caller.employees.create({
      name: `Teste Email NET ${timestamp}`,
      email: `teste${timestamp}@company.net`,
      phone: "11977777777",
      vesselIds: [4],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve criar funcionário com email prospectaconstrucoes.com", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const timestamp = Date.now();
    const result = await caller.employees.create({
      name: `Teste Prospecta ${timestamp}`,
      email: `atendimento${timestamp}@prospectaconstrucoes.com`,
      phone: "11966666666",
      vesselIds: [3, 4],
    });

    expect(result).toEqual({ success: true });
  });
});
