import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-test",
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

describe("maintenances.create", () => {
  it("creates a maintenance successfully", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const startDate = new Date("2025-12-20T08:00:00").getTime();
    const endDate = new Date("2025-12-25T18:00:00").getTime();

    // Busca dinâmica de uma embarcação real (não depende de id fixo do banco de produção).
    const vessels = await caller.vessels.listAll();
    const vessel = vessels.find((v) => v.name === "Teste Focker Lancha") ?? vessels[0];
    if (!vessel) throw new Error("Nenhuma embarcação disponível para teste");

    // @ts-ignore - maintenances router exists
    const result = await caller.maintenances.create({
      vesselId: vessel.id,
      startDate,
      endDate,
      description: "Teste vitest - revisão completa",
      status: "scheduled",
    });

    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    console.log("✅ Manutenção criada com sucesso:", result);
  });

  it("rejects creation with invalid dates", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const startDate = new Date("2025-12-25T18:00:00").getTime();
    const endDate = new Date("2025-12-20T08:00:00").getTime(); // End before start

    // Busca dinâmica de uma embarcação real (não depende de id fixo do banco de produção).
    const vessels = await caller.vessels.listAll();
    const vessel = vessels.find((v) => v.name === "Teste Focker Lancha") ?? vessels[0];
    if (!vessel) throw new Error("Nenhuma embarcação disponível para teste");

    await expect(
      // @ts-ignore
      caller.maintenances.create({
        vesselId: vessel.id,
        startDate,
        endDate,
        description: "Teste com datas inválidas",
        status: "scheduled",
      })
    ).rejects.toThrow();
  });
});
