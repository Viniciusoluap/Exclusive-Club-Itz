import { createHash, timingSafeEqual } from "node:crypto";
import { desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { getDb } from "./db";
import { getSetting } from "./systemSettings";
import { ENV } from "./_core/env";

const {
  openFinanceConnections,
  openFinanceAccounts,
  openFinanceTransactions,
  openFinanceWebhookEvents,
  openFinanceSyncRuns,
} = schema;

const DEFAULT_API_URL = "https://api.pluggy.ai";
const MAX_TRANSACTION_PAGES = 1000;

type PluggyConfig = {
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  publicAppUrl: string;
};

async function resolvePluggyConfig(): Promise<PluggyConfig> {
  const [clientId, clientSecret, webhookSecret, publicAppUrl] =
    await Promise.all([
      getSetting("pluggy_client_id"),
      getSetting("pluggy_client_secret"),
      getSetting("pluggy_webhook_secret"),
      getSetting("public_app_url"),
    ]);

  return {
    clientId: ENV.pluggyClientId || clientId || "",
    clientSecret: ENV.pluggyClientSecret || clientSecret || "",
    webhookSecret: ENV.pluggyWebhookSecret || webhookSecret || "",
    publicAppUrl: ENV.publicAppUrl || publicAppUrl || "",
  };
}
const CONNECTED_ITEM_STATUSES = new Set([
  "UPDATED",
  "LOGIN_SUCCESS",
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "READY",
]);

export type PluggyItem = {
  id: string;
  status?: string | null;
  executionStatus?: string | null;
  error?: { code?: string | null; message?: string | null } | null;
  clientUserId?: string | null;
  connector?: { name?: string | null } | null;
};

export type PluggyAccount = {
  id: string;
  name?: string | null;
  type?: string | null;
  subtype?: string | null;
  number?: string | null;
  numberMasked?: string | null;
  currencyCode?: string | null;
  balance?: number | string | null;
  availableBalance?: number | string | null;
  lastUpdatedAt?: string | null;
};

export type PluggyTransaction = {
  id: string;
  date?: string | null;
  description?: string | null;
  amount?: number | string | null;
  type?: string | null;
  currencyCode?: string | null;
  merchant?: { name?: string | null } | null;
  category?: string | { name?: string | null } | null;
  status?: string | null;
};

export type PluggyWebhookPayload = {
  event?: string;
  eventId?: string;
  itemId?: string;
  clientUserId?: string;
  accountId?: string;
  transactionIds?: string[];
  error?: { code?: string | null; message?: string | null } | null;
};

export type SyncResult = {
  connectionId: number;
  accountsImported: number;
  transactionsImported: number;
  pagesRead: number;
};

export class OpenFinanceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_CONFIGURED"
      | "PROVIDER_ERROR"
      | "DATABASE_ERROR"
      | "INVALID_WEBHOOK",
    public readonly status = 500
  ) {
    super(message);
    this.name = "OpenFinanceError";
  }
}

function apiUrl(): string {
  return (ENV.pluggyApiUrl || DEFAULT_API_URL).replace(/\/$/, "");
}

function nowIso(): string {
  return new Date().toISOString();
}

function toDecimal(value: unknown, absolute = false): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0.00";
  return (absolute ? Math.abs(amount) : amount).toFixed(2);
}

function toAmount(value: unknown): string {
  return toDecimal(value, true);
}

