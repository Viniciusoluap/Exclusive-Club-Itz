import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import fs from 'fs';
import path from 'path';

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const CREDENTIALS_PATH = path.join(process.cwd(), 'google-drive-credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'google-drive-token.json');

function createAdminContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@exclusiveclub.com",
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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

function createNonAdminContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@exclusiveclub.com",
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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("backupConfigRouter", () => {
  // Limpar arquivos de teste antes e depois
  beforeEach(() => {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      fs.unlinkSync(CREDENTIALS_PATH);
    }
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
  });

  afterEach(() => {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      fs.unlinkSync(CREDENTIALS_PATH);
    }
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
  });

  describe("getStatus", () => {
    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.backupConfig.getStatus()
      ).rejects.toThrow();
    });

    it("deve retornar status false quando não há credenciais", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.backupConfig.getStatus();

      expect(result.hasCredentials).toBe(false);
      expect(result.hasToken).toBe(false);
      expect(result.isConfigured).toBe(false);
    });

    it("deve retornar status true quando credenciais existem", async () => {
      // Criar arquivo de credenciais fake
      fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ installed: { client_id: "test" } }));

      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.backupConfig.getStatus();

      expect(result.hasCredentials).toBe(true);
      expect(result.hasToken).toBe(false);
      expect(result.isConfigured).toBe(false);
    });
  });

  describe("saveCredentials", () => {
    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.backupConfig.saveCredentials({
          credentials: JSON.stringify({ installed: { client_id: "test" } })
        })
      ).rejects.toThrow();
    });

    it("deve salvar credenciais válidas", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const validCredentials = {
        installed: {
          client_id: "test-client-id",
          client_secret: "test-secret",
          redirect_uris: ["http://localhost"]
        }
      };

      const result = await caller.backupConfig.saveCredentials({
        credentials: JSON.stringify(validCredentials)
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(CREDENTIALS_PATH)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
      expect(saved.installed.client_id).toBe("test-client-id");
    });

    it("deve rejeitar credenciais inválidas", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.backupConfig.saveCredentials({
          credentials: JSON.stringify({ invalid: "structure" })
        })
      ).rejects.toThrow(/inválido/);
    });

    it("deve rejeitar JSON malformado", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.backupConfig.saveCredentials({
          credentials: "not a json"
        })
      ).rejects.toThrow();
    });
  });

  describe("resetConfig", () => {
    it("deve negar acesso para não-admin", async () => {
      const { ctx } = createNonAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.backupConfig.resetConfig()
      ).rejects.toThrow();
    });

    it("deve remover credenciais e token", async () => {
      // Criar arquivos fake
      fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ installed: { client_id: "test" } }));
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({ access_token: "test" }));

      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.backupConfig.resetConfig();

      expect(result.success).toBe(true);
      expect(fs.existsSync(CREDENTIALS_PATH)).toBe(false);
      expect(fs.existsSync(TOKEN_PATH)).toBe(false);
    });

    it("deve funcionar mesmo quando arquivos não existem", async () => {
      const { ctx } = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.backupConfig.resetConfig();

      expect(result.success).toBe(true);
    });
  });
});
