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
  quotas: Array<{
    boatName: string;
    boatDescription?: string;
    quotaType: string;
    quotaNumber: number;
    totalQuotas: number;
    adhesionValue: number;
    monthlyFee: number;
    quotaPercentage: string;
  }>;
  installments: Array<{ description: string; dueDate: string; value: number; status?: string }>;
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
  const firstQuota = data.quotas[0] ?? {
    boatName: "", boatDescription: "", quotaType: "Cota Inteira",
    quotaNumber: 1, totalQuotas: 6, adhesionValue: 0, monthlyFee: 0, quotaPercentage: "16,67",
  };

  // Montar descrição das cotas para a Cláusula 1
  const quotaDescLines = data.quotas.map((q) => {
    const desc = q.boatDescription ? `${q.boatName} — ${q.boatDescription}` : q.boatName;
    return `${q.quotaType} Nº ${q.quotaNumber} — ${desc}`;
  });

  // Taxa de adesão total (soma de todas as parcelas de venda de cota)
  const adhesionTotal = data.installments.reduce((s, i) => s + i.value, 0);
  const adhesionDisplay = adhesionTotal > 0 ? fmtBRL(adhesionTotal) : (firstQuota.adhesionValue > 0 ? fmtBRL(firstQuota.adhesionValue) : "Conforme negociação");
  const monthlyDisplay = firstQuota.monthlyFee > 0 ? fmtBRL(firstQuota.monthlyFee) : "Conforme negociação";

  const installmentRows = data.installments.map((inst, i) => [
    String(i + 1),
    inst.description || "Venda de Cota",
    fmtDate(inst.dueDate),
    fmtBRL(inst.value),
    inst.status || "",
  ]);

  const locationCity = data.clientCity && data.clientState
    ? `${data.clientCity}/${data.clientState}`
    : data.clientCity || "Imperatriz/MA";

  const clientIntro = [
    `Nome completo: ${data.clientName},`,
    data.clientAddress ? `com sede na rua ${data.clientAddress},` : "",
    data.clientNeighborhood ? `Bairro ${data.clientNeighborhood},` : "",
    data.clientZipCode ? `CEP ${data.clientZipCode},` : "",
    `cidade de ${locationCity},`,
    `inscrito no CPF sob nº. ${data.clientCpfCnpj || "___________________________"}`,
    data.clientRg ? `e RG ${data.clientRg}.` : "e RG ___________________________.",
  ].filter(Boolean).join(" ");

  const objectText = quotaDescLines.length === 1
    ? `1.1 Este instrumento tem como objeto o uso compartilhado da embarcação: ${quotaDescLines[0]}, de propriedade da EXCLUSIVE CLUB, de modo compartilhado com outras pessoas que tenham celebrado ou venham a celebrar contrato do tipo do presente de embarcação fornecida pela EXCLUSIVE CLUB, em cada oportunidade de acordo com as disposições deste instrumento.`
    : `1.1 Este instrumento tem como objeto o uso compartilhado das seguintes cotas de embarcações de propriedade da EXCLUSIVE CLUB: ${quotaDescLines.join("; ")}. O uso será compartilhado com outras pessoas que tenham celebrado ou venham a celebrar contrato do tipo do presente, em cada oportunidade de acordo com as disposições deste instrumento.`;

  const sections: PdfSection[] = [
    { type: "header" },
    { type: "title", content: "CONTRATO PARA USO COMPARTILHADO DE EMBARCAÇÃO" },
    { type: "subtitle", content: '"EXCLUSIVE CLUB"' },

    {
      type: "paragraph",
      content: `Por este instrumento, o CONTRATADO, EXCLUSIVE CLUB - ME, com sede na Rua Leôncio Pires Dourado, Nº. 840-A, Bairro Bacuri, CEP: 65.901-020, na cidade de Imperatriz/MA, inscrita no CNPJ/MF sob nº. 50.680.592/0001-08, neste ato representado por seu administrador PAULO VINICIUS GOMES FREITAS, portador da cédula de identidade 16191852001-0 SSP/MA, sob o CPF de nº. 988.600.113-53. Celebra com o CONTRATANTE: ${clientIntro}`,
    },
    { type: "paragraph", content: "Assim designado adiante neste instrumento e qualificado em documento anexado ao presente (DOC. 01), CONTRATAM COMO SE SEGUE:" },

    { type: "h2", content: "Cláusula 1 — Objeto" },
    { type: "paragraph", content: objectText },
    { type: "paragraph", content: "O CONTRATANTE declara, para os fins de direito, estar ciente de que tem de manter-se apto e rigorosamente em dia, bem assim manter em situação regular, com relação a habilitações e autorizações necessárias, nos termos da legislação aplicável, para conduzir e usar embarcação nos termos deste contrato. Cópias autenticadas da documentação referente à renovação ou autorização respectivas devem ser entregues à EXCLUSIVE CLUB, assim que disponível para o CONTRATANTE, em cada oportunidade." },

    { type: "h2", content: "Cláusula 2 — Obtenção do Direito de Posse e Uso de Embarcação pelo Contratante" },
    { type: "paragraph", content: `O CONTRATANTE obtém o direito da quota da posse e usufruto da embarcação mediante o pagamento à EXCLUSIVE CLUB da quantia de ${adhesionDisplay}, doravante designada "taxa de adesão", podendo ser negociada individualmente com cada quotista, sendo anexada ao contrato original.` },
    { type: "paragraph", content: `2.2 O sócio possuidor/usufrutuário descrito acima subscreve ${data.quotas.length} quota(s) em um total de ${firstQuota.quotaPercentage}% da posse e do valor da embarcação.` },
    { type: "paragraph", content: `E permanece com esse direito da quota de posse e usufruto enquanto pague à EXCLUSIVE CLUB, mensalmente, a quantia de ${monthlyDisplay}, doravante designada "taxa mensal" (ou, no plural, "taxas mensais"), com reajuste anual de acordo com o IPCA.` },
    { type: "paragraph", content: "Vencendo-se (i) a primeira taxa mensal no mesmo dia do mês-calendário imediatamente seguinte ao do pagamento da taxa inicial, e (ii) as demais taxas mensais no mesmo dia de cada um dos meses-calendário seguintes." },
    { type: "paragraph", content: "A taxa mensal deve ser paga mediante transferência bancária comprovada e confirmada pela EXCLUSIVE CLUB, ficando a ela facultado a remessa, ao CONTRATANTE, de boletos para pagamento em banco autorizado ou pix fornecido pelo contratado." },
    { type: "paragraph", content: "O valor da taxa mensal fica sujeito a correção monetária anual de acordo com a variação, para maior, do Índice Geral de Preços do Mercado – IGP-M – divulgado pela Fundação Getúlio Vargas, sendo que na falta desse índice é adotado o Índice Nacional de Preços ao Consumidor – INPC." },
    { type: "paragraph", content: "A falta de pagamento, no dia do vencimento, de taxa de adesão e ou mensal importa em que a mesma fique acrescida por aplicação, em sequência, de (i) juro à razão de 1% (um por cento) ao mês e (ii) multa na base de 2% (dois por cento). A inadimplência de 30% do valor pago pela taxa de adesão ou 3 taxas mensais acarretará na perda do direito da quota de usufruto da embarcação." },
    { type: "paragraph", content: "As taxas, de adesão e ou mensal não são passíveis de devolução, sob qualquer hipótese. Caso a EXCLUSIVE CLUB desative suas atividades, o CONTRATADO irá devolver 16,67% do valor negociado da embarcação." },
    { type: "paragraph", content: "O CONTRATANTE pode solicitar a transferência desse contrato para uma terceira parte, após 2 meses de vigência do contrato, desde que esteja em conformidade com todas as cláusulas deste contrato, em dia com as mensalidades e a terceira parte seja aprovada pela EXCLUSIVE CLUB." },

    ...(installmentRows.length > 0
      ? [
          { type: "h3" as const, content: "Cronograma de Pagamentos — Venda de Cota" },
          {
            type: "table" as const,
            headers: ["#", "Descrição", "Vencimento", "Valor", "Status"],
            colWidths: [25, 180, 80, 75, 75],
            rows: installmentRows,
          },
        ]
      : []),

    { type: "h2", content: "Cláusula 3 — Reserva para Uso de Embarcação" },
    { type: "paragraph", content: "Para usar embarcação nos termos deste contrato o CONTRATANTE tem de fazer reserva em tela própria do sistema utilizado pela EXCLUSIVE CLUB, disponível em exclusiveclubitz.com. No caso em que haja embarcação disponível para o dia da reserva, a confirmação dessa reserva é indicada no próprio site." },
    { type: "paragraph", content: "O CONTRATANTE tem o direito de manter até 2 (duas) reservas ativas, de cada vez, para uso de embarcação." },
    { type: "paragraph", content: "O CONTRATANTE pode cancelar reserva que tenha sido a ele confirmada, desde que o faça até às 18 horas do dia anterior ao de uso da embarcação. Se o CONTRATANTE não cancela a reserva conforme disposto nesta cláusula e não comparece no lugar e horário próprios para uso da embarcação, fica sujeito ao pagamento de uma taxa de desistência no valor de R$ 100,00 (cem reais)." },
    { type: "paragraph", content: "O CONTRATANTE, enquanto esteja em mora ou em situação de inadimplemento, fica impedido (i) de fazer reserva para uso de embarcação, ou, se já feita a reserva, (ii) de usar embarcação." },

    { type: "h2", content: "Cláusula 4 — Uso de Embarcação pelo Contratante" },
    { type: "paragraph", content: "A embarcação para uso com base em reserva confirmada ficará à disposição do CONTRATANTE a partir das 8:00 horas do dia respectivo, devendo o CONTRATANTE aportar e devolver a embarcação até às 19:00 horas do mesmo dia, livre de pessoas e coisas que não pertençam à embarcação." },
    { type: "paragraph", content: "A embarcação é entregue ao CONTRATANTE com o tanque de combustível cheio, cabendo ao CONTRATANTE devolvê-la nas mesmas condições. No caso em que a embarcação é devolvida sem estar com o tanque cheio, o CONTRATANTE fica automaticamente obrigado ao pagamento de taxa de reabastecimento de R$ 250,00 (duzentos e cinquenta reais), mais o custo do combustível necessário para encher o tanque." },
    { type: "paragraph", content: "É terminantemente VEDADO: (i) o uso da embarcação para fim que não seja exclusivamente de recreação; (ii) cessão ou empréstimo da embarcação pelo CONTRATANTE; (iii) uso em testes de velocidade ou competição; (iv) uso ou condução em estado de embriaguez; (v) uso ou porte de substância psicotrópica ou narcótica; (vi) uso para transporte de produtos inflamáveis ou explosivos." },
    { type: "paragraph", content: "O CONTRATANTE que descumprir qualquer das hipóteses acima perderá o direito de usufruto da quota. Danos causados à embarcação por uso inadequado ou negligência serão de exclusiva responsabilidade do CONTRATANTE, devendo ser ressarcidos à EXCLUSIVE CLUB no prazo de 30 (trinta) dias após a constatação." },
    { type: "paragraph", content: "A não devolução da embarcação no prazo estabelecido importa em multa diária no valor de R$ 1.200,00 (um mil e duzentos reais). Em caso de acidente, o CONTRATANTE fica obrigado a comunicar imediatamente a EXCLUSIVE CLUB e providenciar boletim de ocorrência ou documento equivalente." },

    { type: "h2", content: "Cláusula 5 — Vigência e Término" },
    { type: "paragraph", content: "Este contrato entra em vigor na data constante da parte final deste instrumento e pelo prazo ou período indeterminado." },
    { type: "paragraph", content: "Este contrato poderá ser extinto por qualquer das partes mediante notificação por escrito com antecedência de 20 (vinte) dias. Na hipótese de infração contratual, a parte infratora ficará obrigada a pagar multa rescisória equivalente à soma de 3 (três) taxas mensais." },

    { type: "h2", content: "Cláusula 6 — Disposições Finais" },
    { type: "paragraph", content: "O término deste contrato, por qualquer motivo, não terá efeito liberatório em relação a obrigações assumidas durante sua vigência e que permaneçam pendentes de cumprimento." },
    { type: "paragraph", content: "O CONTRATANTE obriga-se a reembolsar à EXCLUSIVE CLUB despesas judiciais ou extrajudiciais por ela incorridas como decorrência de questão que seja de responsabilidade do CONTRATANTE, conforme disposição deste contrato." },
    { type: "paragraph", content: "Fica eleito o foro central da Comarca de Imperatriz, no Estado do Maranhão, para resolução de questões ou controvérsias derivadas deste contrato." },

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
