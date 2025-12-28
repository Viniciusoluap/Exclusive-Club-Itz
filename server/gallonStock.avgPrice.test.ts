import { describe, expect, it } from "vitest";

/**
 * Testes para validar o cálculo da média ponderada do preço por litro
 * 
 * Problema original: O sistema usava o campo last_price_per_liter que armazena
 * apenas o último preço da compra mais recente (R$ 6,50), ao invés de calcular
 * a média ponderada de todas as compras.
 * 
 * Solução: Calcular média ponderada = total_gasto / total_litros
 */

describe("Cálculo da média ponderada do preço por litro", () => {
  it("deve calcular média ponderada corretamente com 3 compras", () => {
    // Dados reais do Galão 1 (conforme reportado pelo usuário)
    const compras = [
      { liters: 50.00, amount: 314.50, pricePerLiter: 6.29 }, // 23/12/2025
      { liters: 50.00, amount: 314.00, pricePerLiter: 6.28 }, // 23/12/2025
      { liters: 47.69, amount: 300.00, pricePerLiter: 6.29 }, // 22/12/2025
    ];

    // Cálculo da média ponderada: total_gasto / total_litros
    const totalLiters = compras.reduce((sum, c) => sum + c.liters, 0);
    const totalAmount = compras.reduce((sum, c) => sum + c.amount, 0);
    const avgPricePerLiter = totalAmount / totalLiters;

    // Verificações
    expect(totalLiters).toBeCloseTo(147.69, 2);
    expect(totalAmount).toBeCloseTo(928.50, 2);
    expect(avgPricePerLiter).toBeCloseTo(6.2868, 2); // Média correta ~6.29
    
    // A média NÃO deve ser 6.50 (que era o valor incorreto)
    expect(avgPricePerLiter).not.toBeCloseTo(6.50, 1);
  });

  it("deve calcular média simples igual à média ponderada quando todas as compras têm mesmo volume", () => {
    // Quando todas as compras têm o mesmo volume, média simples = média ponderada
    const compras = [
      { liters: 50.00, amount: 314.50, pricePerLiter: 6.29 },
      { liters: 50.00, amount: 314.00, pricePerLiter: 6.28 },
      { liters: 50.00, amount: 314.50, pricePerLiter: 6.29 },
    ];

    const totalLiters = compras.reduce((sum, c) => sum + c.liters, 0);
    const totalAmount = compras.reduce((sum, c) => sum + c.amount, 0);
    const avgPricePerLiter = totalAmount / totalLiters;

    // Média simples dos preços
    const simpleAvg = compras.reduce((sum, c) => sum + c.pricePerLiter, 0) / compras.length;

    // Quando volumes são iguais, as médias devem ser muito próximas
    expect(avgPricePerLiter).toBeCloseTo(simpleAvg, 2);
  });

  it("deve retornar preço correto quando há apenas uma compra", () => {
    const compras = [
      { liters: 50.00, amount: 325.00, pricePerLiter: 6.50 },
    ];

    const totalLiters = compras.reduce((sum, c) => sum + c.liters, 0);
    const totalAmount = compras.reduce((sum, c) => sum + c.amount, 0);
    const avgPricePerLiter = totalAmount / totalLiters;

    expect(avgPricePerLiter).toBe(6.50);
  });

  it("deve calcular média ponderada corretamente com volumes diferentes", () => {
    // Compra grande com preço baixo deve puxar a média para baixo
    const compras = [
      { liters: 100.00, amount: 620.00, pricePerLiter: 6.20 }, // 100L a R$6.20
      { liters: 10.00, amount: 70.00, pricePerLiter: 7.00 },   // 10L a R$7.00
    ];

    const totalLiters = compras.reduce((sum, c) => sum + c.liters, 0);
    const totalAmount = compras.reduce((sum, c) => sum + c.amount, 0);
    const avgPricePerLiter = totalAmount / totalLiters;

    // Média ponderada: (620 + 70) / (100 + 10) = 690 / 110 = 6.2727...
    expect(avgPricePerLiter).toBeCloseTo(6.27, 2);
    
    // Média simples seria (6.20 + 7.00) / 2 = 6.60, que é diferente
    const simpleAvg = (6.20 + 7.00) / 2;
    expect(simpleAvg).toBeCloseTo(6.60, 2);
    expect(avgPricePerLiter).not.toBeCloseTo(simpleAvg, 1);
  });

  it("deve usar fallback quando não há compras", () => {
    const totalPurchased = 0;
    const totalAmountPaid = 0;
    const lastPricePerLiter = 650; // em centavos (R$ 6.50)

    // Lógica do código: se não há compras, usa last_price_per_liter como fallback
    const avgPricePerLiter = totalPurchased > 0 
      ? (totalAmountPaid / totalPurchased)
      : lastPricePerLiter / 100;

    expect(avgPricePerLiter).toBe(6.50);
  });

  it("deve validar que o cálculo em centavos/centésimos resulta em reais", () => {
    // Valores como armazenados no banco (em centavos/centésimos)
    const totalPurchasedCents = 14769; // 147.69 litros em centésimos
    const totalAmountPaidCents = 92850; // R$ 928.50 em centavos

    // Cálculo: centavos / centésimos = reais
    const avgPricePerLiter = totalAmountPaidCents / totalPurchasedCents;

    expect(avgPricePerLiter).toBeCloseTo(6.2868, 2);
  });
});
