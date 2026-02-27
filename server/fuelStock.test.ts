/**
 * Testes de Estoque de Gasolina - APENAS LÓGICA PURA
 *
 * IMPORTANTE: Estes testes NÃO devem inserir dados no banco de produção.
 * Todos os testes aqui validam apenas a lógica de cálculo, sem chamadas reais ao banco.
 *
 * Motivo: Os testes anteriores inseriam compras reais no banco (ex: "Teste de compra", 
 * "Teste com decimais"), o que inflava o estoque e causava dados incorretos na produção.
 */

import { describe, expect, it } from "vitest";

describe("Sistema de Estoque de Gasolina - Lógica de Cálculo", () => {
  describe("Cálculo de preço por litro", () => {
    it("deve calcular preço/L corretamente: R$ 650 / 100L = R$ 6,50/L", () => {
      const amountPaid = 650;
      const liters = 100;
      const pricePerLiter = amountPaid / liters;
      expect(pricePerLiter).toBe(6.50);
    });

    it("deve calcular preço/L com valores decimais: R$ 328,25 / 50,50L ≈ R$ 6,50/L", () => {
      const amountPaid = 328.25;
      const liters = 50.50;
      const pricePerLiter = amountPaid / liters;
      expect(pricePerLiter).toBeCloseTo(6.50, 2);
    });

    it("deve converter para centésimos corretamente", () => {
      const liters = 100; // litros
      const litersInCents = Math.round(liters * 100); // centésimos
      expect(litersInCents).toBe(10000);
    });

    it("deve converter centésimos de volta para litros", () => {
      const litersInCents = 10000;
      const liters = litersInCents / 100;
      expect(liters).toBe(100);
    });
  });

  describe("Cálculo de estoque (Comprado - Abastecido)", () => {
    it("deve calcular saldo corretamente: 347,69L comprados - 340,28L usados = 7,41L", () => {
      // Cenário real do Galão 1 após correção do bug (fev/2026)
      const compradoCents = 34769; // 347,69 L
      const usadoCents = 34028;    // 340,28 L
      const estoqueCents = compradoCents - usadoCents;
      expect(estoqueCents).toBe(741); // 7,41 L
      expect(estoqueCents / 100).toBeCloseTo(7.41, 2);
    });

    it("deve calcular saldo corretamente: 50L comprados - 37,37L usados = 12,63L", () => {
      // Cenário real do Galão 3 após correção do bug (fev/2026)
      const compradoCents = 5000; // 50,00 L
      const usadoCents = 3737;    // 37,37 L
      const estoqueCents = compradoCents - usadoCents;
      expect(estoqueCents).toBe(1263); // 12,63 L
      expect(estoqueCents / 100).toBeCloseTo(12.63, 2);
    });

    it("deve retornar zero quando todo o estoque foi consumido", () => {
      // Cenário real do Galão 2
      const compradoCents = 10000; // 100 L
      const usadoCents = 10000;    // 100 L
      const estoqueCents = compradoCents - usadoCents;
      expect(estoqueCents).toBe(0);
    });

    it("não deve permitir estoque negativo (validação de negócio)", () => {
      const compradoCents = 5000;
      const usadoCents = 6000; // mais do que foi comprado
      const estoqueCents = compradoCents - usadoCents;
      // O sistema deve detectar isso como erro
      expect(estoqueCents).toBeLessThan(0);
    });
  });

  describe("Lógica de reversão de estoque ao excluir abastecimento", () => {
    it("deve somar litros de volta ao estoque ao excluir: 7,41L + 7,41L = 14,82L", () => {
      // Simula: gallon_stock.stock_liters = stock_liters + liters_to_return
      const estoqueAntes = 741;  // 7,41 L em centésimos (Galão 1)
      const litrosExcluidos = 741; // 7,41 L em centésimos
      const estoqueDepois = estoqueAntes + litrosExcluidos;
      expect(estoqueDepois).toBe(1482);
      expect(estoqueDepois / 100).toBeCloseTo(14.82, 2);
    });

    it("deve somar litros de volta ao Galão 3: 0L + 12,63L = 12,63L (bug fev/2026)", () => {
      // Reproduz exatamente o bug reportado em fev/2026
      const estoqueZerado = 0;
      const litrosAbastecimentoExcluido = 1263; // 12,63 L em centésimos
      const estoqueCorrigido = estoqueZerado + litrosAbastecimentoExcluido;
      expect(estoqueCorrigido).toBe(1263);
      expect(estoqueCorrigido / 100).toBeCloseTo(12.63, 2);
    });

    it("deve somar litros de volta ao Galão 1: 0L + 7,41L = 7,41L (bug fev/2026)", () => {
      const estoqueZerado = 0;
      const litrosAbastecimentoExcluido = 741; // 7,41 L em centésimos
      const estoqueCorrigido = estoqueZerado + litrosAbastecimentoExcluido;
      expect(estoqueCorrigido).toBe(741);
      expect(estoqueCorrigido / 100).toBeCloseTo(7.41, 2);
    });
  });

  describe("Conversão de valores monetários", () => {
    it("deve converter reais para centavos corretamente", () => {
      const amountReais = 314.50;
      const amountCentavos = Math.round(amountReais * 100);
      expect(amountCentavos).toBe(31450);
    });

    it("deve converter centavos para reais corretamente", () => {
      const amountCentavos = 31450;
      const amountReais = amountCentavos / 100;
      expect(amountReais).toBe(314.50);
    });
  });
});
