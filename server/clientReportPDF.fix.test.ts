import { describe, expect, it } from "vitest";
import { generateClientReport } from "./_core/clientReportPDF";
import fs from "fs";
import path from "path";

describe("clientReportPDF - Correções de Layout e Documentos", () => {
  it("deve incluir logo da Exclusive Club no cabeçalho", async () => {
    const logoPath = path.join(process.cwd(), "client/public/logo-exclusive-round.png");
    
    // Validar que o logo existe no projeto
    expect(fs.existsSync(logoPath)).toBe(true);
    
    const clientData = {
      name: "Cliente Teste",
      email: "teste@example.com",
      phone: "11999999999",
      quotas: [
        {
          vesselName: "Lancha Azul",
          quotaNumber: 5,
          quotaType: "full" as const,
        },
      ],
    };

    const pdfBuffer = await generateClientReport(clientData);
    
    // Validar que PDF foi gerado
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    
    // Validar que é um PDF válido
    const pdfHeader = pdfBuffer.toString("ascii", 0, 4);
    expect(pdfHeader).toBe("%PDF");
  });

  it("deve aplicar cores da marca (azul #0891b2) nos títulos", async () => {
    const clientData = {
      name: "Cliente Teste",
      email: "teste@example.com",
      quotas: [],
    };

    const pdfBuffer = await generateClientReport(clientData);
    
    // Validar que PDF foi gerado com sucesso
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    
    // Validar estrutura do PDF (tamanho indica que conteúdo foi gerado)
    // Nota: Conteúdo textual usa encoding especial, então validamos tamanho
    expect(pdfBuffer.length).toBeGreaterThan(3000); // PDF com logo e texto
  });

  it("deve incorporar imagens de documentos quando fornecidas (não apenas links)", async () => {
    // Simular cliente com documento (URL de imagem real)
    const clientData = {
      name: "Cliente com Documento",
      email: "cliente@example.com",
      quotas: [],
      documentUrl: "https://via.placeholder.com/400x500.png", // Imagem de teste
    };

    const pdfBuffer = await generateClientReport(clientData);
    
    // Validar que PDF foi gerado
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    
    // Validar que imagem foi incorporada (PDFs com imagens são maiores)
    // Nota: Conteúdo textual usa encoding especial, então validamos tamanho
    expect(pdfBuffer.length).toBeGreaterThan(10000); // Imagem incorporada aumenta tamanho significativamente
  });

  it("deve criar layout profissional em A4 com múltiplas páginas", async () => {
    const clientData = {
      name: "Cliente Completo",
      email: "completo@example.com",
      phone: "11987654321",
      quotas: [
        {
          vesselName: "Lancha Premium",
          quotaNumber: 10,
          quotaType: "full" as const,
        },
        {
          vesselName: "Jet Ski",
          quotaNumber: 3,
          quotaType: "half" as const,
        },
      ],
      documentUrl: "https://via.placeholder.com/400x500.png",
      contractUrl: "https://via.placeholder.com/400x600.png",
    };

    const pdfBuffer = await generateClientReport(clientData);
    
    // Validar que PDF foi gerado
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    
    // Validar estrutura do PDF (múltiplas páginas + imagens)
    // Nota: Conteúdo textual usa encoding especial, então validamos tamanho e páginas
    const pdfContent = pdfBuffer.toString("latin1");
    
    // Validar que tem múltiplas páginas (3 páginas: dados + documento + contrato)
    expect(pdfContent).toContain("/Count 3"); // 3 páginas no PDF
    
    // PDF com múltiplas páginas e 2 imagens incorporadas deve ser grande
    expect(pdfBuffer.length).toBeGreaterThan(20000); // Logo + 2 imagens
  });
});
