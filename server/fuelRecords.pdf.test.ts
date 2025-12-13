import { describe, expect, it } from "vitest";
import { generateFuelRecordsPDF } from "./_core/fuelRecordPDF";

describe("fuelRecords.generatePDF", () => {
  it("should generate PDF buffer from fuel records", async () => {
    const mockRecords = [
      {
        id: 1,
        vesselName: "JETSKI SEADOO GTI SE 130HP",
        employeeName: "Diogo Brito",
        date: new Date("2025-12-05"),
        liters: 7900, // 79.00L em centavos
        pricePerLiter: 800, // R$ 8.00 em centavos
        subtotal: 63200, // R$ 632.00 em centavos
        serviceFee: 1000, // R$ 10.00 em centavos
        totalAmount: 64200, // R$ 642.00 em centavos
        notes: "Teste de abastecimento",
      },
      {
        id: 2,
        vesselName: "JETSKI SEADOO GTI SE 130HP",
        employeeName: "Rodrigo FAGNER",
        date: new Date("2025-12-06"),
        liters: 600, // 6.00L em centavos
        pricePerLiter: 700, // R$ 7.00 em centavos
        subtotal: 4200, // R$ 42.00 em centavos
        serviceFee: 1000, // R$ 10.00 em centavos
        totalAmount: 5200, // R$ 52.00 em centavos
        notes: null,
      },
    ];

    const pdfBuffer = await generateFuelRecordsPDF(mockRecords);

    // Validar que retornou um Buffer
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    
    // Validar que o buffer não está vazio
    expect(pdfBuffer.length).toBeGreaterThan(0);
    
    // Validar que começa com assinatura PDF (%PDF)
    const pdfSignature = pdfBuffer.toString('utf8', 0, 4);
    expect(pdfSignature).toBe('%PDF');
    
    console.log(`✅ PDF gerado com sucesso: ${pdfBuffer.length} bytes`);
  }, 30000); // Timeout de 30s para download do Chromium se necessário
});