function toNumber(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function normalizePluggyItemStatus(
  item: Pick<PluggyItem, "status" | "executionStatus" | "error">
): "pending" | "connected" | "error" | "consent_expired" {
  const normalized = [
    item.status,
    item.executionStatus,
    item.error?.code,
    item.error?.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  if (
    normalized.includes("CONSENT") ||
    normalized.includes("EXPIRED") ||
    normalized === "USER_AUTHORIZATION_PENDING"
  ) {
    return "consent_expired";
  }
  if (
    normalized.includes("ERROR") ||
    normalized.includes("FAILED") ||
    normalized.includes("OUTDATED")
  )
    return "error";
  if (CONNECTED_ITEM_STATUSES.has(normalized)) return "connected";
  return "pending";
}

export function buildPluggyWebhookUrl(publicAppUrl: string): string {
  let url: URL;
  try {
    url = new URL(publicAppUrl);
  } catch {
    throw new OpenFinanceError(
      "PUBLIC_APP_URL inválida para o webhook Pluggy.",
      "NOT_CONFIGURED",
      503
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hostname === "localhost" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new OpenFinanceError(
      "PUBLIC_APP_URL deve usar HTTPS público para o webhook Pluggy.",
      "NOT_CONFIGURED",
      503
    );
  }
  return `${url.origin}/api/webhooks/pluggy`;
}

export function buildPluggyWebhookRegistration(
  publicAppUrl: string,
  webhookSecret: string
) {
  if (!webhookSecret) {
    throw new OpenFinanceError(
      "PLUGGY_WEBHOOK_SECRET não configurado.",
      "NOT_CONFIGURED",
      503
    );
  }
  return {
    event: "all",
    url: buildPluggyWebhookUrl(publicAppUrl),
    headers: { "x-pluggy-webhook-secret": webhookSecret },
  };
}

export function buildPluggyConnectTokenPayload(userId: number, itemId?: string) {
  const payload: Record<string, unknown> = {
    options: {
      clientUserId: `exclusive-user-${userId}`,
      avoidDuplicates: true,
    },
  };
  if (itemId) payload.itemId = itemId;
  return payload;
}

export function buildPluggyTransactionsPath(accountId: string, after?: string) {
  const params = new URLSearchParams({ accountId, pageSize: "500" });
  if (after) params.set("after", after);
  return `/v2/transactions?${params.toString()}`;
}

export function transactionIdsForDeletion(
  payload: PluggyWebhookPayload
): string[] {
  return [...new Set((payload.transactionIds || []).filter(Boolean))].slice(0, 1000);
}

export function normalizePluggyAccount(
  account: PluggyAccount,
  connectionId: number
) {
  return {
    connectionId,
    providerAccountId: account.id,
    name: account.name || "Conta bancária",
    type: account.type || null,
    subtype: account.subtype || null,
    numberMasked:
      account.numberMasked ||
      (account.number ? `****${String(account.number).slice(-4)}` : null),
    currencyCode: account.currencyCode || "BRL",
    balance: toDecimal(account.balance),
    availableBalance:
      account.availableBalance == null
        ? null
        : toDecimal(account.availableBalance),
    lastUpdatedAt: account.lastUpdatedAt || nowIso(),
  };
}

export function normalizePluggyTransaction(
  transaction: PluggyTransaction,
  accountId: number,
  connectionId: number
) {
  const rawAmount = toNumber(transaction.amount);
  const type = String(transaction.type || "").toUpperCase();
  const direction: "credit" | "debit" | "unknown" =
    type.includes("CREDIT") || type.includes("INCOME")
      ? "credit"
      : type.includes("DEBIT") || type.includes("EXPENSE")
        ? "debit"
        : rawAmount > 0
          ? "credit"
          : rawAmount < 0
            ? "debit"
            : "unknown";
  const category =
    typeof transaction.category === "string"
      ? transaction.category
      : transaction.category?.name || null;

  return {
    accountId,
    connectionId,
    providerTransactionId: transaction.id,
    transactionDate: transaction.date || nowIso(),
    description: transaction.description || "Transação bancária",
    amount: toAmount(rawAmount),
    currencyCode: transaction.currencyCode || "BRL",
    direction,
    merchantName: transaction.merchant?.name || null,
    category,
    status: transaction.status || null,
  };
}

export function validatePluggyWebhookSecret(
  receivedSecret: string | undefined,
  configuredSecret = ENV.pluggyWebhookSecret
): boolean {
  if (!configuredSecret || !receivedSecret) return false;
  const configured = Buffer.from(configuredSecret, "utf8");
  const received = Buffer.from(receivedSecret, "utf8");
  return (
    configured.length === received.length &&
    timingSafeEqual(configured, received)
  );
}

export function webhookEventId(payload: PluggyWebhookPayload): string | null {
  if (payload.eventId) return payload.eventId;
  if (!payload.event || (!payload.itemId && !payload.accountId)) return null;
  return createHash("sha256")
    .update(
      JSON.stringify({
        event: payload.event,
        itemId: payload.itemId || null,
        accountId: payload.accountId || null,
        transactionIds: payload.transactionIds || [],
      })
    )
    .digest("hex");
}

async function ensureConfigured(): Promise<PluggyConfig> {
  const config = await resolvePluggyConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new OpenFinanceError(
      "Pluggy ainda não está configurado. Cadastre o Client ID e o Client Secret em Configurações > Open Finance.",
      "NOT_CONFIGURED",
      503
    );
  }
  return config;
}

export async function validateConfiguredPluggyWebhookSecret(
  receivedSecret: string | undefined
): Promise<boolean> {
  const config = await resolvePluggyConfig();
  return validatePluggyWebhookSecret(receivedSecret, config.webhookSecret);
}

async function parseResponse(response: Response): Promise<any> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      body?.message ||
      body?.error ||
      body?.errors?.[0]?.message ||
      `HTTP ${response.status}`;
    throw new OpenFinanceError(
      `Pluggy: ${detail}`,
      "PROVIDER_ERROR",
      response.status >= 500 ? 502 : 400
    );
  }
  return body;
}

