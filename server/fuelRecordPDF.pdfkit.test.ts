import { describe, it, expect } from 'vitest';
import { generateFuelRecordsPDF } from './_core/fuelRecordPDF';

describe('generateFuelRecordsPDF com PDFKit', () => {
  it('deve gerar PDF sem erro de Puppeteer', async () => {
    const mockRecords = [{
      id: 1,
      vesselName: 'JETSKI SEADOO GTI SE 130HP',
      employeeName: 'Vinicius Freitas',
      date: new Date('2025-12-13'),
      liters: 4000, // 40.00L em centavos
      pricePerLiter: 646, // R$ 6.46 em centavos
      subtotal: 25840, // R$ 258.40 em centavos
      serviceFee: 1000, // R$ 10.00 em centavos
      totalAmount: 26840, // R$ 268.40 em centavos
      notes: 'Teste de geração de PDF'
    }];

    const pdfBuffer = await generateFuelRecordsPDF(mockRecords);
    
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    
    // Verificar assinatura PDF
    const pdfSignature = pdfBuffer.toString('utf8', 0, 4);
    expect(pdfSignature).toBe('%PDF');
  });

  it('deve gerar PDF com múltiplos registros', async () => {
    const mockRecords = [
      {
        id: 1,
        vesselName: 'JETSKI SEADOO',
        employeeName: 'Vinicius',
        date: new Date('2025-12-13'),
        liters: 4000,
        pricePerLiter: 646,
        subtotal: 25840,
        serviceFee: 1000,
        totalAmount: 26840,
      },
      {
        id: 2,
        vesselName: 'FOCKER 215',
        employeeName: 'Rafael',
        date: new Date('2025-12-14'),
        liters: 7900,
        pricePerLiter: 800,
        subtotal: 63200,
        serviceFee: 1000,
        totalAmount: 64200,
      }
    ];

    const pdfBuffer = await generateFuelRecordsPDF(mockRecords);
    
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    expect(pdfBuffer.toString('utf8', 0, 4)).toBe('%PDF');
  });

  it('deve gerar PDF vazio sem registros', async () => {
    const mockRecords: any[] = [];

    const pdfBuffer = await generateFuelRecordsPDF(mockRecords);
    
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    expect(pdfBuffer.toString('utf8', 0, 4)).toBe('%PDF');
  });
});
