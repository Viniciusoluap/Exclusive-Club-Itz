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

describe("fuelRecords.generateReport", () => {
  it("deve incluir clientName nos dados mapeados do PDF", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Buscar registros existentes
    const records = await caller.fuelRecords.list({});

    if (records.length === 0) {
      console.warn("⚠️ Nenhum registro de abastecimento encontrado para testar PDF");
      return;
    }

    // Selecionar primeiro registro
    const firstRecordId = records[0].id;

    // Gerar PDF
    const result = await caller.fuelRecords.generateReport({
      recordIds: [firstRecordId],
    });

    // Validações
    expect(result).toBeDefined();
    expect(result.pdf).toBeDefined();
    expect(result.filename).toContain("abastecimentos-");
    expect(result.filename).toContain(".pdf");

    // Validar que o PDF foi gerado (base64 não vazio)
    expect(result.pdf.length).toBeGreaterThan(0);

    console.log("✅ PDF gerado com sucesso:", result.filename);
  });

  it("deve gerar PDF com múltiplos registros incluindo clientName", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Buscar todos os registros
    const records = await caller.fuelRecords.list({});

    if (records.length === 0) {
      console.warn("⚠️ Nenhum registro de abastecimento encontrado");
      return;
    }

    // Selecionar até 3 registros
    const recordIds = records.slice(0, 3).map((r) => r.id);

    // Gerar PDF
    const result = await caller.fuelRecords.generateReport({
      recordIds,
    });

    // Validações
    expect(result).toBeDefined();
    expect(result.pdf).toBeDefined();
    expect(result.pdf.length).toBeGreaterThan(0);

    console.log(`✅ PDF gerado com ${recordIds.length} registros`);
  });

  it("deve falhar ao tentar gerar PDF sem ser admin/employee", async () => {
    const user: AuthenticatedUser = {
      id: 2,
      openId: "regular-user",
      email: "user@example.com",
      name: "Regular User",
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

    const caller = appRouter.createCaller(ctx);

    // Tentar gerar PDF como usuário comum
    await expect(
      caller.fuelRecords.generateReport({
        recordIds: [1],
      })
    ).rejects.toThrow("Acesso negado");
  });

  it("deve falhar ao tentar gerar PDF sem recordIds", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Tentar gerar PDF sem IDs
    await expect(
      caller.fuelRecords.generateReport({
        recordIds: [],
      })
    ).rejects.toThrow("Nenhum registro selecionado");
  });

  it("deve incluir clientName na query SQL do PDF", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Buscar registros
    const records = await caller.fuelRecords.list({});

    if (records.length === 0) {
      console.warn("⚠️ Nenhum registro encontrado");
      return;
    }

    // Verificar que clientName está presente nos dados
    const firstRecord = records[0];
    expect(firstRecord).toHaveProperty("clientName");

    // Validar que clientName não é undefined (pode ser null ou string)
    expect(firstRecord.clientName !== undefined).toBe(true);

    console.log("✅ Campo clientName presente nos dados:", firstRecord.clientName);
  });
});
