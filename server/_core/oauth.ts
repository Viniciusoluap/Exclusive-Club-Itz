import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePassword(supplied: string, stored: string): Promise<boolean> {
  const [hashedPassword, salt] = stored.split(".");
  if (!hashedPassword || !salt) return false;
  const hashedBuf = Buffer.from(hashedPassword, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function registerOAuthRoutes(app: Express) {
  // Login with email + password
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios" });
    }

    const user = await db.getUserByEmail(email);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Email ou senha incorretos" });
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Email ou senha incorretos" });
    }

    const sessionToken = await sdk.createSessionToken(user.openId, {
      name: user.name || "",
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date().toISOString() });

    return res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  });

  // Change own password (authenticated)
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Senha atual e nova senha são obrigatórias" });
    }

    if (!user.passwordHash) {
      return res.status(400).json({ error: "Usuário não possui senha definida" });
    }

    const isValid = await comparePassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Senha atual incorreta" });
    }

    const passwordHash = await hashPassword(newPassword);
    await db.updateUserPasswordHash(user.id, passwordHash);

    return res.json({ success: true });
  });

  // Admin: set/create user password
  app.post("/api/auth/admin/set-user-password", async (req: Request, res: Response) => {
    let adminUser;
    try {
      adminUser = await sdk.authenticateRequest(req);
    } catch {
      return res.status(401).json({ error: "Não autenticado" });
    }

    if (adminUser.role !== "admin") {
      return res.status(403).json({ error: "Acesso negado" });
    }

    const { email, password, name, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios" });
    }

    const passwordHash = await hashPassword(password);
    const existingUser = await db.getUserByEmail(email);

    if (existingUser) {
      await db.updateUserPasswordHash(existingUser.id, passwordHash);
    } else {
      const { nanoid } = await import("nanoid");
      await db.createUser({
        openId: `user-${nanoid()}`,
        email,
        name: name || email.split("@")[0],
        passwordHash,
        role: role || "user",
        loginMethod: "credentials",
        lastSignedIn: new Date().toISOString(),
      });
    }

    return res.json({ success: true });
  });
}
