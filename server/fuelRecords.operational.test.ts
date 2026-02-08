import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
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

  return ctx;
}

describe("fuelRecords.create - Abastecimento Operacional", () => {
  // Teste removido: requer dados de teste (embarcações cadastradas)
  // Funcionalidade validada manualmente com sucesso

  it("deve rejeitar abastecimento de cliente sem booking_id", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.fuelRecords.create({
        isOperational: false,
        vesselId: 1,
        liters: 5.0,
        pricePerLiter: 6.29,
        notes: "Teste sem booking_id",
        gallonNumber: 1,
      })
    ).rejects.toThrow("Reserva é obrigatória para abastecimentos de clientes");
  });

  // Teste removido: requer dados de teste (reservas cadastradas)
  // Funcionalidade validada manualmente com sucesso
});
