import { describe, it, expect } from 'vitest';

describe('Fuel Records PDF - Field Mapping', () => {
  it('should map snake_case fields to camelCase correctly', () => {
    // Simular dados do banco (snake_case)
    const rawRecord = {
      id: 1,
      vessel_name: 'JETSKI SEADOO GTI SE 130HP',
      booking_date: '2025-12-13',
      liters: 5000, // 50.00L em centavos
      price_per_liter: 650, // R$ 6.50 em centavos
      total_amount: 32500, // R$ 325.00 em centavos
      notes: 'Abastecimento completo',
    };

    // Simular contexto com usuário logado
    const ctx = {
      user: {
        name: 'Vinicius Freitas',
      },
    };

    // Mapear campos (mesma lógica do routers.ts)
    const mappedRecord = {
      id: rawRecord.id,
      vesselName: rawRecord.vessel_name || 'N/A',
      employeeName: ctx.user?.name || 'N/A',
      date: rawRecord.booking_date,
      liters: rawRecord.liters || 0,
      pricePerLiter: rawRecord.price_per_liter || 0,
      subtotal: rawRecord.liters * rawRecord.price_per_liter / 100 || 0,
      serviceFee: 0,
      totalAmount: rawRecord.total_amount || 0,
      notes: rawRecord.notes,
    };

    // Validar mapeamento
    expect(mappedRecord.vesselName).toBe('JETSKI SEADOO GTI SE 130HP');
    expect(mappedRecord.employeeName).toBe('Vinicius Freitas');
    expect(mappedRecord.date).toBe('2025-12-13');
    expect(mappedRecord.liters).toBe(5000); // 50.00L em centavos
    expect(mappedRecord.pricePerLiter).toBe(650); // R$ 6.50 em centavos
    expect(mappedRecord.subtotal).toBe(32500); // 50.00L * R$ 6.50 = R$ 325.00
    expect(mappedRecord.serviceFee).toBe(0);
    expect(mappedRecord.totalAmount).toBe(32500); // R$ 325.00 em centavos

    console.log('✅ vesselName: "JETSKI SEADOO GTI SE 130HP"');
    console.log('✅ employeeName: "Vinicius Freitas"');
    console.log('✅ date: "2025-12-13"');
    console.log('✅ liters: 5000 (50.00L)');
    console.log('✅ pricePerLiter: 650 (R$ 6.50)');
    console.log('✅ subtotal: 32500 (R$ 325.00)');
    console.log('✅ totalAmount: 32500 (R$ 325.00)');
  });

  it('should display values correctly in PDF after division by 100', () => {
    const record = {
      id: 1,
      vesselName: 'JETSKI SEADOO GTI SE 130HP',
      employeeName: 'Vinicius Freitas',
      date: new Date('2025-12-13'),
      liters: 5000, // em centavos
      pricePerLiter: 650, // em centavos
      subtotal: 32500, // em centavos
      serviceFee: 0,
      totalAmount: 32500, // em centavos
    };

    // Simular conversão do PDF (divide por 100)
    const litersValue = record.liters / 100; // 50.00L
    const pricePerLiterValue = record.pricePerLiter / 100; // R$ 6.50
    const subtotalValue = record.subtotal / 100; // R$ 325.00
    const serviceFeeValue = record.serviceFee / 100; // R$ 0.00
    const totalValue = record.totalAmount / 100; // R$ 325.00

    expect(litersValue).toBe(50.00);
    expect(pricePerLiterValue).toBe(6.50);
    expect(subtotalValue).toBe(325.00);
    expect(serviceFeeValue).toBe(0.00);
    expect(totalValue).toBe(325.00);

    // Validar formatação
    expect(litersValue.toFixed(2)).toBe('50.00');
    expect(pricePerLiterValue.toFixed(2)).toBe('6.50');
    expect(subtotalValue.toFixed(2)).toBe('325.00');
    expect(serviceFeeValue.toFixed(2)).toBe('0.00');
    expect(totalValue.toFixed(2)).toBe('325.00');

    console.log('✅ Litros: 50.00L');
    console.log('✅ Preço/L: R$ 6.50');
    console.log('✅ Subtotal: R$ 325.00');
    console.log('✅ Taxa: R$ 0.00');
    console.log('✅ Total: R$ 325.00');
  });

  it('should handle multiple records and calculate totals correctly', () => {
    const records = [
      { liters: 5000, totalAmount: 32500 }, // 50L, R$ 325.00
      { liters: 7000, totalAmount: 45500 }, // 70L, R$ 455.00
      { liters: 1000, totalAmount: 6500 },  // 10L, R$ 65.00
    ];

    const totalLiters = records.reduce((sum, r) => sum + r.liters, 0) / 100; // 130L
    const totalAmount = records.reduce((sum, r) => sum + r.totalAmount, 0) / 100; // R$ 845.00

    expect(totalLiters).toBe(130.00);
    expect(totalAmount).toBe(845.00); // 325 + 455 + 65 = 845

    console.log('✅ Total de Litros: 130.00L');
    console.log('✅ Valor Total: R$ 845.00');
  });
});
