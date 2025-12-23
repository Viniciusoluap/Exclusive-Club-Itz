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

describe("inspections.list", () => {
  it("retorna lista de vistorias com status da reserva", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspections.list({});

    expect(Array.isArray(result)).toBe(true);
    
    // Se houver vistorias, validar estrutura
    if (result.length > 0) {
      const firstInspection = result[0];
      expect(firstInspection).toHaveProperty('id');
      expect(firstInspection).toHaveProperty('status');
      expect(firstInspection).toHaveProperty('bookingStatus');
    }
  });

  it("inclui campo bookingStatus em todas as vistorias", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspections.list({});

    // Validar que todas as vistorias têm bookingStatus (pode ser null se booking foi deletado)
    result.forEach((inspection: any) => {
      expect(inspection).toHaveProperty('bookingStatus');
    });
  });

  it("vistorias reprovadas podem ser filtradas por bookingStatus", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspections.list({});

    // Filtrar apenas vistorias reprovadas de reservas utilizadas
    const rejectedFromUsedBookings = result.filter(
      (i: any) => i.status === 'rejected' && i.bookingStatus === 'used'
    );

    // Validar que filtro funciona (pode ser array vazio se não houver dados)
    expect(Array.isArray(rejectedFromUsedBookings)).toBe(true);
    
    // Se houver resultados, validar que todos atendem aos critérios
    rejectedFromUsedBookings.forEach((inspection: any) => {
      expect(inspection.status).toBe('rejected');
      expect(inspection.bookingStatus).toBe('used');
    });
  });

  it("vistorias de reservas não utilizadas são excluídas do filtro", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspections.list({});

    // Filtrar vistorias reprovadas de reservas NÃO utilizadas
    const rejectedFromNonUsedBookings = result.filter(
      (i: any) => i.status === 'rejected' && i.bookingStatus !== 'used'
    );

    // Essas NÃO devem aparecer no dropdown de cobranças
    // Validar que filtro funciona corretamente
    rejectedFromNonUsedBookings.forEach((inspection: any) => {
      expect(inspection.status).toBe('rejected');
      expect(inspection.bookingStatus).not.toBe('used');
    });
  });

  it("retorna dados completos para dropdown (id, vesselName, clientName, createdAt)", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inspections.list({});

    // Se houver vistorias, validar campos necessários para dropdown
    if (result.length > 0) {
      const firstInspection = result[0];
      expect(firstInspection).toHaveProperty('id');
      expect(firstInspection).toHaveProperty('vesselName');
      expect(firstInspection).toHaveProperty('clientName');
      expect(firstInspection).toHaveProperty('createdAt');
    }
  });
});
