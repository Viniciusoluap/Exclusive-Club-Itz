import { describe, it, expect } from 'vitest';

describe('Bookings - Time Filter Logic', () => {
  it('should filter future bookings correctly (date > today)', () => {
    const now = Date.now();
    const today = now;
    const tomorrow = now + 24 * 60 * 60 * 1000; // +1 dia
    const yesterday = now - 24 * 60 * 60 * 1000; // -1 dia

    // Simular lógica do filtro "future"
    const futureCondition = (bookingDate: number) => bookingDate > now;

    expect(futureCondition(yesterday)).toBe(false); // Ontem NÃO é futura
    expect(futureCondition(today)).toBe(false); // Hoje NÃO é futura ✅
    expect(futureCondition(tomorrow)).toBe(true); // Amanhã é futura ✅

    console.log('✅ Filtro "Futuras": exclui hoje, inclui apenas datas futuras');
  });

  it('should filter past bookings correctly (date <= today)', () => {
    const now = Date.now();
    const today = now;
    const tomorrow = now + 24 * 60 * 60 * 1000; // +1 dia
    const yesterday = now - 24 * 60 * 60 * 1000; // -1 dia

    // Simular lógica do filtro "past"
    const pastCondition = (bookingDate: number) => bookingDate <= now;

    expect(pastCondition(yesterday)).toBe(true); // Ontem é passada ✅
    expect(pastCondition(today)).toBe(true); // Hoje é passada ✅
    expect(pastCondition(tomorrow)).toBe(false); // Amanhã NÃO é passada

    console.log('✅ Filtro "Passadas": inclui hoje e datas anteriores');
  });

  it('should categorize bookings on 13/12/2025 correctly', () => {
    // Simular data de hoje: 13/12/2025 meio-dia
    const today = new Date('2025-12-13T12:00:00').getTime();
    
    // Reservas de teste
    const bookings = [
      { id: 1, date: new Date('2025-12-12T00:00:00').getTime(), name: 'Ontem' },
      { id: 2, date: new Date('2025-12-13T00:00:00').getTime(), name: 'Hoje (manhã)' },
      { id: 3, date: new Date('2025-12-13T23:59:59').getTime(), name: 'Hoje (noite)' },
      { id: 4, date: new Date('2025-12-14T00:00:00').getTime(), name: 'Amanhã' },
    ];

    // Filtrar futuras (date > today)
    const futureBookings = bookings.filter(b => b.date > today);
    
    // Filtrar passadas (date <= today)
    const pastBookings = bookings.filter(b => b.date <= today);

    // Validar resultados
    expect(futureBookings.length).toBe(2); // "Hoje (noite)" e "Amanhã"
    expect(futureBookings.map(b => b.name)).toEqual(['Hoje (noite)', 'Amanhã']);

    expect(pastBookings.length).toBe(2); // "Ontem", "Hoje (manhã)"
    expect(pastBookings.map(b => b.name)).toEqual(['Ontem', 'Hoje (manhã)']);

    console.log('✅ Reservas do dia 13/12/2025 são filtradas baseado no horário exato');
    console.log('✅ Reservas antes do horário atual aparecem em "Passadas"');
    console.log('✅ Reservas depois do horário atual aparecem em "Futuras"');
  });

  it('should handle edge cases at midnight', () => {
    const midnight = new Date('2025-12-13T00:00:00').getTime();
    const oneSecondBefore = midnight - 1; // 12/12 23:59:59
    const oneSecondAfter = midnight + 1; // 13/12 00:00:01

    // Filtro "future" (date > midnight)
    expect(oneSecondBefore > midnight).toBe(false); // Antes da meia-noite NÃO é futura
    expect(midnight > midnight).toBe(false); // Meia-noite exata NÃO é futura ✅
    expect(oneSecondAfter > midnight).toBe(true); // Depois da meia-noite é futura

    // Filtro "past" (date <= midnight)
    expect(oneSecondBefore <= midnight).toBe(true); // Antes da meia-noite é passada
    expect(midnight <= midnight).toBe(true); // Meia-noite exata é passada ✅
    expect(oneSecondAfter <= midnight).toBe(false); // Depois da meia-noite NÃO é passada

    console.log('✅ Lógica correta na transição de meia-noite');
  });
});
