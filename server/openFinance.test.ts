import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { openFinanceWebhookEvents } from "../drizzle/schema";
import { getDb } from "./db";
import {
  buildPluggyConnectTokenPayload,
  buildPluggyTransactionsPath,
  buildPluggyWebhookRegistration,
  buildPluggyWebhookUrl,
  nextCursor,
  normalizePluggyItemStatus,
  normalizePluggyAccount,
  normalizePluggyTransaction,
  registerPluggyWebhookEvent,
  transactionIdsForDeletion,
  validatePluggyWebhookSecret,
  webhookEventId,
} from "./openFinance";

describe("Open Finance Pluggy configuration", () => {
  it("builds the exact public HTTPS webhook with its server-only header", () => {
    expect(
      buildPluggyWebhookRegistration(
        "https://club.example.test/",
        "sandbox-webhook-secret"
      )
    ).toEqual({
      event: "all",
      url: "https://club.example.test/api/webhooks/pluggy",
      headers: {
        "x-pluggy-webhook-secret": "sandbox-webhook-secret",
      },
    });
    expect(() => buildPluggyWebhookUrl("http://club.example.test")).toThrow(
      "HTTPS público"
    );
    expect(() => buildPluggyWebhookUrl("https://localhost:3000")).toThrow(
      "HTTPS público"
    );
  });

  it("separates new consent from item reconnection payloads", () => {
    expect(buildPluggyConnectTokenPayload(9)).toEqual({
      options: {
        clientUserId: "exclusive-user-9",
        avoidDuplicates: true,
      },
    });
    expect(buildPluggyConnectTokenPayload(9, "item-sandbox-1")).toEqual({
      options: {
        clientUserId: "exclusive-user-9",
        avoidDuplicates: true,
      },
      itemId: "item-sandbox-1",
    });
  });
});

describe("Open Finance item lifecycle", () => {
  it("maps successful, expired/revoked and retryable error states", () => {
    expect(normalizePluggyItemStatus({ status: "UPDATED" })).toBe("connected");
    expect(
      normalizePluggyItemStatus({
        status: "OUTDATED",
        executionStatus: "USER_AUTHORIZATION_PENDING",
      })
    ).toBe("consent_expired");
    expect(
      normalizePluggyItemStatus({
        status: "OUTDATED",
        error: { code: "CONSENT_REVOKED" },
      })
    ).toBe("consent_expired");
    expect(normalizePluggyItemStatus({ status: "OUTDATED" })).toBe("error");
    expect(normalizePluggyItemStatus({ status: "UPDATING" })).toBe("pending");
  });
});

describe("Open Finance transaction synchronization", () => {
  it("uses Transactions V2 page size 500 and preserves the next cursor", () => {
    expect(buildPluggyTransactionsPath("account 1", "cursor/+==")).toBe(
      "/v2/transactions?accountId=account+1&pageSize=500&after=cursor%2F%2B%3D%3D"
    );
    expect(
      nextCursor("https://api.pluggy.ai/v2/transactions?after=next-cursor")
    ).toBe("next-cursor");
  });

  it("deduplicates and caps transaction deletions to the provider chunk limit", () => {
    const transactionIds = Array.from({ length: 1005 }, (_, index) => `tx-${index}`);
    transactionIds.push("tx-1");
    const result = transactionIdsForDeletion({ transactionIds });
    expect(result).toHaveLength(1000);
    expect(new Set(result).size).toBe(1000);
  });
});

describe("Open Finance normalization", () => {
  it("normalizes an account without exposing the full account number", () => {
    const normalized = normalizePluggyAccount(
      {
        id: "account-1",
        name: "Conta Principal",
        type: "BANK",
        number: "123456789",
        balance: 1234.5,
        availableBalance: "1000.00",
      },
      7
    );

    expect(normalized).toMatchObject({
      connectionId: 7,
      providerAccountId: "account-1",
      name: "Conta Principal",
      balance: "1234.50",
      availableBalance: "1000.00",
    });
    expect(normalized.numberMasked).toBe("****6789");
  });

  it("normalizes transaction direction from provider type and amount", () => {
    expect(
      normalizePluggyTransaction(
        {
          id: "transaction-credit",
          date: "2026-08-25",
          description: "Recebimento",
          amount: 350,
          type: "CREDIT",
          category: { name: "Receitas" },
        },
        3,
        4
      )
    ).toMatchObject({
      accountId: 3,
      connectionId: 4,
      amount: "350.00",
      direction: "credit",
      category: "Receitas",
    });

    expect(
      normalizePluggyTransaction(
        {
          id: "transaction-debit",
          description: "Tarifa",
          amount: -12.9,
        },
        3,
        4
      ).direction
    ).toBe("debit");
  });
});

describe("Open Finance webhook security", () => {
  it("requires a configured secret and compares it safely", () => {
    expect(validatePluggyWebhookSecret("secret", "secret")).toBe(true);
    expect(validatePluggyWebhookSecret("wrong", "secret")).toBe(false);
    expect(validatePluggyWebhookSecret(undefined, "secret")).toBe(false);
    expect(validatePluggyWebhookSecret("secret", "")).toBe(false);
  });

  it("uses provider eventId as the stable idempotency key", () => {
    expect(
      webhookEventId({
        event: "item/updated",
        eventId: "evt-1",
        itemId: "item-1",
      })
    ).toBe("evt-1");
    expect(webhookEventId({ event: "item/updated", itemId: "item-1" })).toBe(
      webhookEventId({ event: "item/updated", itemId: "item-1" })
    );
    expect(webhookEventId({})).toBeNull();
  });

  const databaseHost = (() => {
    try {
      return new URL(process.env.DATABASE_URL || "").hostname;
    } catch {
      return "";
    }
  })();
  it.skipIf(!["127.0.0.1", "localhost"].includes(databaseHost))(
    "registers the same webhook event only once on the ephemeral test database",
    async () => {
      const db = await getDb();
      expect(db).toBeTruthy();
      const eventId = `test-pluggy-${randomUUID()}`;
      try {
        const payload = {
          event: "item/updated",
          eventId,
          itemId: "sandbox-item",
        };
        expect(await registerPluggyWebhookEvent(payload)).toEqual({
          eventId,
          duplicate: false,
        });
        expect(await registerPluggyWebhookEvent(payload)).toEqual({
          eventId,
          duplicate: true,
        });
      } finally {
        await db
          ?.delete(openFinanceWebhookEvents)
          .where(eq(openFinanceWebhookEvents.providerEventId, eventId));
      }
    }
  );
});
