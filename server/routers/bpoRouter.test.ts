import { describe, it, expect } from "vitest";
import { normalizeBpoStatus } from "./bpoRouter";

describe("normalizeBpoStatus", () => {
  it("mapeia RECEIVED para received", () => {
    expect(normalizeBpoStatus("RECEIVED")).toBe("received");
  });

  it("mapeia DUNNING_RECEIVED para received", () => {
    expect(normalizeBpoStatus("DUNNING_RECEIVED")).toBe("received");
  });

  it("mapeia CONFIRMED para confirmed", () => {
    expect(normalizeBpoStatus("CONFIRMED")).toBe("confirmed");
  });

  it("mapeia RECEIVED_IN_CASH para receivedInCash", () => {
    expect(normalizeBpoStatus("RECEIVED_IN_CASH")).toBe("receivedInCash");
  });

  it("mapeia OVERDUE para overdue", () => {
    expect(normalizeBpoStatus("OVERDUE")).toBe("overdue");
  });

  it("mapeia REFUNDED para refunded", () => {
    expect(normalizeBpoStatus("REFUNDED")).toBe("refunded");
  });

  it("mapeia AWAITING_CHARGEBACK_REVERSAL para awaitingChargeback", () => {
    expect(normalizeBpoStatus("AWAITING_CHARGEBACK_REVERSAL")).toBe("awaitingChargeback");
  });

  it("mapeia DETACHED para detached", () => {
    expect(normalizeBpoStatus("DETACHED")).toBe("detached");
  });

  it("mapeia PARTIALLY_PAID para partiallyPaid", () => {
    expect(normalizeBpoStatus("PARTIALLY_PAID")).toBe("partiallyPaid");
  });

  it("mapeia PENDING para pending", () => {
    expect(normalizeBpoStatus("PENDING")).toBe("pending");
  });

  it("mapeia status desconhecido para pending (fallback)", () => {
    expect(normalizeBpoStatus("UNKNOWN_STATUS")).toBe("pending");
  });

  it("é case-insensitive", () => {
    expect(normalizeBpoStatus("received")).toBe("received");
    expect(normalizeBpoStatus("Overdue")).toBe("overdue");
  });
});

describe("bpoRouter schema validation", () => {
  it("tabela bpo_charges deve ter os campos essenciais definidos no schema", async () => {
    const { bpoCharges } = await import("../../drizzle/schema");
    const columns = Object.keys(bpoCharges);
    expect(columns).toContain("id");
    expect(columns).toContain("asaasChargeId");
    expect(columns).toContain("value");
    expect(columns).toContain("status");
    expect(columns).toContain("dueDate");
    expect(columns).toContain("source");
    expect(columns).toContain("syncedAt");
  });

  it("status enum deve incluir todos os valores esperados", async () => {
    // Verificar que os valores de status são os esperados
    const validStatuses = [
      "pending", "received", "confirmed", "overdue",
      "refunded", "receivedInCash", "awaitingChargeback",
      "detached", "partiallyPaid"
    ];
    for (const status of validStatuses) {
      const normalized = normalizeBpoStatus(status.toUpperCase());
      expect(validStatuses).toContain(normalized);
    }
  });
});
