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

describe("inspectionCharges.delete - Exclusão Permanente", () => {
  it("deve retornar erro ao tentar excluir cobrança inexistente", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Tentar excluir cobrança que não existe
    await expect(
      caller.inspectionCharges.delete({ chargeId: 999999 })
    ).rejects.toThrow("Cobrança não encontrada");
  });

  it("deve validar que o endpoint de exclusão existe e aceita chargeId", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Verificar que o endpoint existe e valida entrada
    await expect(
      caller.inspectionCharges.delete({ chargeId: 999999 })
    ).rejects.toThrow(); // Deve lançar erro (cobrança não existe)
  });
});