async function providerRequest(
  path: string,
  init: RequestInit = {},
  apiKey?: string
): Promise<any> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  if (apiKey) headers.set("x-api-key", apiKey);
  const response = await fetch(`${apiUrl()}${path}`, { ...init, headers });
  return parseResponse(response);
}

export async function createPluggyApiKey(): Promise<string> {
  const config = await ensureConfigured();
  const body = await providerRequest("/auth", {
    method: "POST",
    body: JSON.stringify({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    }),
  });
  if (!body?.apiKey)
    throw new OpenFinanceError(
      "Pluggy não retornou API key.",
      "PROVIDER_ERROR",
      502
    );
  return String(body.apiKey);
}

async function withApiKey<T>(
  operation: (apiKey: string) => Promise<T>
): Promise<T> {
  const apiKey = await createPluggyApiKey();
  return operation(apiKey);
}

let webhookSetup:
  | { key: string; promise: Promise<void> }
  | undefined;

async function ensurePluggyWebhook(
  apiKey: string,
  config: PluggyConfig
): Promise<void> {
  const registration = buildPluggyWebhookRegistration(
    config.publicAppUrl,
    config.webhookSecret
  );
  const key = `${registration.url}\0${config.webhookSecret}`;
  if (webhookSetup?.key === key) return webhookSetup.promise;

  const promise = (async () => {
    const response = await providerRequest("/webhooks", {}, apiKey);
    const webhooks = Array.isArray(response)
      ? response
      : response.results || response.webhooks || [];
    const existing = webhooks.find(
      (webhook: { id?: string; event?: string; url?: string }) =>
        webhook.event === "all" && webhook.url === registration.url
    );
    if (existing?.id) {
      await providerRequest(
        `/webhooks/${encodeURIComponent(existing.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            headers: registration.headers,
            enabled: true,
          }),
        },
        apiKey
      );
      return;
    }
    await providerRequest(
      "/webhooks",
      { method: "POST", body: JSON.stringify(registration) },
      apiKey
    );
  })();
  webhookSetup = { key, promise };
  try {
    await promise;
  } catch (error) {
    if (webhookSetup?.promise === promise) webhookSetup = undefined;
    throw error;
  }
}

export async function createPluggyConnectToken(
  userId: number,
  itemId?: string
) {
  const config = await resolvePluggyConfig();
  return withApiKey(async apiKey => {
    await ensurePluggyWebhook(apiKey, config);
    const payload = buildPluggyConnectTokenPayload(userId, itemId);
    const result = await providerRequest(
      "/connect_token",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      apiKey
    );
    return {
      accessToken: String(result.accessToken || result.connectToken || ""),
    };
  });
}

async function getPluggyItem(
  apiKey: string,
  itemId: string
): Promise<PluggyItem> {
  return providerRequest(
    `/items/${encodeURIComponent(itemId)}`,
    {},
    apiKey
  ) as Promise<PluggyItem>;
}

async function getPluggyAccounts(
  apiKey: string,
  itemId: string
): Promise<PluggyAccount[]> {
  const result = await providerRequest(
    `/accounts?itemId=${encodeURIComponent(itemId)}`,
    {},
    apiKey
  );
  return Array.isArray(result)
    ? result
    : result.results || result.accounts || [];
}

async function getPluggyTransactionsPage(
  apiKey: string,
  accountId: string,
  after?: string
): Promise<{ results: PluggyTransaction[]; next?: string | null }> {
  const result = await providerRequest(
    buildPluggyTransactionsPath(accountId, after),
    {},
    apiKey
  );
  return {
    results: Array.isArray(result)
      ? result
      : result.results || result.transactions || [],
    next: result.next || null,
  };
}

export function nextCursor(next: string | null | undefined): string | undefined {
  if (!next) return undefined;
  try {
    return new URL(next, apiUrl()).searchParams.get("after") || undefined;
  } catch {
    return undefined;
  }
}

export async function testPluggyConnection() {
  try {
    await withApiKey(async apiKey => {
      await providerRequest("/connectors?countries=BR", {}, apiKey);
    });
    return {
      success: true,
      message:
        "API Pluggy conectada. Credenciais válidas para consultar conectores brasileiros.",
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível validar a API Pluggy.",
    };
  }
}

export async function listOpenFinanceConnections(userId?: number) {
  const db = await getDb();
  if (!db)
    throw new OpenFinanceError(
      "Banco de dados indisponível.",
      "DATABASE_ERROR",
      503
    );
  return db
    .select()
    .from(openFinanceConnections)
    .where(
      userId == null ? undefined : eq(openFinanceConnections.userId, userId)
    )
    .orderBy(desc(openFinanceConnections.updatedAt));
}

export async function getOpenFinanceConnection(id: number) {
  const db = await getDb();
  if (!db)
    throw new OpenFinanceError(
      "Banco de dados indisponível.",
      "DATABASE_ERROR",
      503
    );
  const rows = await db
    .select()
    .from(openFinanceConnections)
    .where(eq(openFinanceConnections.id, id))
    .limit(1);
  return rows[0] || null;
}

export async function getOpenFinanceConnectionForUser(
  id: number,
  userId: number
) {
  const connection = await getOpenFinanceConnection(id);
  if (!connection || connection.userId !== userId) return null;
  return connection;
}

export async function listOpenFinanceAccounts(connectionId?: number) {
  const db = await getDb();
  if (!db)
    throw new OpenFinanceError(
      "Banco de dados indisponível.",
      "DATABASE_ERROR",
      503
    );
  return db
    .select()
    .from(openFinanceAccounts)
    .where(
      connectionId == null
        ? undefined
        : eq(openFinanceAccounts.connectionId, connectionId)
    )
    .orderBy(desc(openFinanceAccounts.updatedAt));
}

async function upsertAccount(
  db: any,
  account: ReturnType<typeof normalizePluggyAccount>
) {
  await db
    .insert(openFinanceAccounts)
    .values(account)
    .onDuplicateKeyUpdate({
      set: {
        connectionId: account.connectionId,
        name: account.name,
        type: account.type,
        subtype: account.subtype,
        numberMasked: account.numberMasked,
        currencyCode: account.currencyCode,
        balance: account.balance,
        availableBalance: account.availableBalance,
        lastUpdatedAt: account.lastUpdatedAt,
      },
    });
  const rows = await db
    .select()
    .from(openFinanceAccounts)
    .where(eq(openFinanceAccounts.providerAccountId, account.providerAccountId))
    .limit(1);
  return rows[0];
}

async function upsertTransaction(
  db: any,
  transaction: ReturnType<typeof normalizePluggyTransaction>
) {
  await db
    .insert(openFinanceTransactions)
    .values(transaction)
    .onDuplicateKeyUpdate({
      set: {
        accountId: transaction.accountId,
        connectionId: transaction.connectionId,
        transactionDate: transaction.transactionDate,
        description: transaction.description,
        amount: transaction.amount,
        currencyCode: transaction.currencyCode,
        direction: transaction.direction,
        merchantName: transaction.merchantName,
        category: transaction.category,
        status: transaction.status,
      },
    });
}

async function markConnectionError(connectionId: number, error: unknown) {
  const db = await getDb();
  if (!db) return;
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(openFinanceConnections)
    .set({
      status: "error",
      errorCode: error instanceof OpenFinanceError ? error.code : "SYNC_ERROR",
      errorMessage: message.slice(0, 1000),
    })
    .where(eq(openFinanceConnections.id, connectionId));
}

export async function syncOpenFinanceConnection(
  connectionId: number,
  trigger: "manual" | "webhook" | "scheduled" = "manual"
): Promise<SyncResult> {
  await ensureConfigured();
  const db = await getDb();
  if (!db)
    throw new OpenFinanceError(
      "Banco de dados indisponível.",
      "DATABASE_ERROR",
      503
    );
  const connection = await getOpenFinanceConnection(connectionId);
  if (!connection)
    throw new OpenFinanceError(
      "Conexão Open Finance não encontrada.",
      "DATABASE_ERROR",
      404
    );

  const startedAt = nowIso();
  const runInsert = await db
    .insert(openFinanceSyncRuns)
    .values({ connectionId, trigger, status: "running", startedAt });
  const runId = Number(
    (runInsert as any).insertId || (runInsert as any)[0]?.insertId || 0
  );
  await db
    .update(openFinanceConnections)
    .set({ status: "syncing", errorCode: null, errorMessage: null })
    .where(eq(openFinanceConnections.id, connectionId));

  try {
    const result = await withApiKey(async apiKey => {
      const item = await getPluggyItem(apiKey, connection.providerItemId);
      const accounts = await getPluggyAccounts(
        apiKey,
        connection.providerItemId
      );
      let accountsImported = 0;
      let transactionsImported = 0;
      let pagesRead = 0;
      const accountMap = new Map<string, number>();

      for (const rawAccount of accounts) {
        const localAccount = await upsertAccount(
          db,
          normalizePluggyAccount(rawAccount, connectionId)
        );
        if (!localAccount) continue;
        accountsImported += 1;
        accountMap.set(rawAccount.id, localAccount.id);
        let cursor: string | undefined;
        do {
          const page = await getPluggyTransactionsPage(
            apiKey,
            rawAccount.id,
            cursor
          );
          pagesRead += 1;
          for (const rawTransaction of page.results) {
            const normalized = normalizePluggyTransaction(
              rawTransaction,
              localAccount.id,
              connectionId
            );
            await upsertTransaction(db, normalized);
            transactionsImported += 1;
          }
          cursor = nextCursor(page.next);
          if (pagesRead >= MAX_TRANSACTION_PAGES) {
            throw new OpenFinanceError(
              "Paginação Pluggy excedeu o limite de segurança.",
              "PROVIDER_ERROR",
              502
            );
          }
        } while (cursor);
      }

      const itemStatus = normalizePluggyItemStatus(item);
      await db
        .update(openFinanceConnections)
        .set({
          status: itemStatus === "connected" ? "connected" : itemStatus,
          institutionName: item.connector?.name || connection.institutionName,
          lastSyncedAt: nowIso(),
          errorCode: null,
          errorMessage: null,
        })
        .where(eq(openFinanceConnections.id, connectionId));

      return {
        connectionId,
        accountsImported,
        transactionsImported,
        pagesRead,
      };
    });

    if (runId) {
      await db
        .update(openFinanceSyncRuns)
        .set({
          status: "success",
          accountsImported: result.accountsImported,
          transactionsImported: result.transactionsImported,
          completedAt: nowIso(),
        })
        .where(eq(openFinanceSyncRuns.id, runId));
    }
    return result;
  } catch (error) {
    await markConnectionError(connectionId, error);
    if (runId)
      await db
        .update(openFinanceSyncRuns)
        .set({
          status: "failed",
          errorMessage: (error instanceof Error
            ? error.message
            : String(error)
          ).slice(0, 1000),
          completedAt: nowIso(),
        })
        .where(eq(openFinanceSyncRuns.id, runId));
    throw error;
  }
}

function userIdFromClientUserId(
  clientUserId: string | null | undefined
): number | null {
  const match = String(clientUserId || "").match(/^exclusive-user-(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function upsertItemConnection(
  payload: PluggyWebhookPayload,
  item: PluggyItem | null
) {
  const db = await getDb();
  if (!db || !payload.itemId) return null;
  const existing = await db
    .select()
    .from(openFinanceConnections)
    .where(eq(openFinanceConnections.providerItemId, payload.itemId))
    .limit(1);
  const clientUserId =
    payload.clientUserId ||
    item?.clientUserId ||
    existing[0]?.clientUserId ||
    "";
  const userId = existing[0]?.userId || userIdFromClientUserId(clientUserId);
  if (!userId) return existing[0] || null;
  const status = normalizePluggyItemStatus(item || {});
  if (existing[0]) {
    await db
      .update(openFinanceConnections)
      .set({
        userId,
        clientUserId,
        institutionName: item?.connector?.name || existing[0].institutionName,
        status,
        errorCode: status === "error" ? payload.event : null,
        errorMessage:
          status === "error" ? `Evento Pluggy: ${payload.event}` : null,
      })
      .where(eq(openFinanceConnections.id, existing[0].id));
    return { ...existing[0], userId };
  }

  await db.insert(openFinanceConnections).values({
    userId,
    provider: "pluggy",
    providerItemId: payload.itemId,
    clientUserId,
    institutionName: item?.connector?.name || null,
    status,
  });
  const rows = await db
    .select()
    .from(openFinanceConnections)
    .where(eq(openFinanceConnections.providerItemId, payload.itemId))
    .limit(1);
  return rows[0] || null;
}

export async function registerPluggyWebhookEvent(
  payload: PluggyWebhookPayload
) {
  const eventId = webhookEventId(payload);
  if (!eventId || !payload.event) {
    throw new OpenFinanceError(
      "Payload de webhook Pluggy inválido.",
      "INVALID_WEBHOOK",
      400
    );
  }
  const db = await getDb();
  if (!db)
    throw new OpenFinanceError(
      "Banco de dados indisponível.",
      "DATABASE_ERROR",
      503
    );
  const existing = await db
    .select()
    .from(openFinanceWebhookEvents)
    .where(eq(openFinanceWebhookEvents.providerEventId, eventId))
    .limit(1);
  if (existing[0]) return { eventId, duplicate: true };
  await db.insert(openFinanceWebhookEvents).values({
    providerEventId: eventId,
    event: payload.event,
    itemId: payload.itemId || null,
    clientUserId: payload.clientUserId || null,
  });
  return { eventId, duplicate: false };
}

export async function processPluggyWebhookEvent(
  eventId: string,
  payload: PluggyWebhookPayload
): Promise<void> {
  const db = await getDb();
  if (!db)
    throw new OpenFinanceError(
      "Banco de dados indisponível.",
      "DATABASE_ERROR",
      503
    );
  try {
    let connection = null;
    let item: PluggyItem | null = null;
    const event = payload.event || "";
    if (payload.itemId && event !== "item/deleted") {
      item = await withApiKey(apiKey => getPluggyItem(apiKey, payload.itemId!));
      connection = await upsertItemConnection(payload, item);
    } else if (payload.itemId && event === "item/deleted") {
      const rows = await db
        .select()
        .from(openFinanceConnections)
        .where(eq(openFinanceConnections.providerItemId, payload.itemId))
        .limit(1);
      connection = rows[0] || null;
    }
    if (
      connection &&
      ["item/created", "item/updated", "item/login_succeeded"].includes(event)
    ) {
      await syncOpenFinanceConnection(connection.id, "webhook");
    } else if (connection && event === "item/deleted") {
      await db
        .update(openFinanceConnections)
        .set({ status: "disconnected" })
        .where(eq(openFinanceConnections.id, connection.id));
    } else if (
      connection &&
      event === "item/error"
    ) {
      const consentSignal = [payload.error?.code, payload.error?.message]
        .filter(Boolean)
        .join(" ")
        .toUpperCase();
      await db
        .update(openFinanceConnections)
        .set({
          status:
            /CONSENT|EXPIRED|REVOK|USER_AUTHORIZATION_PENDING/.test(consentSignal)
              ? "consent_expired"
              : "error",
          errorCode: event,
          errorMessage: `Evento Pluggy: ${event}`,
        })
        .where(eq(openFinanceConnections.id, connection.id));
    } else if (
      connection &&
      ["item/waiting_user_input", "item/waiting_user_action"].includes(event)
    ) {
      await db
        .update(openFinanceConnections)
        .set({
          status: "pending",
          errorCode: event,
          errorMessage: null,
        })
        .where(eq(openFinanceConnections.id, connection.id));
    } else if (
      connection &&
      ["transactions/created", "transactions/updated"].includes(event)
    ) {
      await syncOpenFinanceConnection(connection.id, "webhook");
    } else if (connection && event === "transactions/deleted") {
      const transactionIds = transactionIdsForDeletion(payload);
      if (transactionIds.length) {
        await db
          .delete(openFinanceTransactions)
          .where(
            inArray(
              openFinanceTransactions.providerTransactionId,
              transactionIds
            )
          );
      }
    }
    await db
      .update(openFinanceWebhookEvents)
      .set({ processed: 1, processedAt: nowIso(), errorMessage: null })
      .where(eq(openFinanceWebhookEvents.providerEventId, eventId));
  } catch (error) {
    await db
      .update(openFinanceWebhookEvents)
      .set({
        processed: 0,
        errorMessage: (error instanceof Error
          ? error.message
          : String(error)
        ).slice(0, 1000),
      })
      .where(eq(openFinanceWebhookEvents.providerEventId, eventId));
    throw error;
  }
}

export async function getOpenFinanceSummary() {
  const db = await getDb();
  if (!db)
    throw new OpenFinanceError(
      "Banco de dados indisponível.",
      "DATABASE_ERROR",
      503
    );
  const [connectionStats, accountStats, transactionStats] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)`,
        connected: sql<number>`sum(case when ${openFinanceConnections.status} = 'connected' then 1 else 0 end)`,
      })
      .from(openFinanceConnections),
    db
      .select({
        total: sql<number>`count(*)`,
        balance: sql<string>`coalesce(sum(${openFinanceAccounts.balance}), 0)`,
      })
      .from(openFinanceAccounts),
    db.select({ total: sql<number>`count(*)` }).from(openFinanceTransactions),
  ]);
  return {
    connections: Number(connectionStats[0]?.total || 0),
    connected: Number(connectionStats[0]?.connected || 0),
    accounts: Number(accountStats[0]?.total || 0),
    transactions: Number(transactionStats[0]?.total || 0),
    balance: Number(accountStats[0]?.balance || 0),
  };
}
