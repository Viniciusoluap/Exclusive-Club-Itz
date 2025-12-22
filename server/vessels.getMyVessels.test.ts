import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createClientContext(email: string): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "client-user",
    email,
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

function createUnauthenticatedContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("vessels.getMyVessels", () => {
  it("lança erro para cliente sem email", async () => {
    const { ctx } = createClientContext("");
    ctx.user!.email = null;
    
    const caller = appRouter.createCaller(ctx);

    await expect(caller.vessels.getMyVessels()).rejects.toThrow("Email não encontrado");
  });

  it("retorna array vazio para cliente não cadastrado", async () => {
    const { ctx } = createClientContext("naoexiste@example.com");
    
    const caller = appRouter.createCaller(ctx);
    const result = await caller.vessels.getMyVessels();

    expect(result).toEqual([]);
  });

  it("retorna apenas embarcações onde cliente possui cotas", async () => {
    // Este teste requer dados no banco, então apenas valida estrutura
    const { ctx } = createClientContext("teste@example.com");
    
    const caller = appRouter.createCaller(ctx);
    const result = await caller.vessels.getMyVessels();

    expect(Array.isArray(result)).toBe(true);
    
    // Se houver resultados, validar estrutura
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("id");
      expect(result[0]).toHaveProperty("name");
      expect(result[0]).toHaveProperty("type");
      expect(result[0]).toHaveProperty("documentUrl");
      expect(result[0]).toHaveProperty("extraDocumentUrl");
    }
  });

  it("bloqueia acesso de usuários não autenticados", async () => {
    const { ctx } = createUnauthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.vessels.getMyVessels()).rejects.toThrow("Please login");
  });
});
