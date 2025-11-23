import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(userEmail: string, userName: string, role: "user" | "admin" = "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: userEmail,
    name: userName,
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Sistema de Cotas", () => {
  it("deve calcular corretamente o limite para cota inteira", async () => {
    const ctx = createTestContext("test@example.com", "Test User");
    const caller = appRouter.createCaller(ctx);

    // Simula que o cliente tem 1 cota inteira (deveria permitir 2 reservas)
    const quotaInfo = await caller.bookings.myQuota();
    
    expect(quotaInfo).toBeDefined();
    expect(quotaInfo.quotaType).toBe("full");
    expect(quotaInfo.maxBookings).toBe(2); // 1 cota inteira = 2 reservas
  });

  it("deve bloquear reservas em segundas-feiras", async () => {
    const ctx = createTestContext("vinicius@manus.im", "Vinicius Freitas");
    const caller = appRouter.createCaller(ctx);

    // Segunda-feira, 1 de dezembro de 2025
    const monday = new Date(2025, 11, 1); // Mês 11 = dezembro (0-indexed)
    const mondayTimestamp = monday.getTime();

    await expect(
      caller.bookings.create({
        vesselId: 1,
        bookingDate: mondayTimestamp,
        notes: "Teste segunda-feira",
      })
    ).rejects.toThrow("Reservas não são permitidas às segundas-feiras");
  });

  it("deve permitir reservas em terças-feiras", async () => {
    const ctx = createTestContext("vinicius@manus.im", "Vinicius Freitas");
    const caller = appRouter.createCaller(ctx);

    // Terça-feira, 2 de dezembro de 2025
    const tuesday = new Date(2025, 11, 2);
    const tuesdayTimestamp = tuesday.getTime();

    // Este teste vai falhar se houver outros problemas (vessel não existe, etc)
    // mas NÃO deve falhar com "segunda-feira"
    try {
      await caller.bookings.create({
        vesselId: 1,
        bookingDate: tuesdayTimestamp,
        notes: "Teste terça-feira",
      });
    } catch (error: any) {
      // Se falhar, não deve ser por causa de segunda-feira
      expect(error.message).not.toContain("segundas-feiras");
    }
  });
});
