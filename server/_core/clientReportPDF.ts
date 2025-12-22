import PDFDocument from "pdfkit";
import axios from "axios";
import path from "path";
import fs from "fs";
import { pdf } from "pdf-to-img";

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
      const logoPath = path.join(process.cwd(), "client/public/logo-exclusive-round.png");
      if (fs.existsSync(logoPath)) {
        const logoSize = 80;
        const logoX = (doc.page.width - logoSize) / 2;
        doc.image(logoPath, logoX, 50, { width: logoSize, height: logoSize });
        // Ajustar posição Y após logo para evitar sobreposição
        doc.y = 50 + logoSize + 20; // Logo + espaçamento
      }

      // Título com cor da marca
      doc.fillColor("#0891b2").fontSize(22).font("Helvetica-Bold").text("Ficha do Cliente", { align: "center" });
      doc.fillColor("#000000"); // Voltar para preto
      doc.moveDown(1.5);

      // Dados básicos
      doc.fillColor("#0891b2").fontSize(12).font("Helvetica-Bold").text("Dados Pessoais", { underline: true });
      doc.fillColor("#000000");
      doc.moveDown(0.5);
      
      doc.fontSize(11).font("Helvetica");
      doc.text(`Nome: ${client.name}`);
      doc.text(`Email: ${client.email}`);
      if (client.phone) {
        doc.text(`Telefone: ${client.phone}`);
      }
      doc.moveDown(1);

      // Cotas
      doc.fillColor("#0891b2").fontSize(12).font("Helvetica-Bold").text("Cotas Contratadas", { underline: true });
      doc.fillColor("#000000");
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

      // ========== PÁGINA 2: DOCUMENTO PESSOAL ==========
      if (client.documentUrl) {
        doc.addPage();
        doc.fillColor("#0891b2").fontSize(18).font("Helvetica-Bold").text("Documento Pessoal", { align: "center" });
        doc.fillColor("#000000");
        doc.moveDown(1);

        try {
          const documentResponse = await axios.get(client.documentUrl, {
            responseType: "arraybuffer",
            timeout: 10000,
          });

          const documentBuffer = Buffer.from(documentResponse.data);
          const contentType = documentResponse.headers["content-type"] || "";

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
            // Converter primeira página do PDF para imagem e incorporar
            try {
              const pdfDocument = await pdf(documentBuffer, { scale: 2.0 });
              let firstPageBuffer: Buffer | null = null;
              
              // Obter primeira página
              for await (const page of pdfDocument) {
                firstPageBuffer = page;
                break; // Apenas primeira página
              }
              
              if (firstPageBuffer) {
                const maxWidth = 450;
                const maxHeight = 600;
                const x = (doc.page.width - maxWidth) / 2;
                const y = doc.y + 10;
                
                doc.image(firstPageBuffer, x, y, {
                  fit: [maxWidth, maxHeight],
                  align: "center",
                });
              } else {
                doc.fontSize(11).font("Helvetica").fillColor("#666666").text(
                  "PDF sem páginas.",
                  { align: "center" }
                );
                doc.fillColor("#000000");
              }
            } catch (pdfError) {
              console.error("[PDF] Erro ao converter PDF do documento:", pdfError);
              doc.fontSize(11).font("Helvetica").fillColor("#666666").text(
                "Erro ao processar PDF.",
                { align: "center" }
              );
              doc.fillColor("#000000");
            }
          } else {
            doc.fontSize(11).font("Helvetica").fillColor("#666666").text(
              "Formato de documento não suportado para visualização.",
              { align: "center" }
            );
            doc.fillColor("#000000");
          }
        } catch (error) {
          console.error("[PDF] Erro ao incorporar documento pessoal:", error);
          doc.fontSize(11).font("Helvetica").text(
            "Erro ao carregar documento pessoal",
            { align: "center" }
          );
        }
      }

      // ========== PÁGINA 3: CONTRATO PRINCIPAL ==========
      if (client.contractUrl) {
        doc.addPage();
        doc.fillColor("#0891b2").fontSize(18).font("Helvetica-Bold").text("Contrato do Cliente", { align: "center" });
        doc.fillColor("#000000");
        doc.moveDown(1);

        try {
          const contractResponse = await axios.get(client.contractUrl, {
            responseType: "arraybuffer",
            timeout: 10000,
          });

          const contractBuffer = Buffer.from(contractResponse.data);
          const contentType = contractResponse.headers["content-type"] || "";

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
            // Converter primeira página do PDF para imagem e incorporar
            try {
              const pdfDocument = await pdf(contractBuffer, { scale: 2.0 });
              let firstPageBuffer: Buffer | null = null;
              
              // Obter primeira página
              for await (const page of pdfDocument) {
                firstPageBuffer = page;
                break; // Apenas primeira página
              }
              
              if (firstPageBuffer) {
                const maxWidth = 450;
                const maxHeight = 600;
                const x = (doc.page.width - maxWidth) / 2;
                const y = doc.y + 10;
                
                doc.image(firstPageBuffer, x, y, {
                  fit: [maxWidth, maxHeight],
                  align: "center",
                });
              } else {
                doc.fontSize(11).font("Helvetica").fillColor("#666666").text(
                  "PDF sem páginas.",
                  { align: "center" }
                );
                doc.fillColor("#000000");
              }
            } catch (pdfError) {
              console.error("[PDF] Erro ao converter PDF do contrato:", pdfError);
              doc.fontSize(11).font("Helvetica").fillColor("#666666").text(
                "Erro ao processar PDF.",
                { align: "center" }
              );
              doc.fillColor("#000000");
            }
          } else {
            doc.fontSize(11).font("Helvetica").fillColor("#666666").text(
              "Formato de contrato não suportado para visualização.",
              { align: "center" }
            );
            doc.fillColor("#000000");
          }
        } catch (error) {
          console.error("[PDF] Erro ao incorporar contrato:", error);
          doc.fontSize(11).font("Helvetica").text(
            "Erro ao carregar contrato",
            { align: "center" }
          );
        }
      }

      // ========== PÁGINA 4: CONTRATO 2 (SE HOUVER) ==========
      if (client.contract2Url) {
        doc.addPage();
        doc.fillColor("#0891b2").fontSize(18).font("Helvetica-Bold").text("Contrato 2 do Cliente", { align: "center" });
        doc.fillColor("#000000");
        doc.moveDown(1);

        try {
          const contract2Response = await axios.get(client.contract2Url, {
            responseType: "arraybuffer",
            timeout: 10000,
          });

          const contract2Buffer = Buffer.from(contract2Response.data);
          const contentType = contract2Response.headers["content-type"] || "";

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
            // Converter primeira página do PDF para imagem e incorporar
            try {
              const pdfDocument = await pdf(contract2Buffer, { scale: 2.0 });
              let firstPageBuffer: Buffer | null = null;
              
              // Obter primeira página
              for await (const page of pdfDocument) {
                firstPageBuffer = page;
                break; // Apenas primeira página
              }
              
              if (firstPageBuffer) {
                const maxWidth = 450;
                const maxHeight = 600;
                const x = (doc.page.width - maxWidth) / 2;
                const y = doc.y + 10;
                
                doc.image(firstPageBuffer, x, y, {
                  fit: [maxWidth, maxHeight],
                  align: "center",
                });
              } else {
                doc.fontSize(11).font("Helvetica").fillColor("#666666").text(
                  "PDF sem páginas.",
                  { align: "center" }
                );
                doc.fillColor("#000000");
              }
            } catch (pdfError) {
              console.error("[PDF] Erro ao converter PDF do contrato 2:", pdfError);
              doc.fontSize(11).font("Helvetica").fillColor("#666666").text(
                "Erro ao processar PDF.",
                { align: "center" }
              );
              doc.fillColor("#000000");
            }
          } else {
            doc.fontSize(11).font("Helvetica").fillColor("#666666").text(
              "Formato de contrato não suportado para visualização.",
              { align: "center" }
            );
            doc.fillColor("#000000");
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
