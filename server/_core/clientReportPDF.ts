import PDFDocument from "pdfkit";
import { CORES, caminhoDoLogo, baixarImagemExterna } from "./pdfBase";

interface ClientData {
  name: string;
  email: string;
  phone?: string;
  quotas: Array<{
    vesselName: string;
    quotaNumber: number;
    quotaType: "full" | "half";
  }>;
  contractUrl?: string;
  contract2Url?: string;
  documentUrl?: string;
}

/**
 * Converte todas as páginas de um PDF para imagens e incorpora no documento
 */
async function incorporateAllPdfPages(
  doc: PDFKit.PDFDocument,
  pdfBuffer: Buffer,
  title: string
): Promise<void> {
  try {
    const { pdf } = await import("pdf-to-img");
    const pdfDocument = await pdf(pdfBuffer, { scale: 2.0 });
    const pages: Buffer[] = [];
    
    // Coletar todas as páginas
    for await (const page of pdfDocument) {
      pages.push(page);
    }
    
    if (pages.length === 0) {
      doc.fontSize(11).font("Helvetica").fillColor(CORES.cinzaClaro).text(
        "PDF sem páginas.",
        { align: "center" }
      );
      doc.fillColor(CORES.preto);
      return;
    }
    
    // Incorporar cada página
    for (let i = 0; i < pages.length; i++) {
      // Adicionar nova página para cada página do PDF (exceto a primeira)
      if (i > 0) {
        doc.addPage();
        // Adicionar título apenas na primeira página
        if (i === 1) {
          doc.fillColor(CORES.marca).fontSize(18).font("Helvetica-Bold").text(title + " (continuação)", { align: "center" });
          doc.fillColor(CORES.preto);
          doc.moveDown(1);
        }
      }
      
      const maxWidth = 450;
      const maxHeight = 600;
      const x = (doc.page.width - maxWidth) / 2;
      const y = doc.y + 10;
      
      doc.image(pages[i], x, y, {
        fit: [maxWidth, maxHeight],
        align: "center",
      });
    }
  } catch (pdfError) {
    console.error(`[PDF] Erro ao converter ${title}:`, pdfError);
    doc.fontSize(11).font("Helvetica").fillColor(CORES.cinzaClaro).text(
      "Erro ao processar PDF.",
      { align: "center" }
    );
    doc.fillColor(CORES.preto);
  }
}

/**
 * Gera PDF com relatório completo do cliente
 * Inclui: dados básicos, documento pessoal, contrato(s)
 */
