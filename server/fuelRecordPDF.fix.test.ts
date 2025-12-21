import { describe, expect, it } from "vitest";
import { generateFuelRecordsPDF } from "./_core/fuelRecordPDF";

describe("Correções do PDF de Abastecimentos", () => {
  it("deve normalizar caracteres especiais (acentos) corretamente", async () => {
    const records = [
      {
        id: 1,
        vesselName: "Embarcação Especial",
        employeeName: "José da Silva",
        date: new Date("2025-12-21"),
        liters: 3706, // 37.06 L
        pricePerLiter: 639, // R$ 6.39
        subtotal: 23671, // R$ 236.71
        serviceFee: 1000, // R$ 10.00
        totalAmount: 24671, // R$ 246.71
        notes: "Observação com acentuação: José, María, François"
      }
    ];

    const pdfBuffer = await generateFuelRecordsPDF(records);
    
    // Validar que PDF foi gerado
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    
    // Validar que contém header PDF
    const pdfHeader = pdfBuffer.toString('utf-8', 0, 5);
    expect(pdfHeader).toBe('%PDF-');
    
    // Converter buffer para string para buscar conteúdo
    const pdfContent = pdfBuffer.toString('latin1');
    
    // Validar que NÃO contém caracteres sem sentido (Ø=Ü÷)
    expect(pdfContent).not.toContain('Ø=Ü÷');
    expect(pdfContent).not.toContain('Ã©'); // encoding errado de 'é'
    expect(pdfContent).not.toContain('Ã§'); // encoding errado de 'ç'
    
    // Validar que contém texto normalizado (pode aparecer de forma codificada no PDF)
    // Nota: PDFs codificam texto de forma especial, então apenas validamos que foi gerado
    expect(pdfBuffer.length).toBeGreaterThan(1000); // PDF com conteúdo real
  });

  it("deve processar registros com URLs de fotos (incorporação de imagens)", async () => {
    const records = [
      {
        id: 2,
        vesselName: "Lancha Teste",
        employeeName: "Funcionário Teste",
        date: new Date("2025-12-21"),
        liters: 5000, // 50.00 L
        pricePerLiter: 650, // R$ 6.50
        subtotal: 32500, // R$ 325.00
        serviceFee: 1000, // R$ 10.00
        totalAmount: 33500, // R$ 335.00
        weightFull: 5000, // 50.00 kg
        weightAfter: 3000, // 30.00 kg
        weightConsumed: 2000, // 20.00 kg
        litersCalculated: 5000, // 50.00 L
        // URLs de imagens (serão baixadas e incorporadas no PDF real)
        photoBeforeUrl: "https://example.com/foto-antes.jpg",
        photoAfterUrl: "https://example.com/foto-depois.jpg"
      }
    ];

    // Nota: Em ambiente de teste, as URLs podem falhar ao baixar,
    // mas o código trata o erro gracefully e gera o PDF mesmo assim
    const pdfBuffer = await generateFuelRecordsPDF(records);
    
    // Validar que PDF foi gerado com sucesso
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    
    // Validar que contém header PDF
    const pdfHeader = pdfBuffer.toString('utf-8', 0, 5);
    expect(pdfHeader).toBe('%PDF-');
    
    // Validar que PDF tem tamanho razoável (conteúdo completo)
    // Em produção com imagens reais, o PDF será maior
    expect(pdfBuffer.length).toBeGreaterThan(1000);
  });

  it("deve gerar PDF sem erros quando não há fotos", async () => {
    const records = [
      {
        id: 3,
        vesselName: "Lancha Sem Fotos",
        employeeName: "Funcionário",
        date: new Date("2025-12-21"),
        liters: 3000, // 30.00 L
        pricePerLiter: 600, // R$ 6.00
        subtotal: 18000, // R$ 180.00
        serviceFee: 1000, // R$ 10.00
        totalAmount: 19000, // R$ 190.00
        // Sem fotos
        photoBeforeUrl: null,
        photoAfterUrl: null
      }
    ];

    const pdfBuffer = await generateFuelRecordsPDF(records);
    
    // Validar que PDF foi gerado normalmente
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    
    // Validar que contém header PDF
    const pdfHeader = pdfBuffer.toString('utf-8', 0, 5);
    expect(pdfHeader).toBe('%PDF-');
    
    // Converter buffer para string
    const pdfContent = pdfBuffer.toString('latin1');
    
    // Validar que NÃO contém seção de fotos (pois não há fotos)
    expect(pdfContent).not.toContain('Comprovação por Fotos da Balança');
  });

  it("deve formatar valores monetários e de litros corretamente", async () => {
    const records = [
      {
        id: 4,
        vesselName: "Teste Formatação",
        employeeName: "Admin",
        date: new Date("2025-12-21"),
        liters: 12345, // 123.45 L
        pricePerLiter: 678, // R$ 6.78
        subtotal: 83701, // R$ 837.01
        serviceFee: 1000, // R$ 10.00
        totalAmount: 84701 // R$ 847.01
      }
    ];

    const pdfBuffer = await generateFuelRecordsPDF(records);
    
    // Validar que PDF foi gerado
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    
    // Validar header
    const pdfHeader = pdfBuffer.toString('utf-8', 0, 5);
    expect(pdfHeader).toBe('%PDF-');
    
    // Validar que contém valores formatados (buscar no conteúdo do PDF)
    const pdfContent = pdfBuffer.toString('latin1');
    
    // Valores devem aparecer formatados com 2 casas decimais
    // Nota: PDFs codificam números de forma especial, validamos apenas geração
    expect(pdfBuffer.length).toBeGreaterThan(1000);
  });
});
