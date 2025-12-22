import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

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

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("allowedClients.deleteDocument", () => {
  it("deve deletar contrato principal (contract_url)", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Criar cliente de teste
    await caller.allowedClients.create({
      email: "test-delete-contract@example.com",
      name: "Test Delete Contract",
      phone: "11999999999",
      quotas: [],
    });

    // Buscar cliente criado
    const client = await db.getAllowedClientByEmail("test-delete-contract@example.com");
    expect(client).toBeDefined();
    if (!client) throw new Error("Cliente não criado");

    // Simular upload de contrato
    await db.updateAllowedClient(client.id, {
      contractUrl: "https://example.com/contract.pdf",
    });

    // Verificar que contrato foi salvo
    const clientWithContract = await db.getAllowedClientById(client.id);
    expect(clientWithContract?.contractUrl).toBe("https://example.com/contract.pdf");

    // Deletar documento
    const result = await caller.allowedClients.deleteDocument({
      clientId: client.id,
      documentType: "contract",
    });

    expect(result.success).toBe(true);

    // Verificar que campo foi setado para null
    const clientAfterDelete = await db.getAllowedClientById(client.id);
    expect(clientAfterDelete?.contractUrl).toBeNull();

    // Cleanup
    await db.deleteAllowedClient(client.id);
  });

  it("deve deletar contrato 2 (contract2_url)", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Criar cliente de teste
    await caller.allowedClients.create({
      email: "test-delete-contract2@example.com",
      name: "Test Delete Contract 2",
      phone: "11999999999",
      quotas: [],
    });

    // Buscar cliente criado
    const client = await db.getAllowedClientByEmail("test-delete-contract2@example.com");
    expect(client).toBeDefined();
    if (!client) throw new Error("Cliente não criado");

    // Simular upload de contrato 2
    await db.updateAllowedClient(client.id, {
      contract2Url: "https://example.com/contract2.pdf",
    });

    // Verificar que contrato 2 foi salvo
    const clientWithContract = await db.getAllowedClientById(client.id);
    expect(clientWithContract?.contract2Url).toBe("https://example.com/contract2.pdf");

    // Deletar documento
    const result = await caller.allowedClients.deleteDocument({
      clientId: client.id,
      documentType: "contract2",
    });

    expect(result.success).toBe(true);

    // Verificar que campo foi setado para null
    const clientAfterDelete = await db.getAllowedClientById(client.id);
    expect(clientAfterDelete?.contract2Url).toBeNull();

    // Cleanup
    await db.deleteAllowedClient(client.id);
  });

  it("deve deletar documento pessoal (document_url)", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Criar cliente de teste
    await caller.allowedClients.create({
      email: "test-delete-document@example.com",
      name: "Test Delete Document",
      phone: "11999999999",
      quotas: [],
    });

    // Buscar cliente criado
    const client = await db.getAllowedClientByEmail("test-delete-document@example.com");
    expect(client).toBeDefined();
    if (!client) throw new Error("Cliente não criado");

    // Simular upload de documento
    await db.updateAllowedClient(client.id, {
      documentUrl: "https://example.com/document.pdf",
    });

    // Verificar que documento foi salvo
    const clientWithDocument = await db.getAllowedClientById(client.id);
    expect(clientWithDocument?.documentUrl).toBe("https://example.com/document.pdf");

    // Deletar documento
    const result = await caller.allowedClients.deleteDocument({
      clientId: client.id,
      documentType: "document",
    });

    expect(result.success).toBe(true);

    // Verificar que campo foi setado para null
    const clientAfterDelete = await db.getAllowedClientById(client.id);
    expect(clientAfterDelete?.documentUrl).toBeNull();

    // Cleanup
    await db.deleteAllowedClient(client.id);
  });

  it("deve retornar success mesmo se documento já estiver null", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Criar cliente de teste sem documentos
    await caller.allowedClients.create({
      email: "test-delete-null@example.com",
      name: "Test Delete Null",
      phone: "11999999999",
      quotas: [],
    });

    // Buscar cliente criado
    const client = await db.getAllowedClientByEmail("test-delete-null@example.com");
    expect(client).toBeDefined();
    if (!client) throw new Error("Cliente não criado");

    // Tentar deletar documento que não existe
    const result = await caller.allowedClients.deleteDocument({
      clientId: client.id,
      documentType: "contract",
    });

    expect(result.success).toBe(true);

    // Cleanup
    await db.deleteAllowedClient(client.id);
  });
});
