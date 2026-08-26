import { eq } from "drizzle-orm";
import { systemSettings, type InsertSystemSetting } from "../drizzle/schema";
import { getDb } from "./db";
import { toMysqlDatetime } from "./_core/dateBR";
import * as crypto from "crypto";

/**
 * Simple encryption/decryption using AES-256-CBC
 * For production, consider using a more robust solution
 *
 * Encryption key resolution (in priority order):
 *   1. SETTINGS_ENCRYPTION_KEY — dedicated secret for settings-at-rest (RECOMMENDED)
 *   2. JWT_SECRET — INSECURE fallback: reuses the session/JWT secret. Anyone who
 *      obtains JWT_SECRET (e.g. leaked in a backup) can also decrypt these settings.
 *   3. hardcoded default — dev only
 *
 * ⚠️ MIGRATION NOTE: Existing rows in `system_settings` are encrypted with whatever
 * key was active when they were saved. If SETTINGS_ENCRYPTION_KEY is configured for
 * the first time on an environment that already has settings encrypted from JWT_SECRET,
 * those old values will FAIL to decrypt until they are re-saved. Required manual action
 * after setting SETTINGS_ENCRYPTION_KEY: re-save every existing setting (e.g. reopen the
 * admin Settings panel and save the Asaas API key again) so it is re-encrypted with the
 * new key. This is intentional and non-destructive — nothing breaks until you opt in.
 */
const ALGORITHM = "aes-256-cbc";

let warnedInsecureFallback = false;
let cachedDerivedKey: Buffer | null = null;

/**
 * Resolves the secret used to derive the settings encryption key.
 * Emits a one-time warning when falling back to the insecure JWT_SECRET path.
 * Never logs the secret value itself.
 */
function resolveEncryptionSecret(): string {
  const dedicated = process.env.SETTINGS_ENCRYPTION_KEY;
  if (dedicated && dedicated.length > 0) {
    return dedicated;
  }

  if (!warnedInsecureFallback) {
    warnedInsecureFallback = true;
    console.warn(
      "[SystemSettings] SETTINGS_ENCRYPTION_KEY is not set — deriving the settings " +
        "encryption key from JWT_SECRET (INSECURE: reuses the session/JWT secret). " +
        "Configure a dedicated SETTINGS_ENCRYPTION_KEY. NOTE: after setting it, existing " +
        "encrypted settings must be re-saved so they are re-encrypted with the new key."
    );
  }

  return process.env.JWT_SECRET || "default-encryption-key-change-me";
}

function getDerivedKey(): Buffer {
  if (!cachedDerivedKey) {
    cachedDerivedKey = crypto.scryptSync(resolveEncryptionSecret(), "salt", 32);
  }
  return cachedDerivedKey;
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getDerivedKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  const iv = Buffer.from(parts[0]!, "hex");
  const encrypted = parts[1]!;
  const decipher = crypto.createDecipheriv(ALGORITHM, getDerivedKey(), iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Get a setting value by key (decrypted)
 */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[SystemSettings] Cannot get setting: database not available");
    return null;
  }

  try {
    const result = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const encryptedValue = result[0]!.value;
    return decrypt(encryptedValue);
  } catch (error) {
    console.error(`[SystemSettings] Failed to get setting "${key}":`, error);
    return null;
  }
}

/**
 * Check whether a setting exists without returning or decrypting its value.
 * This is the only read path that the admin UI should use for secrets.
 */
export async function hasSetting(key: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const result = await db
      .select({ key: systemSettings.key })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    return result.length > 0;
  } catch (error) {
    console.error(`[SystemSettings] Failed to check setting "${key}":`, error);
    return false;
  }
}

/**
 * Set a setting value (encrypted)
 */
export async function setSetting(
  key: string,
  value: string,
  description?: string,
  updatedBy?: string
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[SystemSettings] Cannot set setting: database not available");
    return;
  }

  try {
    const encryptedValue = encrypt(value);

    const insertData: InsertSystemSetting = {
      key,
      value: encryptedValue,
      description: description || null,
      updatedBy: updatedBy || null,
    };

    await db
      .insert(systemSettings)
      .values(insertData)
      .onDuplicateKeyUpdate({
        set: {
          value: encryptedValue,
          description: description || null,
          updatedBy: updatedBy || null,
          updatedAt: toMysqlDatetime(),
        },
      });
  } catch (error) {
    console.error(`[SystemSettings] Failed to set setting "${key}":`, error);
    throw error;
  }
}

/**
 * Delete a setting
 */
export async function deleteSetting(key: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[SystemSettings] Cannot delete setting: database not available"
    );
    return;
  }

  try {
    await db.delete(systemSettings).where(eq(systemSettings.key, key));
  } catch (error) {
    console.error(`[SystemSettings] Failed to delete setting "${key}":`, error);
    throw error;
  }
}

/**
 * List all settings (without decrypted values for security)
 */
export async function listSettings(): Promise<
  Array<{
    key: string;
    description: string | null;
    updatedBy: string | null;
    updatedAt: string;
  }>
> {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[SystemSettings] Cannot list settings: database not available"
    );
    return [];
  }

  try {
    const result = await db
      .select({
        key: systemSettings.key,
        description: systemSettings.description,
        updatedBy: systemSettings.updatedBy,
        updatedAt: systemSettings.updatedAt,
      })
      .from(systemSettings);

    return result;
  } catch (error) {
    console.error("[SystemSettings] Failed to list settings:", error);
    return [];
  }
}
