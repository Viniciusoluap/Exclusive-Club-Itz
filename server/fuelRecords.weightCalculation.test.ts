import { describe, it, expect } from 'vitest';

/**
 * Testes para o cálculo de litros por pesagem (Regra de 3)
 * 
 * Fórmula: litros_consumidos = (peso_consumido × litros_iniciais) / peso_cheio
 */

describe('Cálculo de Litros por Pesagem - Regra de 3', () => {
  it('deve calcular corretamente com galão cheio de 50L', () => {
    // Cenário: Galão cheio com 50L
    const litersInitial = 50.05; // Litros iniciais
    const weightFull = 37.80; // kg
    const weightAfter = 23.40; // kg
    
    const weightConsumed = weightFull - weightAfter; // 14.40 kg
    const litersCalculated = (weightConsumed * litersInitial) / weightFull;
    
    expect(weightConsumed).toBeCloseTo(14.40, 2);
    // Valor real calculado: 19.0666... (arredondado para 19.07)
    expect(litersCalculated).toBeCloseTo(19.07, 2);
  });

  it('deve calcular corretamente com galão parcial de 30L', () => {
    // Cenário: Galão parcial (sobrou do abastecimento anterior)
    const litersInitial = 30.25;
    const weightFull = 22.89;
    const weightAfter = 15.26;
    
    const weightConsumed = weightFull - weightAfter; // 7.63 kg
    const litersCalculated = (weightConsumed * litersInitial) / weightFull;
    
    expect(weightConsumed).toBeCloseTo(7.63, 2);
    expect(litersCalculated).toBeCloseTo(10.08, 2);
  });

  it('deve calcular corretamente com valores pequenos', () => {
    // Cenário: Abastecimento pequeno
    const litersInitial = 10.00;
    const weightFull = 7.56;
    const weightAfter = 5.67;
    
    const weightConsumed = weightFull - weightAfter; // 1.89 kg
    const litersCalculated = (weightConsumed * litersInitial) / weightFull;
    
    expect(weightConsumed).toBeCloseTo(1.89, 2);
    expect(litersCalculated).toBeCloseTo(2.50, 2);
  });

  it('deve manter precisão com 2 casas decimais', () => {
    const litersInitial = 50.05;
    const weightFull = 37.80;
    const weightAfter = 23.40;
    
    const weightConsumed = weightFull - weightAfter;
    const litersCalculated = parseFloat(((weightConsumed * litersInitial) / weightFull).toFixed(2));
    
    // Verificar que o resultado tem exatamente 2 casas decimais
    expect(litersCalculated.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
  });

  it('deve converter corretamente para armazenamento em centavos/gramas', () => {
    // Valores de entrada (interface)
    const litersInitial = 50.05; // L
    const weightFull = 37.80; // kg
    const weightAfter = 23.40; // kg
    
    // Conversão para armazenamento (banco de dados)
    const litersInitialInCents = Math.round(litersInitial * 100); // 5005
    const weightFullInGrams = Math.round(weightFull * 100); // 3780
    const weightAfterInGrams = Math.round(weightAfter * 100); // 2340
    const weightConsumedInGrams = weightFullInGrams - weightAfterInGrams; // 1440
    
    // Cálculo em centavos/gramas
    const litersCalculatedInCents = Math.round((weightConsumedInGrams * litersInitialInCents) / weightFullInGrams);
    
    expect(litersInitialInCents).toBe(5005);
    expect(weightFullInGrams).toBe(3780);
    expect(weightAfterInGrams).toBe(2340);
    expect(weightConsumedInGrams).toBe(1440);
    expect(litersCalculatedInCents).toBe(1907); // 19.07L em centavos (valor real calculado)
    
    // Conversão de volta para exibição
    const litersForDisplay = litersCalculatedInCents / 100;
    expect(litersForDisplay).toBeCloseTo(19.07, 2);
  });

  it('deve calcular subtotal e total corretamente', () => {
    const litersCalculated = 19.05;
    const pricePerLiter = 6.29;
    const serviceFee = 10.00;
    
    const subtotal = litersCalculated * pricePerLiter;
    const total = subtotal + serviceFee;
    
    expect(subtotal).toBeCloseTo(119.82, 2);
    expect(total).toBeCloseTo(129.82, 2);
  });
});
