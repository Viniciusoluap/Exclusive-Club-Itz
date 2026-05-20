/**
 * htmlToPdf.ts — Converte estruturas de dados para PDF usando PDFKit
 *
 * Substitui a implementação anterior baseada em Puppeteer/Chrome, que
 * não funciona no ambiente de produção (Cloud Run — Node.js only).
 * Usa PDFKit diretamente, sem dependência de Chrome, Chromium ou Python.
 */
import PDFDocument from "pdfkit";

// ============================================================
// Tipos internos
// ============================================================

interface PdfSection {
  type: "header" | "title" | "subtitle" | "h2" | "h3" | "paragraph" | "infoBox" | "table" | "divider" | "spacer" | "signatureBlock" | "warningBox" | "footer";
  content?: string;
  rows?: string[][];
  headers?: string[];
  colWidths?: number[];
  fields?: Array<{ label: string; value: string }>;
  signers?: Array<{ name: string; role: string; extra?: string }>;
  left?: string;
  right?: string;
}

// ============================================================
// Helpers de formatação
// ============================================================

function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "___/___/______";
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return dateStr;
}

// ============================================================
// Renderizador PDFKit genérico
// ============================================================

function renderPdf(sections: PdfSection[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const buffers: Buffer[] = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const pageW = doc.page.width - 100; // usable width (margins 50 each side)
    const BLUE = "#0a3d6b";
    const RED = "#dc2626";
    const GRAY = "#666666";
    const LIGHT_GRAY = "#f8f9fa";

    for (const section of sections) {
      switch (section.type) {
        case "header": {
          // Company name centered + address below
          doc.fillColor(BLUE).fontSize(18).font("Helvetica-Bold").text("EXCLUSIVE CLUB", { align: "center" });
          doc.fillColor(GRAY).fontSize(8.5).font("Helvetica").text(
            "Rua Leôncio Pires Dourado, Nº 840-A, Bairro Bacuri, CEP: 65.901-020 — Imperatriz/MA",
            { align: "center" }
          );
          doc.fillColor(GRAY).fontSize(8.5).text(
            "CNPJ: 50.680.592/0001-08  |  atendimento@exclusiveclubitz.com",
            { align: "center" }
          );
          doc.moveDown(0.5);
          doc.moveTo(50, doc.y).lineTo(50 + pageW, doc.y).strokeColor(BLUE).lineWidth(2).stroke();
          doc.moveDown(0.8);
          break;
        }

        case "title": {
          doc.fillColor("#1a1a1a").fontSize(13).font("Helvetica-Bold").text(section.content || "", { align: "center" });
          doc.moveDown(0.4);
          break;
        }

        case "subtitle": {
          doc.fillColor(GRAY).fontSize(9.5).font("Helvetica").text(section.content || "", { align: "center" });
          doc.moveDown(0.8);
          break;
        }

        case "h2": {
          doc.moveDown(0.5);
          doc.fillColor(RED).fontSize(10.5).font("Helvetica-Bold").text((section.content || "").toUpperCase());
          doc.moveTo(50, doc.y + 2).lineTo(50 + pageW, doc.y + 2).strokeColor(RED).lineWidth(1).stroke();
          doc.moveDown(0.6);
          break;
        }

        case "h3": {
          doc.moveDown(0.3);
          doc.fillColor(BLUE).fontSize(10).font("Helvetica-Bold").text((section.content || "").toUpperCase());
          doc.moveDown(0.4);
          break;
        }

        case "paragraph": {
          doc.fillColor("#1a1a1a").fontSize(10).font("Helvetica").text(section.content || "", { align: "justify", lineGap: 2 });
          doc.moveDown(0.6);
          break;
        }

        case "infoBox": {
          if (!section.fields || section.fields.length === 0) break;
          const startY = doc.y;
          const boxPad = 10;
          const lineH = 16;
          const boxH = section.fields.length * lineH + boxPad * 2;

          doc.rect(50, startY, pageW, boxH).fillColor(LIGHT_GRAY).fill();
          doc.rect(50, startY, pageW, boxH).strokeColor("#dee2e6").lineWidth(0.5).stroke();

          let fieldY = startY + boxPad;
          for (const field of section.fields) {
            doc.fillColor(GRAY).fontSize(8.5).font("Helvetica").text(field.label + ":", 60, fieldY, { continued: true });
            doc.fillColor("#1a1a1a").fontSize(9.5).font("Helvetica-Bold").text("  " + field.value, { lineBreak: false });
            fieldY += lineH;
          }
          doc.y = startY + boxH + 8;
          doc.moveDown(0.3);
          break;
        }

        case "table": {
          if (!section.headers || !section.rows) break;
          const headers = section.headers;
          const rows = section.rows;
          const colWidths = section.colWidths || headers.map(() => pageW / headers.length);

          // Header row
          let x = 50;
          const headerH = 20;
          const startY = doc.y;

          for (let i = 0; i < headers.length; i++) {
            doc.rect(x, startY, colWidths[i], headerH).fillColor(BLUE).fill();
            doc.fillColor("#ffffff").fontSize(8.5).font("Helvetica-Bold").text(headers[i], x + 4, startY + 5, {
              width: colWidths[i] - 8,
              lineBreak: false,
            });
            x += colWidths[i];
          }

          // Data rows
          let rowY = startY + headerH;
          for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            const isTotal = r === rows.length - 1 && section.content === "hasTotal";
            const rowH = 18;
            x = 50;

            for (let i = 0; i < row.length; i++) {
              const bgColor = isTotal ? RED : r % 2 === 0 ? "#ffffff" : "#f9fafb";
              const textColor = isTotal ? "#ffffff" : "#1a1a1a";
              doc.rect(x, rowY, colWidths[i], rowH).fillColor(bgColor).fill();
              doc.rect(x, rowY, colWidths[i], rowH).strokeColor("#e5e7eb").lineWidth(0.3).stroke();
              doc.fillColor(textColor).fontSize(8.5).font(isTotal ? "Helvetica-Bold" : "Helvetica").text(
                row[i] || "",
                x + 4,
                rowY + 4,
                { width: colWidths[i] - 8, lineBreak: false }
              );
              x += colWidths[i];
            }
            rowY += rowH;
          }

          doc.y = rowY + 8;
          doc.moveDown(0.3);
          break;
        }

        case "warningBox": {
          const wStartY = doc.y;
          const wText = section.content || "";
          const wLines = doc.heightOfString(wText, { width: pageW - 24 });
          const wH = wLines + 24;

          doc.rect(50, wStartY, pageW, wH).fillColor("#fff3cd").fill();
          doc.rect(50, wStartY, 4, wH).fillColor("#ffc107").fill();
          doc.fillColor("#92400e").fontSize(9).font("Helvetica").text(wText, 62, wStartY + 10, {
            width: pageW - 24,
            align: "justify",
            lineGap: 1,
          });
          doc.y = wStartY + wH + 8;
          doc.moveDown(0.3);
          break;
        }

        case "divider": {
          doc.moveTo(50, doc.y).lineTo(50 + pageW, doc.y).strokeColor("#cccccc").lineWidth(0.5).stroke();
          doc.moveDown(0.5);
          break;
        }

        case "spacer": {
          doc.moveDown(1);
          break;
        }

        case "signatureBlock": {
          const signers = section.signers || [];
          doc.moveDown(1);

          if (section.content) {
            doc.fillColor("#1a1a1a").fontSize(10).font("Helvetica").text(section.content, { align: "center" });
            doc.moveDown(1.5);
          }

          const sigW = (pageW - 40) / Math.min(signers.length, 2);
          let sigX = 50;

          for (let i = 0; i < signers.length; i++) {
            if (i > 0 && i % 2 === 0) {
              doc.moveDown(4);
              sigX = 50;
            }
            const lineY = doc.y + 50;
            doc.moveTo(sigX + 10, lineY).lineTo(sigX + sigW - 10, lineY).strokeColor("#333333").lineWidth(0.5).stroke();
            doc.fillColor("#1a1a1a").fontSize(9.5).font("Helvetica-Bold").text(signers[i].name, sigX + 10, lineY + 5, {
              width: sigW - 20,
              align: "center",
            });
            doc.fillColor(GRAY).fontSize(8.5).font("Helvetica").text(signers[i].role, sigX + 10, lineY + 18, {
              width: sigW - 20,
              align: "center",
            });
            if (signers[i].extra) {
              doc.fillColor(GRAY).fontSize(8).text(signers[i].extra!, sigX + 10, lineY + 30, {
                width: sigW - 20,
                align: "center",
              });
            }
            sigX += sigW + 20;
          }
          doc.moveDown(5);
          break;
        }

        case "footer": {
          doc.fillColor(GRAY).fontSize(8).font("Helvetica").text(section.content || "", 50, doc.page.height - 40, {
            width: pageW,
            align: "center",
          });
          break;
        }
      }
    }

    doc.end();
  });
}

