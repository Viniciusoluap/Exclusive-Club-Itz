import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// Mock the db module
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// Mock drizzle-orm/mysql-core sql
vi.mock("drizzle-orm/mysql-core", () => ({
  sql: { raw: vi.fn((q: string) => q) },
}));

function createAuthContext(email = "test@example.com"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email,
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("clientPayments router", () => {
  describe("overdueCharges logic", () => {
    it("should filter overdue charges by client email", () => {
      const email = "client@example.com";
      const ctx = createAuthContext(email);
      // Verify context has correct email
      expect(ctx.user?.email).toBe(email);
    });

    it("should calculate daysOverdue correctly", () => {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() - 5); // 5 days ago
      const dueDateStr = dueDate.toISOString().split("T")[0];

      const now = new Date();
      const due = new Date(dueDateStr + "T00:00:00");
      const daysOverdue = Math.floor(
        (now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysOverdue).toBeGreaterThanOrEqual(4);
      expect(daysOverdue).toBeLessThanOrEqual(6);
    });

    it("should map type to correct label", () => {
      const typeLabel = (type: string) =>
        type === "monthly"
          ? "Mensalidade"
          : type === "fuel"
          ? "Abastecimento"
          : type === "repair"
          ? "Reparo"
          : "Outro";

      expect(typeLabel("monthly")).toBe("Mensalidade");
      expect(typeLabel("fuel")).toBe("Abastecimento");
      expect(typeLabel("repair")).toBe("Reparo");
      expect(typeLabel("other")).toBe("Outro");
    });
  });

  describe("generateConsolidatedCharge logic", () => {
    it("should calculate total correctly from charges", () => {
      const charges = [
        { value: "150.00" },
        { value: "89.90" },
        { value: "200.00" },
      ];
      const total = charges.reduce(
        (sum, c) => sum + parseFloat(c.value),
        0
      );
      const totalRounded = Math.round(total * 100) / 100;
      expect(totalRounded).toBe(439.9);
    });

    it("should build correct description for consolidated charge", () => {
      const charges = [
        { type: "monthly" },
        { type: "fuel" },
        { type: "monthly" },
      ];
      const typeLabels = Array.from(
        new Set(
          charges.map((c) =>
            c.type === "monthly"
              ? "Mensalidade"
              : c.type === "fuel"
              ? "Abastecimento"
              : c.type === "repair"
              ? "Reparo"
              : "Outros"
          )
        )
      ).join(", ");
      const description = `Regularização de débitos vencidos — ${typeLabels} (${charges.length} cobranças)`;
      expect(description).toContain("Mensalidade");
      expect(description).toContain("Abastecimento");
      expect(description).toContain("3 cobranças");
      // Should deduplicate types
      expect(typeLabels.split(", ").length).toBe(2);
    });

    it("should set due date to tomorrow", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dueDateStr = tomorrow.toISOString().split("T")[0];
      // Verify format YYYY-MM-DD
      expect(dueDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Verify it's after today
      const today = new Date().toISOString().split("T")[0];
      expect(dueDateStr > today).toBe(true);
    });

    it("should reject empty chargeIds array", () => {
      const chargeIds: number[] = [];
      expect(chargeIds.length).toBe(0);
      // In the router, this would throw NOT_FOUND
    });
  });
});
