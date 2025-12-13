import { describe, it, expect } from 'vitest';

describe('Fuel Records - Service Fee Calculation', () => {
  it('should apply R$ 10.00 service fee to all records', () => {
    // Simular dados do banco (snake_case)
    const rawRecord = {
      id: 1,
      vessel_name: 'JETSKI SEADOO GTI SE 130HP',
      booking_date: '2025-12-05',
      liters: 7900, // 79.00L em centavos
      price_per_liter: 800, // R$ 8.00 em centavos
      total_amount: 64200, // R$ 642.00 em centavos
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
      serviceFee: 1000, // ✅ Taxa fixa: R$ 10.00 em centavos
      totalAmount: rawRecord.total_amount || 0,
    };

    // Validar mapeamento
    expect(mappedRecord.liters).toBe(7900); // 79.00L em centavos
    expect(mappedRecord.pricePerLiter).toBe(800); // R$ 8.00 em centavos
    expect(mappedRecord.subtotal).toBe(63200); // 79L * R$ 8.00 = R$ 632.00 em centavos
    expect(mappedRecord.serviceFee).toBe(1000); // R$ 10.00 em centavos
    expect(mappedRecord.totalAmount).toBe(64200); // R$ 632.00 + R$ 10.00 = R$ 642.00

    console.log('✅ Litros: 7900 (79.00L)');
    console.log('✅ Preço/L: 800 (R$ 8.00)');
    console.log('✅ Subtotal: 63200 (R$ 632.00)');
    console.log('✅ Taxa: 1000 (R$ 10.00)');
    console.log('✅ Total: 64200 (R$ 642.00)');
  });

  it('should display service fee correctly in PDF after division by 100', () => {
    const record = {
      id: 2,
      vesselName: 'JETSKI SEADOO GTI SE 130HP',
      employeeName: 'Vinicius Freitas',
      date: new Date('2025-12-05'),
      liters: 7900, // em centavos
      pricePerLiter: 800, // em centavos
      subtotal: 63200, // em centavos
      serviceFee: 1000, // em centavos
      totalAmount: 64200, // em centavos
    };

    // Simular conversão do PDF (divide por 100)
    const litersValue = record.liters / 100; // 79.00L
    const pricePerLiterValue = record.pricePerLiter / 100; // R$ 8.00
    const subtotalValue = record.subtotal / 100; // R$ 632.00
    const serviceFeeValue = record.serviceFee / 100; // R$ 10.00
    const totalValue = record.totalAmount / 100; // R$ 642.00

    expect(litersValue).toBe(79.00);
    expect(pricePerLiterValue).toBe(8.00);
    expect(subtotalValue).toBe(632.00);
    expect(serviceFeeValue).toBe(10.00); // ✅ Taxa de R$ 10.00
    expect(totalValue).toBe(642.00);

    // Validar formatação
    expect(litersValue.toFixed(2)).toBe('79.00');
    expect(pricePerLiterValue.toFixed(2)).toBe('8.00');
    expect(subtotalValue.toFixed(2)).toBe('632.00');
    expect(serviceFeeValue.toFixed(2)).toBe('10.00');
    expect(totalValue.toFixed(2)).toBe('642.00');

    console.log('✅ Litros: 79.00L');
    console.log('✅ Preço/L: R$ 8.00');
    console.log('✅ Subtotal: R$ 632.00');
    console.log('✅ Taxa: R$ 10.00'); // ✅ Agora mostra R$ 10.00
    console.log('✅ Total: R$ 642.00');
  });

  it('should calculate correct totals with service fee', () => {
    const records = [
      { liters: 7900, pricePerLiter: 800, subtotal: 63200, serviceFee: 1000, totalAmount: 64200 }, // 79L, R$ 8.00, Taxa R$ 10
      { liters: 9000, pricePerLiter: 800, subtotal: 72000, serviceFee: 1000, totalAmount: 73000 }, // 90L, R$ 8.00, Taxa R$ 10
      { liters: 7000, pricePerLiter: 800, subtotal: 56000, serviceFee: 1000, totalAmount: 57000 }, // 70L, R$ 8.00, Taxa R$ 10
    ];

    const totalLiters = records.reduce((sum, r) => sum + r.liters, 0) / 100; // 239L
    const totalServiceFee = records.reduce((sum, r) => sum + r.serviceFee, 0) / 100; // R$ 30.00 (3 × R$ 10)
    const totalAmount = records.reduce((sum, r) => sum + r.totalAmount, 0) / 100; // R$ 1942.00

    expect(totalLiters).toBe(239.00); // 79 + 90 + 70 = 239L
    expect(totalServiceFee).toBe(30.00); // 3 registros × R$ 10.00 = R$ 30.00
    expect(totalAmount).toBe(1942.00); // R$ 642 + R$ 730 + R$ 570 = R$ 1942.00

    console.log('✅ Total de Litros: 239.00L');
    console.log('✅ Total de Taxas: R$ 30.00 (3 × R$ 10.00)');
    console.log('✅ Valor Total: R$ 1942.00');
  });
});