// ============================================================
// Tipos de dados para os documentos
// ============================================================

export interface NotificationData {
  clientName: string;
  clientCpfCnpj: string;
  clientEmail: string;
  debts: Array<{
    description: string;
    dueDate: string;
    value: number;
    daysOverdue: number;
    type: string;
  }>;
  totalDebt: number;
  notificationDate: string;
  notificationNumber: string;
}

export interface ContractData {
  clientName: string;
  clientCpfCnpj: string;
  clientRg?: string;
  clientPhone: string;
  clientEmail: string;
  clientAddress?: string;
  clientNeighborhood?: string;
  clientCity?: string;
  clientState?: string;
  clientZipCode?: string;
  boatName: string;
  boatDescription: string;
  quotaType: string;
  quotaNumber: number;
  quotaPercentage: string;
  totalQuotas: number;
  adhesionValue: number;
  monthlyFee: number;
  installments: Array<{ description: string; dueDate: string; value: number }>;
  contractDate: string;
}

// ============================================================
// Gerador de Notificação Extrajudicial
// ============================================================

export async function generateNotificationPdf(data: NotificationData): Promise<Buffer> {
  const typeLabels: Record<string, string> = {
    monthly: "Mensalidade",
    quota_sale: "Venda de Cota",
    fuel: "Abastecimento",
    repair: "Reparo",
    inspection: "Vistoria",
    other: "Outros",
  };

  const debtRows = data.debts.map((d) => [
    typeLabels[d.type] || d.type,
    d.description,
    fmtDate(d.dueDate),
    d.daysOverdue > 0 ? `${d.daysOverdue} dias` : "Pendente",
    fmtBRL(d.value),
  ]);

  // Add total row
  debtRows.push(["", "", "", "TOTAL EM ABERTO:", fmtBRL(data.totalDebt)]);

  const sections: PdfSection[] = [
    { type: "header" },
    { type: "title", content: "NOTIFICAÇÃO EXTRAJUDICIAL DE DÉBITOS" },
    { type: "subtitle", content: `Nº ${data.notificationNumber}  |  ${data.notificationDate}` },

    { type: "h2", content: "Identificação do Notificado" },
    {
      type: "infoBox",
      fields: [
        { label: "Nome/Razão Social", value: data.clientName },
        { label: "CPF/CNPJ", value: data.clientCpfCnpj || "Não informado" },
        { label: "E-mail", value: data.clientEmail },
      ],
    },

    { type: "h2", content: "Identificação do Notificante" },
    {
      type: "infoBox",
      fields: [
        { label: "Razão Social", value: "P V G FREITAS — EXCLUSIVE CLUB" },
        { label: "CNPJ", value: "50.680.592/0001-08" },
        { label: "Representante", value: "Paulo Vinicius Gomes Freitas — CPF: 988.600.113-53" },
        { label: "Endereço", value: "Rua Leôncio Pires Dourado, Nº 840-A, Bairro Bacuri, CEP: 65.901-020 — Imperatriz/MA" },
      ],
    },

    { type: "h2", content: "Objeto da Notificação" },
    {
      type: "paragraph",
      content: `Vimos, por meio da presente notificação extrajudicial, comunicar a V. Sa. que, até a presente data de ${data.notificationDate}, constam em aberto em nosso sistema financeiro os seguintes débitos referentes ao contrato de uso compartilhado de embarcação firmado com a EXCLUSIVE CLUB:`,
    },

    { type: "h2", content: "Relação de Débitos em Aberto" },
    {
      type: "table",
      content: "hasTotal",
      headers: ["Tipo", "Descrição", "Vencimento", "Atraso", "Valor"],
      colWidths: [70, 170, 70, 65, 65],
      rows: debtRows,
    },

    { type: "h2", content: "Prazo para Regularização" },
    {
      type: "paragraph",
      content: `Nos termos do Art. 397 do Código Civil Brasileiro (Lei nº 10.406/2002), o devedor que não cumpre a obrigação no prazo estipulado incorre em mora, tornando-se responsável pelo pagamento de juros, correção monetária e demais encargos previstos em contrato e na legislação vigente.`,
    },
    {
      type: "paragraph",
      content: `Diante do exposto, notificamos V. Sa. para que, no prazo improrrogável de 5 (cinco) dias úteis a contar do recebimento desta notificação, proceda à quitação integral dos débitos acima relacionados, totalizando ${fmtBRL(data.totalDebt)}, mediante contato com nossa equipe pelo e-mail atendimento@exclusiveclubitz.com ou pelo sistema disponível em exclusiveclubitz.com.`,
    },
    {
      type: "warningBox",
      content: `ATENÇÃO: O não pagamento no prazo estabelecido implicará na suspensão imediata do direito de uso da embarcação, bem como na adoção das medidas legais cabíveis para recuperação do crédito, incluindo protesto extrajudicial e ação judicial de cobrança, com acréscimo de honorários advocatícios, juros de mora de 1% ao mês e multa contratual de 2% sobre o valor total em aberto, conforme previsto no contrato firmado entre as partes.`,
    },
    {
      type: "paragraph",
      content: `Fundamento legal: Art. 397 do Código Civil (mora); Art. 786 do CPC/2015 (notificação extrajudicial); Lei nº 9.492/1997 (protesto de títulos); Lei nº 8.078/1990 (CDC).`,
    },

    {
      type: "signatureBlock",
      content: `Imperatriz/MA, ${data.notificationDate}`,
      signers: [
        {
          name: "PAULO VINICIUS GOMES FREITAS",
          role: "EXCLUSIVE CLUB — NOTIFICANTE",
          extra: "CNPJ: 50.680.592/0001-08",
        },
      ],
    },

    {
      type: "footer",
      content: "Exclusive Club — Rua Leôncio Pires Dourado, Nº 840-A, Bairro Bacuri, CEP: 65.901-020, Imperatriz/MA  |  CNPJ: 50.680.592/0001-08  |  atendimento@exclusiveclubitz.com",
    },
  ];

  return renderPdf(sections);
}

