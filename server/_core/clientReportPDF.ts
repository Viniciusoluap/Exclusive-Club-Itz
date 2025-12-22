import PDFDocument from "pdfkit";
import axios from "axios";

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

      // ========== PÁGINA 1: DADOS BÁSICOS ==========
      doc.fontSize(20).font("Helvetica-Bold").text("Ficha do Cliente", { align: "center" });
      doc.moveDown(1);

      // Dados básicos
      doc.fontSize(12).font("Helvetica-Bold").text("Dados Pessoais", { underline: true });
      doc.moveDown(0.5);
      
      doc.fontSize(11).font("Helvetica");
      doc.text(`Nome: ${client.name}`);
      doc.text(`Email: ${client.email}`);
      if (client.phone) {
        doc.text(`Telefone: ${client.phone}`);
      }
      doc.moveDown(1);

      // Cotas
      doc.fontSize(12).font("Helvetica-Bold").text("Cotas Contratadas", { underline: true });
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
        doc.fontSize(16).font("Helvetica-Bold").text("Documento Pessoal", { align: "center" });
        doc.moveDown(1);

        try {
          const documentResponse = await axios.get(client.documentUrl, {
            responseType: "arraybuffer",
            timeout: 10000,
          });

          const documentBuffer = Buffer.from(documentResponse.data);
          const contentType = documentResponse.headers["content-type"] || "";

          if (contentType.includes("image")) {
            // Incorporar imagem do documento
            const imgWidth = 400;
            const imgHeight = 500;
            const x = (doc.page.width - imgWidth) / 2;
            const y = doc.y;

            doc.image(documentBuffer, x, y, {
              fit: [imgWidth, imgHeight],
              align: "center",
            });
          } else {
            // Se for PDF, apenas indicar
            doc.fontSize(11).font("Helvetica").text(
              "Documento anexado (PDF). Visualize separadamente.",
              { align: "center" }
            );
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
        doc.fontSize(16).font("Helvetica-Bold").text("Contrato do Cliente", { align: "center" });
        doc.moveDown(1);

        try {
          const contractResponse = await axios.get(client.contractUrl, {
            responseType: "arraybuffer",
            timeout: 10000,
          });

          const contractBuffer = Buffer.from(contractResponse.data);
          const contentType = contractResponse.headers["content-type"] || "";

          if (contentType.includes("image")) {
            // Incorporar imagem do contrato
            const imgWidth = 400;
            const imgHeight = 500;
            const x = (doc.page.width - imgWidth) / 2;
            const y = doc.y;

            doc.image(contractBuffer, x, y, {
              fit: [imgWidth, imgHeight],
              align: "center",
            });
          } else {
            // Se for PDF, apenas indicar
            doc.fontSize(11).font("Helvetica").text(
              "Contrato anexado (PDF). Visualize separadamente.",
              { align: "center" }
            );
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
        doc.fontSize(16).font("Helvetica-Bold").text("Contrato 2 do Cliente", { align: "center" });
        doc.moveDown(1);

        try {
          const contract2Response = await axios.get(client.contract2Url, {
            responseType: "arraybuffer",
            timeout: 10000,
          });

          const contract2Buffer = Buffer.from(contract2Response.data);
          const contentType = contract2Response.headers["content-type"] || "";

          if (contentType.includes("image")) {
            // Incorporar imagem do contrato 2
            const imgWidth = 400;
            const imgHeight = 500;
            const x = (doc.page.width - imgWidth) / 2;
            const y = doc.y;

            doc.image(contract2Buffer, x, y, {
              fit: [imgWidth, imgHeight],
              align: "center",
            });
          } else {
            // Se for PDF, apenas indicar
            doc.fontSize(11).font("Helvetica").text(
              "Contrato 2 anexado (PDF). Visualize separadamente.",
              { align: "center" }
            );
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
