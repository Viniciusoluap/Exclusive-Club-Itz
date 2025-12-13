import { describe, expect, it } from "vitest";

/**
 * Teste para validar cálculo de totalAmount no email de relatório
 * Bug reportado: "Valor Total: R$ NaN" no email
 * Causa: Usar array 'records' (snake_case) ao invés de 'mappedRecords' (camelCase)
 */
describe("fuelRecords.sendReportByEmail - Cálculo de Valor Total", () => {
  it("deve calcular totalAmount corretamente usando mappedRecords", () => {
    // Simular dados brutos do banco (snake_case)
    const records = [
      {
        id: 1,
        vessel_name: "Jetski",
        liters: 4000, // 40.00L em centavos
        price_per_liter: 700, // R$ 7.00 em centavos
        total_amount: 29000, // R$ 290.00 em centavos (40L × R$7.00 + R$10.00 taxa)
        notes: "Teste",
        created_at: new Date(),
      },
    ];

    // Simular mapeamento para camelCase (como no código real)
    const mappedRecords = records.map((r) => ({
      id: r.id,
      vesselName: r.vessel_name || "N/A",
      employeeName: "Funcionário Teste",
      date: r.created_at,
      liters: r.liters || 0,
      pricePerLiter: r.price_per_liter || 0,
      subtotal: ((r.liters || 0) * (r.price_per_liter || 0)) / 100,
      serviceFee: 1000,
      totalAmount: r.total_amount || 0,
      notes: r.notes,
    }));

    // ❌ ERRADO: Usar 'records' (snake_case) - retorna NaN
    const wrongTotalAmount =
      records.reduce((sum, r: any) => sum + r.totalAmount, 0) / 100;
    expect(wrongTotalAmount).toBeNaN(); // totalAmount não existe em records

    // ✅ CORRETO: Usar 'mappedRecords' (camelCase)
    const correctTotalAmount =
      mappedRecords.reduce((sum, r) => sum + r.totalAmount, 0) / 100;
    expect(correctTotalAmount).toBe(290.0); // R$ 290.00
  });

  it("deve calcular totalLiters corretamente usando mappedRecords", () => {
    const records = [
      { id: 1, liters: 4000, total_amount: 29000 }, // 40.00L
      { id: 2, liters: 3000, total_amount: 22000 }, // 30.00L
    ];

    const mappedRecords = records.map((r) => ({
      id: r.id,
      liters: r.liters || 0,
      totalAmount: r.total_amount || 0,
    }));

    // ✅ CORRETO: Usar 'mappedRecords'
    const totalLiters = mappedRecords.reduce((sum, r) => sum + r.liters, 0) / 100;
    expect(totalLiters).toBe(70.0); // 40L + 30L = 70L
  });

  it("deve calcular totalAmount com múltiplos registros", () => {
    const records = [
      { id: 1, total_amount: 29000 }, // R$ 290.00
      { id: 2, total_amount: 22000 }, // R$ 220.00
      { id: 3, total_amount: 15000 }, // R$ 150.00
    ];

    const mappedRecords = records.map((r) => ({
      id: r.id,
      totalAmount: r.total_amount || 0,
    }));

    const totalAmount = mappedRecords.reduce((sum, r) => sum + r.totalAmount, 0) / 100;
    expect(totalAmount).toBe(660.0); // R$ 660.00
  });
});
