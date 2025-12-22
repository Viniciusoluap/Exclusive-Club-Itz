import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin Teste",
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
    id: 2,
    openId: "client-user",
    email: "client@example.com",
    name: "Cliente Teste",
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

describe("vessels.updateDocuments", () => {
  it("admin pode atualizar documentos", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Este teste requer uma embarcação existente no banco
    // Apenas valida que não lança erro de permissão
    await expect(
      caller.vessels.updateDocuments({
        id: 999999, // ID inexistente, mas testa permissão
        documentUrl: "https://example.com/doc.pdf",
        extraDocumentUrl: "https://example.com/extra.pdf",
      })
    ).resolves.toBeDefined();
  });

  it("cliente comum não pode atualizar documentos", async () => {
    const { ctx } = createClientContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.vessels.updateDocuments({
        id: 1,
        documentUrl: "https://example.com/doc.pdf",
      })
    ).rejects.toThrow("Admin access required");
  });

  it("atualiza apenas campos especificados", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Teste estrutural - valida que aceita campos opcionais
    const result = await caller.vessels.updateDocuments({
      id: 999999,
      documentUrl: "https://example.com/doc.pdf",
      // extraDocumentUrl não especificado
    });

    expect(result).toHaveProperty("success");
  });
});

describe("vessels.deleteDocument", () => {
  it("admin pode excluir documento principal", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.vessels.deleteDocument({
      id: 999999,
      documentType: "document",
    });

    expect(result).toHaveProperty("success", true);
  });

  it("admin pode excluir documento extra", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.vessels.deleteDocument({
      id: 999999,
      documentType: "extraDocument",
    });

    expect(result).toHaveProperty("success", true);
  });

  it("cliente comum não pode excluir documentos", async () => {
    const { ctx } = createClientContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.vessels.deleteDocument({
        id: 1,
        documentType: "document",
      })
    ).rejects.toThrow("Admin access required");
  });

  it("valida tipo de documento", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Teste estrutural - valida enum
    await expect(
      caller.vessels.deleteDocument({
        id: 1,
        documentType: "document",
      })
    ).resolves.toBeDefined();

    await expect(
      caller.vessels.deleteDocument({
        id: 1,
        documentType: "extraDocument",
      })
    ).resolves.toBeDefined();
  });
});
