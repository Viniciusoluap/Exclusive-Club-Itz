import { eq } from "drizzle-orm";
import { systemSettings, type InsertSystemSetting } from "../drizzle/schema";
import { getDb } from "./db";
import * as crypto from "crypto";

/**
 * Simple encryption/decryption using AES-256-CBC
 * For production, consider using a more robust solution
 */
const ENCRYPTION_KEY = process.env.JWT_SECRET || "default-encryption-key-change-me";
const ALGORITHM = "aes-256-cbc";
const DERIVED_KEY = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, DERIVED_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  const iv = Buffer.from(parts[0]!, "hex");
  const encrypted = parts[1]!;
  const decipher = crypto.createDecipheriv(ALGORITHM, DERIVED_KEY, iv);
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
          updatedAt: new Date().toISOString(),
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
    console.warn("[SystemSettings] Cannot delete setting: database not available");
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
    console.warn("[SystemSettings] Cannot list settings: database not available");
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
