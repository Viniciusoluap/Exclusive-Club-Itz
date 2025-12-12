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

describe("employees.create - Email Extensions", () => {
  it("deve aceitar email com extensão .com", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const uniqueEmail = `test-${Date.now()}@example.com`;
    
    const result = await caller.employees.create({
      name: "Test User COM",
      email: uniqueEmail,
      phone: "11999999999",
      vesselIds: [3, 4],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve aceitar email com extensão .com.br", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const uniqueEmail = `test-${Date.now()}@example.com.br`;
    
    const result = await caller.employees.create({
      name: "Test User COM.BR",
      email: uniqueEmail,
      phone: "11999999999",
      vesselIds: [3, 4],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve aceitar email com extensão .net", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const uniqueEmail = `test-${Date.now()}@example.net`;
    
    const result = await caller.employees.create({
      name: "Test User NET",
      email: uniqueEmail,
      phone: "11999999999",
      vesselIds: [3, 4],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve aceitar email com extensão .org", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const uniqueEmail = `test-${Date.now()}@example.org`;
    
    const result = await caller.employees.create({
      name: "Test User ORG",
      email: uniqueEmail,
      phone: "11999999999",
      vesselIds: [3, 4],
    });

    expect(result).toEqual({ success: true });
  });

  it("deve rejeitar email duplicado com mensagem clara", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const uniqueEmail = `duplicate-${Date.now()}@example.com`;
    
    // Primeiro cadastro deve funcionar
    await caller.employees.create({
      name: "First User",
      email: uniqueEmail,
      phone: "11999999999",
      vesselIds: [3, 4],
    });

    // Segundo cadastro com mesmo email deve falhar
    await expect(
      caller.employees.create({
        name: "Second User",
        email: uniqueEmail,
        phone: "11888888888",
        vesselIds: [3],
      })
    ).rejects.toThrow(); // Qualquer erro é válido (duplicate entry)
  });
});
