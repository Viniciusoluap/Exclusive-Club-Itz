/**
 * Notification Router — Notificação Extrajudicial de Débitos
 *
 * Gera um PDF de notificação extrajudicial formal listando todos os
 * débitos em aberto do cliente e envia por e-mail.
 */
import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { sendEmail } from "../_core/emailService";
import { htmlToPdf } from "../_core/htmlToPdf";

// ============================================================
// Helper: formatar moeda BRL
// ============================================================
function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// ============================================================
// Helper: formatar data DD/MM/AAAA
// ============================================================
function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return dateStr;
}

// ============================================================
// Helper: calcular dias de atraso
// ============================================================
function calcDaysOverdue(dueDateStr: string): number {
  const dueDate = new Date(dueDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - dueDate.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// ============================================================
// Helper: gerar HTML da notificação extrajudicial
// ============================================================
function generateNotificationHtml(data: {
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
}): string {
  const {
    clientName,
    clientCpfCnpj,
    clientEmail,
    debts,
    totalDebt,
    notificationDate,
    notificationNumber,
  } = data;

  const typeLabels: Record<string, string> = {
    monthly: "Mensalidade",
    quota_sale: "Venda de Cota",
    fuel: "Abastecimento",
    repair: "Reparo",
    inspection: "Vistoria",
    other: "Outros",
  };

  const debtRows = debts
    .map(
      (d, i) => `
    <tr style="background: ${i % 2 === 0 ? "#fff" : "#f9fafb"};">
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${i + 1}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${typeLabels[d.type] || d.type}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${d.description}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: center;">${fmtDate(d.dueDate)}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: center; color: #dc2626; font-weight: bold;">${d.daysOverdue > 0 ? `${d.daysOverdue} dias` : "Pendente"}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: right; font-weight: bold;">${fmtBRL(d.value)}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a1a; background: #fff; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 20mm 25mm 20mm; }
  h1 { font-size: 14pt; text-align: center; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  h2 { font-size: 11pt; text-transform: uppercase; margin: 18px 0 8px; border-bottom: 2px solid #dc2626; padding-bottom: 4px; color: #dc2626; }
  p { margin-bottom: 10px; line-height: 1.7; text-align: justify; }
  .header-box { text-align: center; margin-bottom: 28px; border-bottom: 3px solid #0a3d6b; padding-bottom: 16px; }
  .company { font-size: 16pt; font-weight: bold; color: #0a3d6b; letter-spacing: 2px; }
  .notification-badge { display: inline-block; background: #dc2626; color: #fff; padding: 4px 16px; border-radius: 4px; font-size: 9pt; font-weight: bold; letter-spacing: 1px; margin-top: 6px; }
  .info-box { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 14px 18px; margin-bottom: 18px; }
  .info-row { display: flex; gap: 16px; margin-bottom: 6px; flex-wrap: wrap; }
  .info-label { font-size: 9pt; color: #666; min-width: 120px; }
  .info-value { font-size: 10.5pt; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 10pt; }
  th { background: #0a3d6b; color: #fff; padding: 8px 12px; text-align: left; border: 1px solid #0a3d6b; font-size: 9.5pt; }
  .total-row td { background: #dc2626; color: #fff; font-weight: bold; font-size: 11pt; padding: 10px 12px; border: 1px solid #dc2626; }
  .footer-note { background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 12px 16px; margin: 18px 0; font-size: 10pt; }
  .legal-ref { font-size: 9.5pt; color: #555; font-style: italic; }
  .signature-section { margin-top: 40px; }
  .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 6px; text-align: center; font-size: 10pt; }
  .footer { position: fixed; bottom: 10mm; left: 20mm; right: 20mm; text-align: center; font-size: 8.5pt; color: #888; border-top: 1px solid #ccc; padding-top: 6px; }
</style>
</head>
<body>
<div class="page">

  <!-- CABEÇALHO -->
  <div class="header-box">
    <div class="company">EXCLUSIVE CLUB</div>
    <div style="font-size:9.5pt; color:#555; margin-top:4px;">
      Rua Leôncio Pires Dourado, Nº 840-A, Bairro Bacuri, CEP: 65.901-020 — Imperatriz/MA<br>
      CNPJ: 50.680.592/0001-08 &nbsp;|&nbsp; atendimento@exclusiveclubitz.com
    </div>
    <div class="notification-badge">NOTIFICAÇÃO EXTRAJUDICIAL</div>
  </div>

  <h1>Notificação Extrajudicial de Débitos</h1>
  <p style="text-align:center; color:#666; font-size:10pt; margin-bottom:20px;">
    Nº ${notificationNumber} &nbsp;|&nbsp; ${notificationDate}
  </p>

  <!-- DESTINATÁRIO -->
  <h2>Identificação do Notificado</h2>
  <div class="info-box">
    <div class="info-row">
      <span class="info-label">Nome/Razão Social:</span>
      <span class="info-value">${clientName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">CPF/CNPJ:</span>
      <span class="info-value">${clientCpfCnpj || "Não informado"}</span>
    </div>
    <div class="info-row">
      <span class="info-label">E-mail:</span>
      <span class="info-value">${clientEmail}</span>
    </div>
  </div>

  <!-- NOTIFICANTE -->
  <h2>Identificação do Notificante</h2>
  <div class="info-box">
    <div class="info-row">
      <span class="info-label">Razão Social:</span>
      <span class="info-value">P V G FREITAS — EXCLUSIVE CLUB</span>
    </div>
    <div class="info-row">
      <span class="info-label">CNPJ:</span>
      <span class="info-value">50.680.592/0001-08</span>
    </div>
    <div class="info-row">
      <span class="info-label">Representante:</span>
      <span class="info-value">Paulo Vinicius Gomes Freitas — CPF: 988.600.113-53</span>
    </div>
    <div class="info-row">
      <span class="info-label">Endereço:</span>
      <span class="info-value">Rua Leôncio Pires Dourado, Nº 840-A, Bairro Bacuri, CEP: 65.901-020 — Imperatriz/MA</span>
    </div>
  </div>

  <!-- OBJETO DA NOTIFICAÇÃO -->
  <h2>Objeto da Notificação</h2>
  <p>
    Vimos, por meio da presente notificação extrajudicial, comunicar a V. Sa. que, até a
    presente data de <strong>${notificationDate}</strong>, constam em aberto em nosso sistema
    financeiro os seguintes débitos referentes ao contrato de uso compartilhado de embarcação
    firmado com a <strong>EXCLUSIVE CLUB</strong>:
  </p>

  <!-- TABELA DE DÉBITOS -->
  <h2>Relação de Débitos em Aberto</h2>
  <table>
    <thead>
      <tr>
        <th style="width:30px;">#</th>
        <th style="width:100px;">Tipo</th>
        <th>Descrição</th>
        <th style="width:100px; text-align:center;">Vencimento</th>
        <th style="width:90px; text-align:center;">Atraso</th>
        <th style="width:100px; text-align:right;">Valor</th>
      </tr>
    </thead>
    <tbody>
      ${debtRows}
      <tr class="total-row">
        <td colspan="5" style="text-align:right;">TOTAL EM ABERTO:</td>
        <td style="text-align:right;">${fmtBRL(totalDebt)}</td>
      </tr>
    </tbody>
  </table>

  <!-- PRAZO E CONSEQUÊNCIAS -->
  <h2>Prazo para Regularização</h2>
  <p>
    Nos termos do <strong>Art. 397 do Código Civil Brasileiro</strong> (Lei nº 10.406/2002),
    o devedor que não cumpre a obrigação no prazo estipulado incorre em mora, tornando-se
    responsável pelo pagamento de juros, correção monetária e demais encargos previstos em
    contrato e na legislação vigente.
  </p>
  <p>
    Diante do exposto, notificamos V. Sa. para que, no prazo improrrogável de
    <strong>5 (cinco) dias úteis</strong> a contar do recebimento desta notificação,
    proceda à quitação integral dos débitos acima relacionados, totalizando
    <strong>${fmtBRL(totalDebt)}</strong>, mediante contato com nossa equipe pelo
    e-mail <strong>atendimento@exclusiveclubitz.com</strong> ou pelo sistema disponível
    em <strong>exclusiveclubitz.com</strong>.
  </p>

  <div class="footer-note">
    <strong>⚠️ Atenção:</strong> O não pagamento no prazo estabelecido implicará na
    <strong>suspensão imediata do direito de uso da embarcação</strong>, bem como na
    adoção das medidas legais cabíveis para recuperação do crédito, incluindo
    protesto extrajudicial e ação judicial de cobrança, com acréscimo de honorários
    advocatícios, juros de mora de 1% ao mês e multa contratual de 2% sobre o valor
    total em aberto, conforme previsto no contrato firmado entre as partes.
  </div>

  <p class="legal-ref">
    Fundamento legal: Art. 397 do Código Civil (mora); Art. 786 do CPC/2015 (notificação
    extrajudicial); Lei nº 9.492/1997 (protesto de títulos); Lei nº 8.078/1990 (CDC).
  </p>

  <!-- ASSINATURA -->
  <div class="signature-section">
    <p style="text-align:center; margin-bottom: 30px;">
      Imperatriz/MA, ${notificationDate}
    </p>
    <div style="text-align:center; max-width:300px; margin:0 auto;">
      <div style="border-top: 1px solid #333; margin-top: 60px; padding-top: 8px;">
        <strong>PAULO VINICIUS GOMES FREITAS</strong><br>
        <span style="font-size:9.5pt;">EXCLUSIVE CLUB<br>CNPJ: 50.680.592/0001-08</span>
      </div>
    </div>
  </div>

</div>

<div class="footer">
  Exclusive Club — Rua Leôncio Pires Dourado, Nº 840-A, Bairro Bacuri, CEP: 65.901-020, Imperatriz/MA
  &nbsp;|&nbsp; CNPJ: 50.680.592/0001-08 &nbsp;|&nbsp; atendimento@exclusiveclubitz.com
</div>

</body>
</html>`;
}

// ============================================================
// Router
// ============================================================
export const notificationRouter = router({
  /**
   * Busca os débitos em aberto de um cliente para pré-visualização
   */
  getClientDebts: adminProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [clientRows] = (await db.execute(
        sql.raw(`SELECT * FROM allowed_clients WHERE id = ${input.clientId} LIMIT 1`)
      )) as any;
      const client = Array.isArray(clientRows) ? clientRows[0] : clientRows;
      if (!client) throw new Error("Cliente não encontrado");

      const [debtRows] = (await db.execute(sql.raw(`
        SELECT id, type, description, value, due_date, status, amount_paid
        FROM bpo_charges
        WHERE client_id = ${input.clientId}
          AND status IN ('pending', 'overdue', 'partiallyPaid')
        ORDER BY due_date ASC
        LIMIT 100
      `))) as any;
      const debts = Array.isArray(debtRows) ? debtRows : [];

      const totalDebt = debts.reduce((sum: number, d: any) => {
        const val = parseFloat(d.value || "0");
        const paid = parseFloat(d.amount_paid || "0");
        return sum + Math.max(0, val - paid);
      }, 0);

      return {
        client: {
          id: client.id,
          name: client.name,
          email: client.email,
          cpfCnpj: client.cpf_cnpj || "",
        },
        debts: debts.map((d: any) => ({
          id: d.id,
          type: d.type,
          description: d.description || d.type,
          dueDate: d.due_date,
          value: Math.max(0, parseFloat(d.value || "0") - parseFloat(d.amount_paid || "0")),
          daysOverdue: calcDaysOverdue(d.due_date),
          status: d.status,
        })),
        totalDebt,
      };
    }),

  /**
   * Gera o PDF de notificação extrajudicial e envia por e-mail para o cliente
   */
  sendNotification: adminProcedure
    .input(
      z.object({
        clientId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Dados do cliente
      const [clientRows] = (await db.execute(
        sql.raw(`SELECT * FROM allowed_clients WHERE id = ${input.clientId} LIMIT 1`)
      )) as any;
      const client = Array.isArray(clientRows) ? clientRows[0] : clientRows;
      if (!client) throw new Error("Cliente não encontrado");
      if (!client.email) throw new Error("Cliente sem e-mail cadastrado");

      // 2. Buscar débitos em aberto
      const [debtRows] = (await db.execute(sql.raw(`
        SELECT id, type, description, value, due_date, status, amount_paid
        FROM bpo_charges
        WHERE client_id = ${input.clientId}
          AND status IN ('pending', 'overdue', 'partiallyPaid')
        ORDER BY due_date ASC
        LIMIT 100
      `))) as any;
      const rawDebts = Array.isArray(debtRows) ? debtRows : [];

      if (rawDebts.length === 0) {
        throw new Error("Este cliente não possui débitos em aberto.");
      }

      const debts = rawDebts.map((d: any) => ({
        description: d.description || d.type,
        dueDate: d.due_date,
        value: Math.max(0, parseFloat(d.value || "0") - parseFloat(d.amount_paid || "0")),
        daysOverdue: calcDaysOverdue(d.due_date),
        type: d.type,
      }));

      const totalDebt = debts.reduce((sum: number, d: any) => sum + d.value, 0);

      // 3. Data e número da notificação
      const now = new Date();
      const notificationDate = now.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const notificationNumber = `EC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${input.clientId}`;

      // 4. Gerar HTML
      const html = generateNotificationHtml({
        clientName: client.name,
        clientCpfCnpj: client.cpf_cnpj || "",
        clientEmail: client.email,
        debts,
        totalDebt,
        notificationDate,
        notificationNumber,
      });

      // 5. Gerar PDF via weasyprint (sem dependência de Chrome)
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await htmlToPdf(html);
      } catch (pdfErr: any) {
        throw new Error(`Erro ao gerar PDF: ${pdfErr.message}`);
      }

      // 6. Enviar por e-mail
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #222;">
          <div style="background: #0a3d6b; padding: 20px; text-align: center;">
            <h2 style="color: #fff; margin: 0;">EXCLUSIVE CLUB</h2>
          </div>
          <div style="background: #dc2626; padding: 10px; text-align: center;">
            <span style="color: #fff; font-weight: bold; font-size: 13px; letter-spacing: 1px;">NOTIFICAÇÃO EXTRAJUDICIAL — Nº ${notificationNumber}</span>
          </div>
          <div style="padding: 24px;">
            <p>Prezado(a) <strong>${client.name}</strong>,</p>
            <p>
              Encaminhamos em anexo a <strong>Notificação Extrajudicial de Débitos</strong>
              referente às obrigações financeiras em aberto junto à <strong>EXCLUSIVE CLUB</strong>.
            </p>
            <p>
              O valor total em aberto é de <strong style="color: #dc2626; font-size: 15px;">${fmtBRL(totalDebt)}</strong>,
              conforme detalhado no documento em anexo.
            </p>
            <p>
              Solicitamos a regularização dos débitos no prazo de <strong>5 (cinco) dias úteis</strong>
              a contar do recebimento desta notificação, por meio do nosso sistema em
              <a href="https://exclusiveclubitz.com" style="color: #0a3d6b;">exclusiveclubitz.com</a>
              ou pelo e-mail <a href="mailto:atendimento@exclusiveclubitz.com">atendimento@exclusiveclubitz.com</a>.
            </p>
            <p>
              O não pagamento no prazo implicará na suspensão do direito de uso da embarcação
              e na adoção das medidas legais cabíveis.
            </p>
            <p>Atenciosamente,</p>
            <p>
              <strong>Paulo Vinicius Gomes Freitas</strong><br>
              <strong>EXCLUSIVE CLUB</strong><br>
              <span style="color: #666; font-size: 13px;">atendimento@exclusiveclubitz.com &nbsp;|&nbsp; CNPJ: 50.680.592/0001-08</span>
            </p>
          </div>
          <div style="background: #f3f4f6; padding: 12px; text-align: center; font-size: 11px; color: #888;">
            Rua Leôncio Pires Dourado, Nº 840-A, Bairro Bacuri, CEP: 65.901-020 — Imperatriz/MA
          </div>
        </div>
      `;

      const sent = await sendEmail({
        to: client.email,
        subject: `Exclusive Club — Notificação Extrajudicial de Débitos — ${notificationNumber}`,
        html: emailHtml,
        attachments: [
          {
            filename: `Notificacao_Extrajudicial_${client.name.replace(/\s+/g, "_")}_${notificationNumber}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });

      if (!sent) {
        throw new Error("Falha ao enviar e-mail. Verifique as configurações SMTP.");
      }

      return {
        success: true,
        message: `Notificação extrajudicial enviada para ${client.email}`,
        sentTo: client.email,
        totalDebt,
        debtCount: debts.length,
        notificationNumber,
      };
    }),
});
