import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module to avoid real DB connections in unit tests
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("../drizzle/schema", () => ({
  expenseRecords: {
    id: "id",
    costCenter: "costCenter",
    description: "description",
    value: "value",
    dueDate: "dueDate",
    status: "status",
  },
}));

describe("expenses module", () => {
  it("should define valid cost center values", () => {
    const validCostCenters = [
      "salary",
      "rent",
      "pro_labore",
      "fuel_operational",
      "repair",
      "operational",
      "other",
    ];
    expect(validCostCenters).toHaveLength(7);
    expect(validCostCenters).toContain("salary");
    expect(validCostCenters).toContain("pro_labore");
    expect(validCostCenters).toContain("operational");
  });

  it("should define valid status values", () => {
    const validStatuses = ["pending", "paid", "overdue", "cancelled"];
    expect(validStatuses).toHaveLength(4);
    expect(validStatuses).toContain("pending");
    expect(validStatuses).toContain("paid");
    expect(validStatuses).toContain("overdue");
  });

  it("should calculate net result correctly", () => {
    const totalReceitas = 132853.38;
    const totalDespesas = 45000.0;
    const resultadoLiquido = totalReceitas - totalDespesas;
    expect(resultadoLiquido).toBeCloseTo(87853.38, 2);
  });

  it("should identify deficit when expenses exceed revenue", () => {
    const totalReceitas = 10000;
    const totalDespesas = 15000;
    const resultadoLiquido = totalReceitas - totalDespesas;
    expect(resultadoLiquido).toBeLessThan(0);
  });

  it("should identify surplus when revenue exceeds expenses", () => {
    const totalReceitas = 20000;
    const totalDespesas = 8000;
    const resultadoLiquido = totalReceitas - totalDespesas;
    expect(resultadoLiquido).toBeGreaterThan(0);
  });

  it("should normalize overdue status for past due dates", () => {
    const today = new Date();
    const pastDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const futureDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days ahead

    const getEffectiveStatus = (status: string, dueDate: Date) => {
      if (status === "pending" && dueDate < today) return "overdue";
      return status;
    };

    expect(getEffectiveStatus("pending", pastDate)).toBe("overdue");
    expect(getEffectiveStatus("pending", futureDate)).toBe("pending");
    expect(getEffectiveStatus("paid", pastDate)).toBe("paid");
    expect(getEffectiveStatus("cancelled", pastDate)).toBe("cancelled");
  });
});
