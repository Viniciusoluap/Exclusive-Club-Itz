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
// Conversão de números para extenso em PT-BR
// ============================================================

function intToWordsPT(n: number): string {
  const u = ['', 'UM', 'DOIS', 'TRÊS', 'QUATRO', 'CINCO', 'SEIS', 'SETE', 'OITO', 'NOVE'];
  const t = ['DEZ', 'ONZE', 'DOZE', 'TREZE', 'QUATORZE', 'QUINZE', 'DEZESSEIS', 'DEZESSETE', 'DEZOITO', 'DEZENOVE'];
  const d = ['', '', 'VINTE', 'TRINTA', 'QUARENTA', 'CINQUENTA', 'SESSENTA', 'SETENTA', 'OITENTA', 'NOVENTA'];
  const c = ['', 'CEM', 'DUZENTOS', 'TREZENTOS', 'QUATROCENTOS', 'QUINHENTOS', 'SEISCENTOS', 'SETECENTOS', 'OITOCENTOS', 'NOVECENTOS'];
  if (n === 0) return 'ZERO';
  if (n < 10) return u[n];
  if (n < 20) return t[n - 10];
  if (n < 100) { const r = n % 10; return r ? `${d[Math.floor(n / 10)]} E ${u[r]}` : d[Math.floor(n / 10)]; }
  if (n < 1000) {
    const h = Math.floor(n / 100); const r = n % 100;
    const hw = (h === 1 && r > 0) ? 'CENTO' : c[h];
    return r ? `${hw} E ${intToWordsPT(r)}` : hw;
  }
  if (n < 1000000) {
    const k = Math.floor(n / 1000); const r = n % 1000;
    const kw = k === 1 ? 'MIL' : `${intToWordsPT(k)} MIL`;
    return r ? `${kw} E ${intToWordsPT(r)}` : kw;
  }
  return String(n);
}

