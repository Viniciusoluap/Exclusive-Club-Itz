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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("employee.upcomingReservations", () => {
  it("permite acesso de funcionário", async () => {
    const { ctx } = createEmployeeContext();
    const caller = appRouter.createCaller(ctx);

    // Não deve lançar erro de permissão
    const result = await caller.employee.upcomingReservations();
    
    // Deve retornar array (pode estar vazio se não houver reservas)
    expect(Array.isArray(result)).toBe(true);
  });

  it("retorna apenas reservas confirmadas", async () => {
    const { ctx } = createEmployeeContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employee.upcomingReservations();
    
    // Todas as reservas devem ter status 'confirmed'
    result.forEach((reservation: any) => {
      expect(reservation.status).toBe("confirmed");
    });
  });

  it("retorna reservas ordenadas por data crescente", async () => {
    const { ctx } = createEmployeeContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employee.upcomingReservations();
    
    if (result.length > 1) {
      // Verificar que as datas estão em ordem crescente
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].bookingDate).toBeLessThanOrEqual(result[i + 1].bookingDate);
      }
    }
  });

  it("retorna no máximo 21 reservas", async () => {
    const { ctx } = createEmployeeContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employee.upcomingReservations();
    
    expect(result.length).toBeLessThanOrEqual(21);
  });

  it("bloqueia acesso de usuário comum", async () => {
    const user: AuthenticatedUser = {
      id: 3,
      openId: "user-test",
      email: "user@test.com",
      name: "Test User",
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

    const caller = appRouter.createCaller(ctx);

    // Deve lançar erro de permissão
    await expect(caller.employee.upcomingReservations()).rejects.toThrow("Employee access required");
  });
});
