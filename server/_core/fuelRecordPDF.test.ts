import { describe, it, expect } from 'vitest';
import { generateFuelRecordsPDF } from './fuelRecordPDF';

/**
 * Testes para validar geração de PDF de abastecimentos
 * 
 * BUG CORRIGIDO:
 * - Erro: "Browser was not found at the configured executablePath (/usr/bin/chromium-browser)"
 * - Causa: Caminho incorreto do Chromium
 * - Solução: Usar /usr/lib/chromium-browser/chromium-browser com fallback
 */

describe('generateFuelRecordsPDF', () => {
  it('deve gerar PDF com registro único de abastecimento', async () => {
    const records = [
      {
        id: 1,
        vesselName: 'JETSKI SEADOO GTI SE 130HP',
        clientName: 'EDILSON DA CONCEIÇÃO COSTA',
        clientEmail: 'edilson@example.com',
        liters: 1000, // 10.00L em centavos
        pricePerLiter: 700, // R$ 7.00 em centavos
        totalAmount: 7000, // R$ 70.00 em centavos
        notes: 'Abastecimento completo',
        createdAt: new Date('2025-12-07'),
      },
    ];

    const pdfBuffer = await generateFuelRecordsPDF(records);

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    // Verificar assinatura PDF (%PDF)
    expect(pdfBuffer.toString('utf-8', 0, 4)).toBe('%PDF');
  }, 15000); // 15s timeout para geração de PDF

  it('deve gerar PDF com múltiplos registros de abastecimento', async () => {
    const records = [
      {
        id: 1,
        vesselName: 'JETSKI SEADOO GTI SE 130HP',
        clientName: 'Cliente 1',
        clientEmail: 'cliente1@example.com',
        liters: 1000,
        pricePerLiter: 700,
        totalAmount: 7000,
        createdAt: new Date('2025-12-07'),
      },
      {
        id: 2,
        vesselName: 'LANCHA FOCKER 255',
        clientName: 'Cliente 2',
        clientEmail: 'cliente2@example.com',
        liters: 2000,
        pricePerLiter: 750,
        totalAmount: 15000,
        createdAt: new Date('2025-12-08'),
      },
    ];

    const pdfBuffer = await generateFuelRecordsPDF(records);

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    expect(pdfBuffer.toString('utf-8', 0, 4)).toBe('%PDF');
  }, 15000);

  it('deve gerar PDF vazio quando não há registros', async () => {
    const records: any[] = [];

    const pdfBuffer = await generateFuelRecordsPDF(records);

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    expect(pdfBuffer.toString('utf-8', 0, 4)).toBe('%PDF');
  }, 15000);
});
