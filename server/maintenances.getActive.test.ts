import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createTestContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("maintenances.getActive", () => {
  it("retorna manutenções ativas no período de novembro 2025", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Período: novembro 2025 (01/11/2025 00:00 - 30/11/2025 23:59)
    const startDate = new Date("2025-11-01T00:00:00Z").getTime();
    const endDate = new Date("2025-11-30T23:59:59Z").getTime();

    console.log("[TEST] Buscando manutenções entre:");
    console.log("  Start:", startDate, "=", new Date(startDate).toISOString());
    console.log("  End:", endDate, "=", new Date(endDate).toISOString());

    const maintenances = await caller.maintenances.getActive({
      startDate,
      endDate,
    });

    console.log("[TEST] Manutenções retornadas:", maintenances.length);
    maintenances.forEach((m: any) => {
      console.log("  -", m.vesselName, ":", {
        start: new Date(m.startDate).toISOString(),
        end: new Date(m.endDate).toISOString(),
        status: m.status,
      });
    });

    // Deve retornar pelo menos 1 manutenção (JETSKI 29/11-03/12)
    expect(maintenances.length).toBeGreaterThan(0);
    
    // Verificar que todas têm status scheduled
    maintenances.forEach((m: any) => {
      expect(m.status).toBe("scheduled");
    });
  });

  it("retorna manutenções ativas no período de dezembro 2025", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Período: dezembro 2025 (01/12/2025 00:00 - 31/12/2025 23:59)
    const startDate = new Date("2025-12-01T00:00:00Z").getTime();
    const endDate = new Date("2025-12-31T23:59:59Z").getTime();

    const maintenances = await caller.maintenances.getActive({
      startDate,
      endDate,
    });

    console.log("[TEST] Manutenções em dezembro:", maintenances.length);

    // Deve retornar pelo menos 1 manutenção (JETSKI termina em 03/12)
    expect(maintenances.length).toBeGreaterThan(0);
  });
});