// ============================================================
// Gerador de Contrato
// ============================================================

export async function generateContractPdf(data: ContractData): Promise<Buffer> {
  const installmentRows = data.installments.slice(0, 20).map((inst, i) => [
    String(i + 1),
    inst.description,
    fmtDate(inst.dueDate),
    fmtBRL(inst.value),
  ]);

  const locationCity = data.clientCity && data.clientState
    ? `${data.clientCity}/${data.clientState}`
    : data.clientCity || "Imperatriz/MA";

  const sections: PdfSection[] = [
    { type: "header" },
    { type: "title", content: "CONTRATO PARA USO COMPARTILHADO DE EMBARCAÇÃO" },
    { type: "subtitle", content: '"EXCLUSIVE CLUB"' },

    { type: "h2", content: "Qualificação das Partes" },
    { type: "h3", content: "CONTRATADO" },
    {
      type: "infoBox",
      fields: [
        { label: "Razão Social", value: "EXCLUSIVE CLUB — P V G FREITAS" },
        { label: "CNPJ/MF", value: "50.680.592/0001-08" },
        { label: "Endereço", value: "Rua Leôncio Pires Dourado, Nº 840-A, Bairro Bacuri, CEP: 65.901-020 — Imperatriz/MA" },
        { label: "Representante Legal", value: "PAULO VINICIUS GOMES FREITAS" },
        { label: "CPF", value: "988.600.113-53" },
        { label: "RG", value: "16191852001-0 SSP/MA" },
      ],
    },

    { type: "h3", content: "CONTRATANTE" },
    {
      type: "infoBox",
      fields: [
        { label: "Nome Completo", value: data.clientName },
        { label: "CPF/CNPJ", value: data.clientCpfCnpj || "___________________________" },
        { label: "RG", value: data.clientRg || "___________________________" },
        { label: "Telefone", value: data.clientPhone || "___________________________" },
        { label: "E-mail", value: data.clientEmail },
        { label: "Endereço", value: data.clientAddress || "_______________________________________________" },
        { label: "Bairro", value: data.clientNeighborhood || "___________________________" },
        { label: "CEP", value: data.clientZipCode || "___________________________" },
        { label: "Cidade/UF", value: locationCity },
      ],
    },

    { type: "h2", content: "Cláusula 1ª — Objeto" },
    {
      type: "paragraph",
      content: `O presente contrato tem por objeto a cessão do direito de uso compartilhado da embarcação denominada ${data.boatName}${data.boatDescription ? ` (${data.boatDescription})` : ""}, de propriedade da EXCLUSIVE CLUB, na modalidade ${data.quotaType}, correspondente à Cota Nº ${data.quotaNumber}, equivalente a ${data.quotaPercentage}% do total de ${data.totalQuotas} cotas da referida embarcação.`,
    },
    {
      type: "paragraph",
      content: `A embarcação será utilizada de forma compartilhada entre os cotistas, conforme calendário de reservas gerenciado pela CONTRATADA por meio do sistema digital Exclusive Club (exclusiveclubitz.com), respeitando as regras de uso estabelecidas neste instrumento.`,
    },

    { type: "h2", content: "Cláusula 2ª — Obtenção do Direito de Posse e Uso" },
    {
      type: "paragraph",
      content: `Pela aquisição do direito de uso da cota descrita na Cláusula 1ª, o CONTRATANTE pagará à CONTRATADA os seguintes valores:`,
    },
    {
      type: "infoBox",
      fields: [
        { label: "Taxa de Adesão (valor único)", value: data.adhesionValue > 0 ? fmtBRL(data.adhesionValue) : "Conforme negociação" },
        { label: "Taxa Mensal de Manutenção", value: data.monthlyFee > 0 ? `${fmtBRL(data.monthlyFee)} / mês` : "Conforme negociação" },
      ],
    },

    ...(installmentRows.length > 0
      ? [
          { type: "h3" as const, content: "Cronograma de Pagamentos" },
          {
            type: "table" as const,
            headers: ["#", "Descrição", "Vencimento", "Valor"],
            colWidths: [30, 250, 100, 80],
            rows: installmentRows,
          },
        ]
      : []),

    { type: "h2", content: "Cláusula 3ª — Reserva para Uso de Embarcação" },
    { type: "paragraph", content: "3.1. O CONTRATANTE deverá realizar as reservas de uso da embarcação exclusivamente por meio do sistema digital disponível em exclusiveclubitz.com, com antecedência mínima de 24 (vinte e quatro) horas." },
    { type: "paragraph", content: "3.2. As reservas estão sujeitas à disponibilidade da embarcação, sendo vedada a sobreposição de horários entre cotistas." },
    { type: "paragraph", content: "3.3. O cancelamento de reserva deverá ser realizado com antecedência mínima de 12 (doze) horas, sob pena de desconto de 1 (uma) hora de uso do saldo disponível." },
    { type: "paragraph", content: "3.4. Cada cotista terá direito ao uso proporcional à sua cota, conforme calendário estabelecido pela CONTRATADA, podendo ser ajustado mediante acordo entre as partes." },

    { type: "h2", content: "Cláusula 4ª — Uso da Embarcação pelo Contratante" },
    { type: "paragraph", content: "4.1. O CONTRATANTE se compromete a utilizar a embarcação de forma responsável, respeitando as normas de segurança náutica estabelecidas pela Marinha do Brasil e pela legislação vigente." },
    { type: "paragraph", content: "4.2. É vedado ao CONTRATANTE: (a) ceder ou sublocar seu direito de uso a terceiros sem autorização expressa da CONTRATADA; (b) utilizar a embarcação para fins comerciais; (c) realizar modificações na embarcação sem autorização prévia." },
    { type: "paragraph", content: "4.3. Danos causados à embarcação por uso inadequado ou negligência do CONTRATANTE serão de sua exclusiva responsabilidade, devendo ser ressarcidos à CONTRATADA no prazo de 30 (trinta) dias após a constatação." },
    { type: "paragraph", content: "4.4. O CONTRATANTE deverá apresentar habilitação náutica válida sempre que conduzir a embarcação, conforme exigência da Autoridade Marítima Brasileira." },
    { type: "paragraph", content: "4.5. O abastecimento de combustível será custeado pelo CONTRATANTE de forma proporcional ao uso, conforme registros do sistema digital da CONTRATADA." },

    { type: "h2", content: "Cláusula 5ª — Vigência e Término" },
    { type: "paragraph", content: "5.1. O presente contrato é celebrado por prazo indeterminado, podendo ser rescindido por qualquer das partes mediante notificação escrita com antecedência mínima de 30 (trinta) dias." },
    { type: "paragraph", content: "5.2. A rescisão antecipada pelo CONTRATANTE não implicará devolução da taxa de adesão já paga, salvo acordo expresso entre as partes." },
    { type: "paragraph", content: "5.3. Em caso de inadimplência superior a 60 (sessenta) dias, a CONTRATADA poderá suspender o direito de uso do CONTRATANTE até a regularização dos débitos, sem prejuízo das demais medidas legais cabíveis." },

    { type: "h2", content: "Cláusula 6ª — Disposições Finais" },
    { type: "paragraph", content: "6.1. O presente contrato é regido pelas disposições do Código Civil Brasileiro (Lei nº 10.406/2002) e pela legislação náutica aplicável." },
    { type: "paragraph", content: "6.2. As partes elegem o foro da Comarca de Imperatriz/MA para dirimir quaisquer controvérsias oriundas deste instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja." },
    { type: "paragraph", content: "6.3. Este instrumento é celebrado em 2 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas." },

    {
      type: "signatureBlock",
      content: `Imperatriz/MA, ${data.contractDate}`,
      signers: [
        {
          name: data.clientName,
          role: "CONTRATANTE",
          extra: `CPF/CNPJ: ${data.clientCpfCnpj || "___________________________"}`,
        },
        {
          name: "PAULO VINICIUS GOMES FREITAS",
          role: "EXCLUSIVE CLUB — CONTRATADA",
          extra: "CNPJ: 50.680.592/0001-08",
        },
        {
          name: "___________________________",
          role: "Testemunha 1",
          extra: "CPF: ___________________________",
        },
        {
          name: "___________________________",
          role: "Testemunha 2",
          extra: "CPF: ___________________________",
        },
      ],
    },

    {
      type: "footer",
      content: "Exclusive Club — Rua Leôncio Pires Dourado, Nº 840-A, Bairro Bacuri, CEP: 65.901-020, Imperatriz/MA  |  CNPJ: 50.680.592/0001-08  |  atendimento@exclusiveclubitz.com",
    },
  ];

  return renderPdf(sections);
}

