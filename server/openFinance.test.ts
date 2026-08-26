import { describe, expect, it } from "vitest";
import {
  normalizePluggyAccount,
  normalizePluggyTransaction,
  validatePluggyWebhookSecret,
  webhookEventId,
} from "./openFinance";

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
});