export async function generateClientReport(client: ClientData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: "A4", 
        margin: 50,
        bufferPages: true 
      });
      const buffers: Buffer[] = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      // ========== PÁGINA 1: CABEÇALHO COM LOGO + DADOS BÁSICOS ==========
      
      // Logo da Exclusive Club (centralizada)
      const logoPath = caminhoDoLogo();
      if (logoPath) {
        const logoSize = 80;
        const logoX = (doc.page.width - logoSize) / 2;
        doc.image(logoPath, logoX, 50, { width: logoSize, height: logoSize });
        // Ajustar posição Y após logo para evitar sobreposição
        doc.y = 50 + logoSize + 20; // Logo + espaçamento
      }

      // Título com cor da marca
      doc.fillColor(CORES.marca).fontSize(22).font("Helvetica-Bold").text("Ficha do Cliente", { align: "center" });
      doc.fillColor(CORES.preto); // Voltar para preto
      doc.moveDown(1.5);

      // Dados básicos
      doc.fillColor(CORES.marca).fontSize(12).font("Helvetica-Bold").text("Dados Pessoais", { underline: true });
      doc.fillColor(CORES.preto);
      doc.moveDown(0.5);
      
      doc.fontSize(11).font("Helvetica");
      doc.text(`Nome: ${client.name}`);
      doc.text(`Email: ${client.email}`);
      if (client.phone) {
        doc.text(`Telefone: ${client.phone}`);
      }
      doc.moveDown(1);

      // Cotas
      doc.fillColor(CORES.marca).fontSize(12).font("Helvetica-Bold").text("Cotas Contratadas", { underline: true });
      doc.fillColor(CORES.preto);
      doc.moveDown(0.5);
      
      doc.fontSize(11).font("Helvetica");
      if (client.quotas.length === 0) {
        doc.text("Nenhuma cota contratada");
      } else {
        client.quotas.forEach((quota, index) => {
          const quotaType = quota.quotaType === "full" ? "Inteira" : "Meia";
          doc.text(`${index + 1}. ${quota.vesselName} - Cota #${quota.quotaNumber} (${quotaType})`);
        });
      }
      doc.moveDown(2);

      // ========== DOCUMENTO PESSOAL (TODAS AS PÁGINAS) ==========
      if (client.documentUrl) {
        doc.addPage();
        doc.fillColor(CORES.marca).fontSize(18).font("Helvetica-Bold").text("Documento Pessoal", { align: "center" });
        doc.fillColor(CORES.preto);
        doc.moveDown(1);

        try {
          const documentBaixado = await baixarImagemExterna(client.documentUrl);
          const documentBuffer = documentBaixado.bytes;
          const contentType = documentBaixado.contentType;

          if (contentType.includes("image")) {
            // Incorporar imagem do documento com dimensões otimizadas para A4
            const maxWidth = 450;
            const maxHeight = 600;
            const x = (doc.page.width - maxWidth) / 2;
            const y = doc.y + 10;

            doc.image(documentBuffer, x, y, {
              fit: [maxWidth, maxHeight],
              align: "center",
            });
          } else if (contentType.includes("pdf")) {
            // Converter TODAS as páginas do PDF para imagens e incorporar
            await incorporateAllPdfPages(doc, documentBuffer, "Documento Pessoal");
          } else {
            doc.fontSize(11).font("Helvetica").fillColor(CORES.cinzaClaro).text(
              "Formato de documento não suportado para visualização.",
              { align: "center" }
            );
            doc.fillColor(CORES.preto);
          }
        } catch (error) {
          console.error("[PDF] Erro ao incorporar documento pessoal:", error);
          doc.fontSize(11).font("Helvetica").text(
            "Erro ao carregar documento pessoal",
            { align: "center" }
          );
        }
      }

      // ========== CONTRATO PRINCIPAL (TODAS AS PÁGINAS) ==========
      if (client.contractUrl) {
        doc.addPage();
        doc.fillColor(CORES.marca).fontSize(18).font("Helvetica-Bold").text("Contrato do Cliente", { align: "center" });
        doc.fillColor(CORES.preto);
        doc.moveDown(1);

        try {
          const contractBaixado = await baixarImagemExterna(client.contractUrl);
          const contractBuffer = contractBaixado.bytes;
          const contentType = contractBaixado.contentType;

          if (contentType.includes("image")) {
            // Incorporar imagem do contrato com dimensões otimizadas para A4
            const maxWidth = 450;
            const maxHeight = 600;
            const x = (doc.page.width - maxWidth) / 2;
            const y = doc.y + 10;

            doc.image(contractBuffer, x, y, {
              fit: [maxWidth, maxHeight],
              align: "center",
            });
          } else if (contentType.includes("pdf")) {
            // Converter TODAS as páginas do PDF para imagens e incorporar
            await incorporateAllPdfPages(doc, contractBuffer, "Contrato do Cliente");
          } else {
            doc.fontSize(11).font("Helvetica").fillColor(CORES.cinzaClaro).text(
              "Formato de contrato não suportado para visualização.",
              { align: "center" }
            );
            doc.fillColor(CORES.preto);
          }
        } catch (error) {
          console.error("[PDF] Erro ao incorporar contrato:", error);
          doc.fontSize(11).font("Helvetica").text(
            "Erro ao carregar contrato",
            { align: "center" }
          );
        }
      }

      // ========== CONTRATO 2 (TODAS AS PÁGINAS) ==========
      if (client.contract2Url) {
        doc.addPage();
        doc.fillColor(CORES.marca).fontSize(18).font("Helvetica-Bold").text("Contrato 2 do Cliente", { align: "center" });
        doc.fillColor(CORES.preto);
        doc.moveDown(1);

        try {
          const contract2Baixado = await baixarImagemExterna(client.contract2Url);
          const contract2Buffer = contract2Baixado.bytes;
          const contentType = contract2Baixado.contentType;

          if (contentType.includes("image")) {
            // Incorporar imagem do contrato 2 com dimensões otimizadas para A4
            const maxWidth = 450;
            const maxHeight = 600;
            const x = (doc.page.width - maxWidth) / 2;
            const y = doc.y + 10;

            doc.image(contract2Buffer, x, y, {
              fit: [maxWidth, maxHeight],
              align: "center",
            });
          } else if (contentType.includes("pdf")) {
            // Converter TODAS as páginas do PDF para imagens e incorporar
            await incorporateAllPdfPages(doc, contract2Buffer, "Contrato 2 do Cliente");
          } else {
            doc.fontSize(11).font("Helvetica").fillColor(CORES.cinzaClaro).text(
              "Formato de contrato não suportado para visualização.",
              { align: "center" }
            );
            doc.fillColor(CORES.preto);
          }
        } catch (error) {
          console.error("[PDF] Erro ao incorporar contrato 2:", error);
          doc.fontSize(11).font("Helvetica").text(
            "Erro ao carregar contrato 2",
            { align: "center" }
          );
        }
      }

      // Finalizar PDF
      doc.end();
    } catch (error) {
      console.error("[PDF] Erro ao gerar relatório do cliente:", error);
      reject(error);
    }
  });
}
