import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createEmployeeContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "employee-test",
    email: "employee@test.com",
    name: "Test Employee",
    loginMethod: "manus",
    role: "employee",
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

function createAdminContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-test",
    email: "admin@test.com",
    name: "Test Admin",
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
    id: 3,
    openId: "client-test",
    email: "client@test.com",
    name: "Test Client",
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

describe("bookings.getRecent", () => {
  it("permite acesso de funcionário (employee role)", async () => {
    const { ctx } = createEmployeeContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.bookings.getRecent({ onlyUsed: true });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("permite acesso de admin", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.bookings.getRecent({ onlyUsed: true });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("bloqueia acesso de cliente comum (user role)", async () => {
    const { ctx } = createClientContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.bookings.getRecent({ onlyUsed: true })
    ).rejects.toThrow("Employee access required");
  });

  it("retorna apenas reservas utilizadas quando onlyUsed=true", async () => {
    const { ctx } = createEmployeeContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.bookings.getRecent({ onlyUsed: true });

    // Se houver resultados, todos devem ter status 'used'
    if (result && result.length > 0) {
      result.forEach((booking: any) => {
        expect(booking.status).toBe("used");
      });
    }
  });
});