function numberToWordsPT(value: number): string {
  const i = Math.floor(value);
  const cents = Math.round((value - i) * 100);
  const iw = intToWordsPT(i);
  if (cents === 0) return `${iw} REAIS`;
  return `${iw} REAIS E ${intToWordsPT(cents)} CENTAVOS`;
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
          doc.fillColor("#1a1a1a").fontSize(13).font("Helvetica-Bold").text(section.content || "", 50, doc.y, { align: "center", width: pageW });
          doc.moveDown(0.4);
          break;
        }

        case "subtitle": {
          doc.fillColor(GRAY).fontSize(9.5).font("Helvetica").text(section.content || "", 50, doc.y, { align: "center", width: pageW });
          doc.moveDown(0.8);
          break;
        }

        case "h2": {
          doc.moveDown(0.5);
          doc.fillColor(RED).fontSize(10.5).font("Helvetica-Bold").text((section.content || "").toUpperCase(), 50, doc.y, { width: pageW });
          doc.moveTo(50, doc.y + 2).lineTo(50 + pageW, doc.y + 2).strokeColor(RED).lineWidth(1).stroke();
          doc.moveDown(0.6);
          break;
        }

        case "h3": {
          doc.moveDown(0.3);
          doc.fillColor(BLUE).fontSize(10).font("Helvetica-Bold").text((section.content || "").toUpperCase(), 50, doc.y, { width: pageW });
          doc.moveDown(0.4);
          break;
        }

        case "paragraph": {
          doc.fillColor("#1a1a1a").fontSize(10).font("Helvetica").text(section.content || "", 50, doc.y, { align: "justify", lineGap: 2, width: pageW });
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
          doc.x = doc.page.margins.left; // reset cursor após infoBox para evitar deslocamento de x
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
          doc.x = doc.page.margins.left;
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
          doc.x = doc.page.margins.left;
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
          doc.moveDown(0.5);

          if (section.content) {
            doc.fillColor("#1a1a1a").fontSize(10).font("Helvetica").text(section.content, { align: "center" });
            doc.moveDown(1);
          }

          const sigW = (pageW - 40) / Math.min(signers.length, 2);
          let sigX = 50;

          for (let i = 0; i < signers.length; i++) {
            if (i > 0 && i % 2 === 0) {
              doc.moveDown(2.5);
              sigX = 50;
            }
            const lineY = doc.y + 25;
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
          doc.moveDown(1);
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
    capacity?: number;
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
// Gerador de Contrato — Texto integral conforme modelo oficial
// ============================================================

export async function generateContractPdf(data: ContractData): Promise<Buffer> {
  const firstQuota = data.quotas[0] ?? {
    boatName: "", boatDescription: "", quotaType: "Cota Inteira",
    quotaNumber: 1, totalQuotas: 7, adhesionValue: 0, monthlyFee: 0, quotaPercentage: "14,29",
  };

  // ── Dados da embarcação ──────────────────────────────────────
  const boatDesc = firstQuota.boatName;

  // ── Cálculo da quantidade de cotas ──────────────────────────
  const quotaAmount = data.quotas.reduce(
    (s, q) => s + (q.quotaType === "Meia Cota" ? 0.5 : 1), 0
  );
  const quotaAmountDecimal = quotaAmount === 0.5 ? "0,5"
    : quotaAmount % 1 === 0 ? String(Math.round(quotaAmount))
    : quotaAmount.toFixed(1).replace(".", ",");
  const tipoCotas = quotaAmount === 0.5 ? "Meia cota (0,5 quota)"
    : quotaAmount === 1 ? "Cota Inteira (1 quota)"
    : `${quotaAmountDecimal} (${intToWordsPT(Math.round(quotaAmount)).toLowerCase()}) Cotas Inteiras`;

  // ── Reservas ativas (cláusula 3.4) — dinâmico por tipo de cota ──
  const maxReservas = Math.round(quotaAmount * 2);
  const maxReservasWords = intToWordsPT(maxReservas).toLowerCase();
  const maxReservasStr = maxReservas === 1
    ? `1 (${maxReservasWords}) reserva ativa, de cada vez,`
    : `${maxReservas} (${maxReservasWords}) reservas ativas, de cada vez,`;

  // ── Capacidade da embarcação (cláusula 4.4) ─────────────────
  const vesselCapacity = firstQuota.capacity ?? 8;
  const capacityWords = intToWordsPT(vesselCapacity).toLowerCase();
  const configStr = vesselCapacity <= 1
    ? `${vesselCapacity} pessoa`
    : `configuração "${vesselCapacity - 1}+1": ${vesselCapacity - 1} passageiro(s) + 1 piloto`;

  // ── Totais de cotas da embarcação ────────────────────────────
  const totalQuotasNum = firstQuota.totalQuotas;
  const totalQuotasWords = intToWordsPT(totalQuotasNum);
  const totalQuotasDisplay = totalQuotasNum < 10 ? `0${totalQuotasNum}` : String(totalQuotasNum);

  // ── Percentual de posse ──────────────────────────────────────
  const percentual = firstQuota.quotaPercentage; // ex: "7,15"

  // ── Valores financeiros ──────────────────────────────────────
  const adhesionTotal = data.installments.length > 0
    ? data.installments.reduce((s, i) => s + i.value, 0)
    : firstQuota.adhesionValue;
  const adhesionFmt = adhesionTotal > 0
    ? `${fmtBRL(adhesionTotal)} (${numberToWordsPT(adhesionTotal)})`
    : "a negociar";
  const monthlyFee = firstQuota.monthlyFee;
  const monthlyFmt = monthlyFee > 0
    ? `${fmtBRL(monthlyFee)} (${numberToWordsPT(monthlyFee)})`
    : "a negociar";

  // ── Texto das parcelas (cláusula 2.1.1) ─────────────────────
  const ordinals = ["1ª", "2ª", "3ª", "4ª", "5ª", "6ª", "7ª", "8ª", "9ª", "10ª", "11ª", "12ª"];
  const nWords = ["", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze"];
  let parcelasTexto = "";
  if (data.installments.length === 0) {
    parcelasTexto = "Parcelamento: a negociar.";
  } else if (data.installments.length === 1) {
    const v = data.installments[0].value;
    parcelasTexto = `Parcelamento: pagamento único de ${fmtBRL(v)} (${numberToWordsPT(v)}), no ato da assinatura deste instrumento.`;
  } else {
    const firstVal = data.installments[0].value;
    const allEqual = data.installments.every(i => Math.abs(i.value - firstVal) < 0.02);
    const n = data.installments.length;
    const nW = nWords[n] || String(n);
    if (allEqual) {
      parcelasTexto = `Parcelamento: ${n} (${nW}) parcelas iguais de ${fmtBRL(firstVal)} (${numberToWordsPT(firstVal)}) cada;\n` +
        data.installments.map((inst, i) => `${ordinals[i] || `${i + 1}ª`} parcela: vencimento ${fmtDate(inst.dueDate)}.`).join("\n");
    } else {
      parcelasTexto = `Parcelamento: ${n} (${nW}) parcelas conforme cronograma abaixo.`;
    }
  }

  // ── Endereço do contratante ──────────────────────────────────
  const addrParts: string[] = [];
  if (data.clientAddress) addrParts.push(data.clientAddress);
  if (data.clientNeighborhood) addrParts.push(`Bairro ${data.clientNeighborhood}`);
  if (data.clientZipCode) addrParts.push(`CEP: ${data.clientZipCode}`);
  if (data.clientCity && data.clientState) addrParts.push(`${data.clientCity}/${data.clientState}`);
  else if (data.clientCity) addrParts.push(data.clientCity);
  const clientAddressStr = addrParts.length > 0 ? addrParts.join(", ") : "_______________________________________________";

  // ── Tabela de instalments ────────────────────────────────────
  const installmentRows = data.installments.map((inst, i) => [
    String(i + 1),
    inst.description || "Venda de Cota",
    fmtDate(inst.dueDate),
    fmtBRL(inst.value),
    inst.status || "",
  ]);

  // ── Seções do PDF ────────────────────────────────────────────
  const sections: PdfSection[] = [
    { type: "header" },
    { type: "title", content: "CONTRATO PARA USO COMPARTILHADO DE EMBARCAÇÃO" },
    { type: "subtitle", content: '"EXCLUSIVE CLUB"' },

    // PARTES
    { type: "h2", content: "PARTES CONTRATANTES" },
    {
      type: "infoBox",
      fields: [
        { label: "CONTRATADO", value: "EXCLUSIVE CLUBE - ME" },
        { label: "Sede", value: "Rua Leôncio Pires Dourado, nº. 840, Letra B, Bairro Bacuri, CEP: 65.901-020, Imperatriz/MA" },
        { label: "CNPJ/MF", value: "50.680.592/0001-08" },
        { label: "Representante", value: "PAULO VINICIUS GOMES FREITAS — CPF: 988.600.113-53" },
      ],
    },
    {
      type: "infoBox",
      fields: [
        { label: "CONTRATANTE", value: data.clientName.toUpperCase() },
        { label: "Endereço", value: clientAddressStr },
        { label: "CPF", value: data.clientCpfCnpj || "___________________________" },
        { label: "RG", value: data.clientRg || "___________________________" },
      ],
    },

    // CLÁUSULA 1
    { type: "h2", content: "CLÁUSULA 1 — OBJETO DO CONTRATO" },
    { type: "paragraph", content: `1.1 O objeto do presente contrato é o uso compartilhado da seguinte embarcação: 1 (uma) ${boatDesc}, incluindo todos os itens de série e produtos adicionados posteriormente à embarcação.` },
    { type: "paragraph", content: `A modalidade contratada é de uso compartilhado com outras pessoas que tenham celebrado ou venham a celebrar contrato similar com a EXCLUSIVE CLUB, em cada oportunidade de acordo com as disposições do presente instrumento.` },
    { type: "paragraph", content: `O CONTRATANTE declara estar ciente de que tem de manter-se apto e rigorosamente em dia, bem assim manter em situação regular, com relação a habilitações e autorizações necessárias, nos termos da legislação aplicável, para conduzir e usar embarcação nos termos deste contrato. Cópias autênticas da documentação referente à renovação ou autorização respectivas devem ser entregues à EXCLUSIVE CLUB, assim que disponíveis para o CONTRATANTE, em cada oportunidade.` },

    // CLÁUSULA 2
    { type: "h2", content: "CLÁUSULA 2 — OBTENÇÃO DO DIREITO DE POSSE E USO DE EMBARCAÇÃO" },
    { type: "paragraph", content: "2.1 O CONTRATANTE obtém o direito da quota de posse e usufruto da embarcação mediante pagamento à EXCLUSIVE CLUB." },
    { type: "paragraph", content: `2.1.1 O valor total da aquisição é de ${adhesionFmt}, referente a ${tipoCotas}.\n${parcelasTexto}\nEsse valor é doravante designado "Taxa de adesão". Pode ser negociada individualmente com cada quotista e é anexada ao contrato original.` },
    { type: "paragraph", content: `2.2 A quota de posse e usufruto tem valor nominal de ${adhesionFmt}. O limite máximo é de ${totalQuotasDisplay} (${totalQuotasWords}) quotas para cada sócio usufrutuário. O preço é negociável ao preço de ocasião individualmente por cada quotista. O sócio possuidor/usufrutuário subscreve ${quotaAmountDecimal} quota(s) em um total de ${percentual}% da posse e do valor da embarcação.` },
    { type: "paragraph", content: `2.3 O CONTRATANTE permanece com o direito da quota de posse e usufruto enquanto pague mensalmente à EXCLUSIVE CLUB a quantia de ${monthlyFmt}, doravante designada "taxa mensal" (ou "taxas mensais", no plural), com reajuste anual de acordo com o IPCA.` },
    { type: "paragraph", content: `2.4 A 1ª taxa mensal vence no mesmo dia do mês-calendário imediatamente seguinte ao do pagamento da taxa inicial. As demais taxas mensais vencem no mesmo dia de cada um dos meses-calendário seguintes. Está sujeito às disposições das cláusulas 2.6 e 2.7.` },
    { type: "paragraph", content: `2.5 A taxa mensal deve ser paga no estabelecimento da EXCLUSIVE CLUB (endereço conforme qualificação acima), nas seguintes formas: presencialmente na EXCLUSIVE CLUB; transferência bancária comprovada e confirmada pela EXCLUSIVE CLUB; boletos bancários enviados pela EXCLUSIVE CLUB; PIX fornecido pelo contratado.` },
    { type: "paragraph", content: `2.6 O valor da taxa mensal fica sujeito a correção monetária anual de acordo com a variação, para maior, do Índice Geral de Preços do Mercado (IGP-M), divulgado pela Fundação Getúlio Vargas. Na falta desse índice, é adotado o Índice Nacional de Preços ao Consumidor (INPC), divulgado pela Fundação Instituto Brasileiro de Geografia e Estatística (IBGE). Em caso de falta de ambos, adota-se índice equivalente ou substituto.` },
    { type: "paragraph", content: `2.7 A falta de pagamento, no dia do vencimento, de taxa de adesão e/ou mensal, resulta em: (i) juro à razão de 1% (um por cento) ao mês e (ii) multa na base de 2% (dois por cento). O juro incide a partir do dia seguinte ao do vencimento até o dia do pagamento respectivo. A inadimplência de 30% do valor pago pela taxa de adesão OU 3 taxas mensais acarreta na perda do direito da quota de usufruto da embarcação.` },
    { type: "paragraph", content: `2.8 As taxas de adesão e/ou mensal não são passíveis de devolução, sob qualquer hipótese. Caso a EXCLUSIVE CLUB desative suas atividades, o CONTRATADO irá devolver ${percentual}% do valor negociado da embarcação.` },
    { type: "paragraph", content: `2.9 O CONTRATANTE pode solicitar a transferência desse contrato para uma terceira parte, desde que: mínimo de 2 (dois) meses de vigência do contrato; CONTRATANTE esteja em conformidade com todas as cláusulas do contrato; CONTRATANTE esteja em dia com as mensalidades; a terceira parte seja aprovada pelo EXCLUSIVE CLUB.` },

    // Tabela de parcelas (se houver)
    ...(installmentRows.length > 0
      ? [
          { type: "h3" as const, content: "Cronograma de Pagamentos — Venda de Cota" },
          {
            type: "table" as const,
            headers: ["#", "Descrição", "Vencimento", "Valor", "Status"],
            colWidths: [25, 185, 80, 80, 65],
            rows: installmentRows,
          },
        ]
      : []),

    // CLÁUSULA 3
    { type: "h2", content: "CLÁUSULA 3 — RESERVA PARA USO DE EMBARCAÇÃO" },
    { type: "paragraph", content: "3.1 Para usar a embarcação, o CONTRATANTE deve fazer reserva em tela própria do site: https://www.exclusiveclubitz.com (utilizado pela EXCLUSIVE CLUB)." },
    { type: "paragraph", content: "3.2 Se houver embarcação disponível para o dia da reserva, a confirmação é indicada no site. Se não houver embarcação disponível, a informação é disponibilizada no site para que o CONTRATANTE verifique a data mais próxima disponível." },
    { type: "paragraph", content: "3.3 Cada reserva confirmada pela EXCLUSIVE CLUB confere ao CONTRATANTE o direito de usar a embarcação exclusivamente no dia, nos horários e no local para embarque/partida constantes da reserva confirmada." },
    { type: "paragraph", content: `3.4 O CONTRATANTE tem o direito de manter até ${maxReservasStr} para uso de embarcação.` },
    { type: "paragraph", content: "3.5 O CONTRATANTE pode cancelar reserva confirmada desde que o faça até às 18 horas do dia anterior ao de uso da embarcação." },
    { type: "paragraph", content: "3.6 Se o CONTRATANTE não cancela a reserva conforme disposto e não comparece no lugar e horário próprios para uso da embarcação, fica sujeito ao pagamento de uma taxa de desistência no valor de R$ 100,00 (cem reais), cobrada juntamente com a taxa mensal com vencimento em um dos dois meses-calendário imediatamente seguintes." },
    { type: "paragraph", content: "3.7 À taxa de desistência aplicam-se as disposições das cláusulas 2.6 e 2.7." },
    { type: "paragraph", content: "3.8 O CONTRATANTE, enquanto esteja em mora ou inadimplemento com relação a prestação de qualquer tipo devida por força deste contrato, fica impedido de: (i) fazer reserva para uso de embarcação, ou (ii) usar embarcação (se já feita a reserva)." },

    // CLÁUSULA 4
    { type: "h2", content: "CLÁUSULA 4 — USO DE EMBARCAÇÃO PELO CONTRATANTE" },
    { type: "paragraph", content: "4.1 A embarcação fica à disposição do CONTRATANTE no local designado na confirmação da reserva a partir das 8:00 horas do dia respectivo. O CONTRATANTE deve aportar e devolver a embarcação no mesmo lugar até às 19:00 horas do mesmo dia, livre de pessoas e coisas que não pertençam à embarcação. Salvo acordo combinado entre as partes e conste da confirmação da reserva." },
    { type: "paragraph", content: "4.2 A EXCLUSIVE CLUB tem direito de não liberar a embarcação para uso do CONTRATANTE em caso de condições atmosféricas desfavoráveis, falta de condições adequadas de navegabilidade, outros motivos de força maior, ou dano ao motor por mal uso (prazo maior para conserto). Nesse caso, o CONTRATANTE fica com direito de fazer nova reserva para uso de embarcação, sendo atendido pela EXCLUSIVE CLUB conforme disponibilidade para novas datas futuras." },
    { type: "paragraph", content: "4.3 Para receber a embarcação, o CONTRATANTE deve apresentar-se de modo adequado e com identificação, chegando com antecedência de pelo menos 40 (quarenta) minutos em relação à hora de embarque conforme reserva confirmada." },
    { type: "paragraph", content: `4.4 É permitido o embarque e permanência de acompanhante(s) do CONTRATANTE, respeitando a lotação máxima de ${vesselCapacity} (${capacityWords}) pessoas, conforme indicado pelo fabricante (${configStr}). O CONTRATANTE fica responsável, de modo pessoal e irrestrito, por: (i) mal uso da embarcação ou danos causados à mesma ou ao local de embarque; (ii) comportamento impróprio; (iii) infração de qualquer ordem cometida por acompanhante(s), inclusive profissional(is) habilitado(s).` },
    { type: "paragraph", content: "4.5 Cabe ao EXCLUSIVE CLUB manter um barqueiro no local e horário de embarque para colocar a embarcação na água, se necessário, e entregá-la em condições de uso para o CONTRATANTE." },
    { type: "paragraph", content: "4.6 A embarcação é entregue com o tanque de combustível completamente abastecido. Após o uso e devolução, a CONTRATADA providencia o reabastecimento completo do tanque. O custo do reabastecimento é repassado integralmente ao CONTRATANTE. Prazo de pagamento: até 1 (um) dia útil contado da data de devolução. Penalidade por atraso: juros moratórios de 1% (um por cento) ao mês e multa de 2% (dois por cento). Formas de pagamento: transferência bancária, PIX ou boleto emitido pela EXCLUSIVE CLUB." },
    { type: "paragraph", content: "4.7 Ao receber a embarcação, o CONTRATANTE recebe também uma relação digital disponibilizada no site indicativa de certificados, manuais e outros documentos, além de equipamentos, aparelhos, acessórios e utensílios existentes na embarcação. O CONTRATANTE faz a conferência respectiva, anota ressalvas cabíveis no verso da relação e devolve a relação assinada ao representante ou preposto da EXCLUSIVE CLUB. Itens não ressalvados têm sua existência e estado satisfatório de uso confirmados pelo CONTRATANTE. O CONTRATANTE inspeciona a embarcação na água antes da partida. Na falta de ressalva anotada na relação, entende-se que o CONTRATANTE está recebendo a embarcação em condições satisfatórias, ressalvados os defeitos só perceptíveis no curso da jornada." },
    { type: "paragraph", content: "4.8 É permitida a (co)pilotagem da embarcação por profissional habilitado contratado pelo CONTRATANTE por sua conta e risco, devendo o CONTRATANTE estar presente na embarcação. Alternativamente, a EXCLUSIVE CLUB pode disponibilizar profissional para pilotagem, conforme combinado por escrito e previamente entre as partes, incluindo custo respectivo. Independentemente de o profissional haver sido ou não indicado pela EXCLUSIVE CLUB, o CONTRATANTE é responsável pessoal por danos, avarias, acidentes ou incidentes que haja enquanto a embarcação esteja ou devesse estar na sua posse." },
    { type: "paragraph", content: "4.9 O CONTRATANTE obriga-se a usar a embarcação com estrita observância de: (i) instruções recebidas do EXCLUSIVE CLUB; (ii) especificações do fabricante constantes em manuais e publicações que acompanham as embarcações; (iii) disposições deste contrato; (iv) prescrições normativas de qualquer nível aplicáveis." },
    { type: "paragraph", content: "4.10 A EXCLUSIVE CLUB não responde pela presença, perda, subtração, desaparecimento ou dano qualquer em relação a valores, pertences, aparelhos e outros bens ou objetos levados para a embarcação pelo CONTRATANTE ou acompanhante." },
    { type: "paragraph", content: "4.11 É terminantemente VEDADO:\n(i) uso da embarcação fora do território municipal (Imperatriz/MA) ou em condições que não apresentem tráfego e manobra bons ou normais no momento da partida;\n(ii) uso da embarcação para fim que não seja exclusivamente de recreação, sendo proibida a condução para fim comercial, exploração econômica, ou condução de passageiros e/ou carga com propósito comercial;\n(iii) cessão ou empréstimo da embarcação pelo CONTRATANTE ou terceiro;\n(iv) uso em testes de velocidade ou em competição de qualquer espécie;\n(v) uso ou condução em terra;\n(vi) uso para empurrar, puxar ou rebocar outro veículo;\n(vii) uso para transporte de produtos inflamáveis ou explosivos;\n(viii) pilotagem ou condução da embarcação em estado de embriaguez;\n(ix) uso ou porte, no lugar de embarque e/ou na embarcação, de substância psicotrópica, narcótica ou similar, assim como outra substância ou bem de uso, porte ou posse proibidos;\n(x) uso da embarcação para fim ou de modo ilícito (legislação civil ou penal) ou incompatível com mera recreação, assim como em condições extremas ou de modo imprudente.\nO CONTRATANTE perde o direito de usufruto da quota constante na 2ª cláusula em caso de descumprimento de qualquer das vedações acima." },
    { type: "paragraph", content: "4.12 O CONTRATANTE deve devolver a embarcação: (i) no local, no dia e dentro do horário definidos na reserva respectiva; (ii) nas mesmas condições em que a recebeu, inclusive quanto a equipamentos, aparelhos, acessórios e documentação. O CONTRATANTE fica inteiramente responsável por danos, perdas, avarias ou prejuízos causados à embarcação enquanto na sua posse e atribuíveis a ele." },
    { type: "paragraph", content: "4.13 O CONTRATANTE é responsável por: (i) danos, avarias e/ou prejuízos causados a terceiros quaisquer, puníveis ou indenizáveis nos termos da legislação aplicável, por motivo ou efeito da posse ou condução da embarcação enquanto esteja na sua posse; (ii) multas ou outras penas pecuniárias exigidas e aplicadas à embarcação, ao seu condutor, à sua proprietária ou a quem mais seja o caso enquanto a embarcação esteja ou devesse estar na sua posse." },
    { type: "paragraph", content: "4.14 Em caso de pagamento de multa ou pena pecuniária pelo CONTRATANTE, ele fica obrigado a enviar ao EXCLUSIVE CLUB os comprovantes respectivos (original ou cópia autenticada) dentro do prazo de 5 (cinco) dias úteis seguintes ao do pagamento." },
    { type: "paragraph", content: "4.15 Se a EXCLUSIVE CLUB pagar multa ou pena pecuniária em nome do CONTRATANTE, ele fica obrigado a reembolsar no prazo de 5 (cinco) dias úteis seguintes ao recebimento da comunicação. Aplicam-se as disposições das cláusulas 2.6 e 2.7. A EXCLUSIVE CLUB pode cobrar com emissão de boleto ou incluir o valor nas primeiras taxas mensais subsequentes." },
    { type: "paragraph", content: "4.16 O CONTRATANTE fica obrigado a: (a) comunicar imediatamente à EXCLUSIVE CLUB qualquer acidente; (b) proceder conforme necessário face à ocorrência respectiva. Especificamente: (i) coletar dados pertinentes sobre outra(s) embarcação(ões), condutor, bilhete de seguro, vítimas e testemunhas; (ii) providenciar boletim de ocorrência ou documento equivalente junto a quem de direito; (iii) providenciar a condução da embarcação para local apropriado, arcando com despesas imediatas decorrentes; (iv) remeter ou entregar ao EXCLUSIVE CLUB, no prazo de até 3 (três) dias úteis, os elementos citados em \"i\" e \"ii\"." },
    { type: "paragraph", content: "4.17 Nas hipóteses de incêndio, furto, roubo ou outras ocorrências do gênero em relação à embarcação em uso, o CONTRATANTE fica obrigado a: providenciar imediato boletim de ocorrência ou documento equivalente junto à autoridade policial; dar ciência imediata ao EXCLUSIVE CLUB; fornecer a documentação respectiva assim que possível, com identificação bastante daquela autoridade." },
    { type: "paragraph", content: "4.18 É assegurado ao EXCLUSIVE CLUB o direito de vistoriar, por meio de representante credenciado, sem aviso prévio e em qualquer local, embarcação que esteja em uso ou tenha sido entregue para uso do CONTRATANTE." },
    { type: "paragraph", content: "4.19 É reconhecido o direito de EXCLUSIVE CLUB de retomar a embarcação a qualquer momento ou em qualquer local e conduzi-la a local de sua escolha se constatado que a embarcação está: (i) abandonada; (ii) em local proibido; (iii) sendo utilizada em situação de infringência a cláusula deste contrato." },
    { type: "paragraph", content: "4.20 A falta de entrega ou devolução da embarcação pelo CONTRATANTE conforme disposto, assim como a ocorrência descrita na cláusula 4.19 (ii), importa em que o CONTRATANTE fique obrigado ao pagamento de multa diária no valor de R$ 1.200,00 (um mil e duzentos reais). Aplicável a essa multa o disposto nas cláusulas 2.6 e 2.7." },
    { type: "paragraph", content: "4.21 A não devolução da embarcação conforme devido autoriza a EXCLUSIVE CLUB a lançar mão de todos os meios cabíveis para reaver a embarcação, inclusive por via de busca e apreensão ou procedimento de restituição e, se for o caso, formulação de notitia criminis." },
    { type: "paragraph", content: "4.22 Na hipótese prevista na cláusula 4.21, o CONTRATANTE responde por todas as despesas consequentes incorridas pelo EXCLUSIVE CLUB, sejam judiciais ou extrajudiciais, tais como: busca, apreensão, reintegração e depósito da embarcação; transporte para local(is) devido(s); seguro de transporte; guarda ou permanência em local que não seja o de guarda normal da embarcação." },

    // CLÁUSULA 5
    { type: "h2", content: "CLÁUSULA 5 — VIGÊNCIA E TÉRMINO DO CONTRATO" },
    { type: "paragraph", content: "5.1 Este contrato entra em vigor na data constante da parte final deste instrumento e pelo prazo indeterminado contado da mesma data." },
    { type: "paragraph", content: "5.2 Este contrato poderá ser extinto por qualquer das partes (\"parte prejudicada\") antes do encerramento do prazo, na hipótese de a outra parte (\"parte infratora\") infringir cláusula deste contrato, desde que a parte prejudicada notifique por escrito a parte infratora com antecedência de 20 (vinte) dias em relação à data que deverá constar como sendo a do término do contrato, por rescisão, resolução ou distrato." },
    { type: "paragraph", content: "5.3 Na hipótese de extinção por infração, a parte infratora ficará obrigada a pagar à parte prejudicada uma multa rescisória em valor equivalente ao da soma das três (3) taxas mensais devidas nos três meses-calendário imediatamente anteriores ao mês de expedição da notificação. Devida sem prejuízo de outras prestações pecuniárias exigíveis. Se devida pelo EXCLUSIVE CLUB, pode ser paga por compensação com valores devidos pelo CONTRATANTE com vinculação a este contrato." },

    // CLÁUSULA 6
    { type: "h2", content: "CLÁUSULA 6 — DISPOSIÇÕES FINAIS" },
    { type: "paragraph", content: "6.1 O término deste contrato, por qualquer motivo, não terá efeito liberatório em relação a obrigações assumidas que permanecerem pendentes de cumprimento na data do término contratual." },
    { type: "paragraph", content: "6.2 Perderá efeito a reserva para uso de embarcação que se referir a uso pelo CONTRATANTE: (i) em data que coincidir com a da notificação mencionada na cláusula 5.2, ou (ii) em data posterior à da notificação." },
    { type: "paragraph", content: "6.3 O CONTRATANTE não tem direito a reembolso, restituição ou indenização referente a despesas de qualquer natureza que não tenham sido autorizadas prévia e expressamente pelo EXCLUSIVE CLUB. A responsabilidade pelo pagamento ou quitação é exclusivamente do CONTRATANTE, salvo nas hipóteses de tais despesas: (i) sejam ou tenham sido inequivocamente urgentes e necessárias à segurança, e (ii) não decorram de infração do CONTRATANTE ou acompanhante." },
    { type: "paragraph", content: "6.4 Cabe ao CONTRATANTE comunicar assim que possível ao EXCLUSIVE CLUB com respeito à necessidade de reparos na embarcação para prevenção de defeitos, quebras e acidentes." },
    { type: "paragraph", content: "6.5 Sem prejuízo das prestações pecuniárias previstas em cláusulas anteriores, a parte que causar danos ou prejuízo à outra por infringência de cláusula(s) deste contrato ficará obrigada a repará-lo nos termos da lei civil, inclusive com respeito a lucros cessantes." },
    { type: "paragraph", content: "6.6 A EXCLUSIVE CLUB não responde nem tem que responder por: (i) danos materiais ou de qualquer outro tipo causados pelo CONTRATANTE e/ou acompanhante, sejam entre eles ou causados a terceiro(s); (ii) danos materiais ou de qualquer outro tipo causados por terceiro(s) ao CONTRATANTE e/ou acompanhante; (iii) valores e outros bens quaisquer levados para a embarcação pelo CONTRATANTE e/ou acompanhante a qualquer título; (iv) danos de qualquer natureza em veículo deixado pelo CONTRATANTE ou acompanhante para ingresso em embarcação, enquanto estejam embarcados ou depois do desembarque." },
    { type: "paragraph", content: "6.7 O CONTRATANTE fica obrigado a reembolsar ao EXCLUSIVE CLUB despesas judiciais ou extrajudiciais por ele incorridas, bem como honorários que venha a pagar como decorrência de ser o EXCLUSIVE CLUB chamado para responder pelo que quer que seja em relação a matéria, questão ou evento que seja de responsabilidade do CONTRATANTE ou acompanhante." },
    { type: "paragraph", content: "6.8 Fica eleito o foro central da Comarca de Imperatriz, no Estado do Maranhão, para dedução em Juízo de questão ou controvérsia derivada deste contrato." },

    // ASSINATURAS
    {
      type: "signatureBlock",
      content: `Imperatriz/MA, ${data.contractDate}`,
      signers: [
        {
          name: data.clientName.toUpperCase(),
          role: "CONTRATANTE",
          extra: `CPF/MF: ${data.clientCpfCnpj || "___________________________"}`,
        },
        {
          name: "PAULO VINICIUS GOMES FREITAS",
          role: "EXCLUSIVE CLUBE — CONTRATADA",
          extra: "CNPJ/MF: 50.680.592/0001-08",
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
