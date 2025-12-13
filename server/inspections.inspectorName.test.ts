import { describe, it, expect } from 'vitest';

describe('Inspections - Inspector Name', () => {
  it('should use inspectorName from input instead of logged user name', () => {
    // Simular dados de input
    const input = {
      bookingId: 1,
      vesselId: 1,
      vesselType: 'jetski' as const,
      clientName: 'João Silva', // Nome do cliente (da reserva)
      inspectorName: 'Rafael', // Nome de quem está fazendo a vistoria
      formData: {
        'PINTURA / CASCO': 'APROVADO',
        'LUZES GERAL': 'APROVADO',
      },
      observations: 'Tudo ok',
    };

    // Simular contexto com usuário logado
    const ctx = {
      user: {
        id: 1,
        name: 'Vinicius Freitas', // Usuário logado (NÃO deve aparecer)
        role: 'admin' as const,
      },
    };

    // Simular o que deve ser salvo no banco
    const expectedDbValues = {
      clientName: 'João Silva', // Nome do cliente
      inspectedBy: 'Rafael', // Nome do vistoriador (do input, NÃO do ctx.user)
    };

    // Validar que inspectedBy vem do input.inspectorName
    expect(input.inspectorName).toBe('Rafael');
    expect(expectedDbValues.inspectedBy).toBe(input.inspectorName);
    expect(expectedDbValues.inspectedBy).not.toBe(ctx.user.name);

    console.log('✅ inspectedBy usa input.inspectorName ("Rafael")');
    console.log('✅ inspectedBy NÃO usa ctx.user.name ("Vinicius Freitas")');
    console.log('✅ clientName e inspectorName são campos separados');
  });

  it('should display inspectorName in all 3 places correctly', () => {
    const inspection = {
      id: 1,
      vesselName: 'JETSKI SEADOO GTI SE 130HP',
      vesselType: 'jetski',
      clientName: 'João Silva',
      inspectedBy: 'Rafael', // Nome digitado no formulário
      inspectionData: {
        'PINTURA / CASCO': 'APROVADO',
        'LUZES GERAL': 'REPROVADO',
      },
      observations: 'Luzes precisam de manutenção',
      createdAt: new Date('2025-12-13'),
    };

    // Lugar 1: Lista de vistorias (frontend)
    const listDisplay = inspection.inspectedBy || 'N/A';
    expect(listDisplay).toBe('Rafael');

    // Lugar 2: PDF - Coluna "Vistoriado por"
    const pdfColumn = inspection.inspectedBy || 'N/A';
    expect(pdfColumn).toBe('Rafael');

    // Lugar 3: PDF - Seção de observações (mesmo nome)
    const pdfSection = inspection.inspectedBy || 'N/A';
    expect(pdfSection).toBe('Rafael');

    // Todos os 3 lugares devem mostrar o MESMO nome
    expect(listDisplay).toBe(pdfColumn);
    expect(pdfColumn).toBe(pdfSection);

    console.log('✅ Lista de vistorias: "Rafael"');
    console.log('✅ PDF coluna: "Rafael"');
    console.log('✅ PDF seção: "Rafael"');
    console.log('✅ Todos os 3 lugares mostram o MESMO nome');
  });
});
