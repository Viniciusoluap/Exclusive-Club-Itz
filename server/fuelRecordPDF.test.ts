import { describe, it, expect } from 'vitest';
import { generateFuelRecordsPDF } from './_core/fuelRecordPDF';

describe('Fuel Record PDF Generation', () => {
  it('deve gerar PDF sem erro de executablePath', async () => {
    const mockRecords = [
      {
        id: 1,
        vesselName: 'Jetski Sea-Doo GTI SE 130HP',
        clientName: 'Cliente Teste',
        clientEmail: 'teste@example.com',
        liters: 5000, // 50.00L em centavos
        pricePerLiter: 650, // R$ 6.50 em centavos
        totalAmount: 32500, // R$ 325.00 em centavos
        notes: 'Teste de abastecimento',
        createdAt: new Date('2025-12-13T15:00:00Z'),
        bookingDate: '2025-12-13',
      },
    ];

    // Deve gerar PDF sem lançar erro de executablePath
    const pdfBuffer = await generateFuelRecordsPDF(mockRecords);
    
    // Validar que retornou um Buffer válido
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    
    // Validar que é um PDF válido (começa com %PDF)
    const pdfHeader = pdfBuffer.toString('utf-8', 0, 4);
    expect(pdfHeader).toBe('%PDF');
  }, 30000); // Timeout de 30s para geração de PDF
});