// ============================================================
// Função legada htmlToPdf — mantida para compatibilidade
// Redireciona para o gerador nativo baseado no conteúdo do HTML
// ============================================================

/**
 * @deprecated Use generateNotificationPdf() ou generateContractPdf() diretamente.
 * Esta função é mantida apenas para compatibilidade com código legado.
 * Detecta o tipo de documento pelo HTML e redireciona para o gerador correto.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  // Detectar tipo de documento pelo conteúdo do HTML
  if (html.includes("NOTIFICAÇÃO EXTRAJUDICIAL") || html.includes("notificationNumber")) {
    // Extrair dados básicos do HTML para gerar PDF nativo
    // Como fallback, gera um PDF simples com o conteúdo textual
    return generateFallbackPdf(html, "NOTIFICAÇÃO EXTRAJUDICIAL DE DÉBITOS");
  }

  if (html.includes("Contrato para Uso Compartilhado") || html.includes("CONTRATANTE")) {
    return generateFallbackPdf(html, "CONTRATO DE USO COMPARTILHADO DE EMBARCAÇÃO");
  }

  return generateFallbackPdf(html, "DOCUMENTO EXCLUSIVE CLUB");
}

/**
 * Gera um PDF simples a partir de HTML bruto, extraindo o texto visível.
 * Usado como fallback para chamadas legadas de htmlToPdf().
 */
async function generateFallbackPdf(html: string, title: string): Promise<Buffer> {
  // Extrair texto do HTML removendo tags
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();

  return renderPdf([
    { type: "header" },
    { type: "title", content: title },
    { type: "divider" },
    { type: "paragraph", content: text.substring(0, 5000) },
    { type: "footer", content: "Exclusive Club — CNPJ: 50.680.592/0001-08  |  atendimento@exclusiveclubitz.com" },
  ]);
}
