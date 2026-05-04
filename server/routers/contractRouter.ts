/**
 * Contract Router — Geração e envio de contratos PDF dinâmicos
 *
 * Gera o contrato de uso compartilhado de embarcação preenchido
 * com os dados do cliente, embarcação, cota e condições financeiras
 * e envia por e-mail para o cliente.
 */
import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { sendEmail } from "../_core/emailService";

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
  if (!dateStr) return "___/___/______";
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return dateStr;
}

// ============================================================
// Helper: gerar HTML do contrato
// ============================================================
function generateContractHtml(data: {
  clientName: string;
  clientCpfCnpj: string;
  clientPhone: string;
  clientEmail: string;
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
}): string {
  const {
    clientName,
    clientCpfCnpj,
    clientPhone,
    clientEmail,
    boatName,
    boatDescription,
    quotaType,
    quotaNumber,
    quotaPercentage,
    totalQuotas,
    adhesionValue,
    monthlyFee,
    installments,
    contractDate,
  } = data;

  const installmentsRows = installments
    .slice(0, 20)
    .map(
      (inst, i) => `
      <tr>
        <td style="padding: 4px 8px; border: 1px solid #ddd; text-align: center;">${i + 1}</td>
        <td style="padding: 4px 8px; border: 1px solid #ddd;">${inst.description}</td>
        <td style="padding: 4px 8px; border: 1px solid #ddd; text-align: center;">${fmtDate(inst.dueDate)}</td>
        <td style="padding: 4px 8px; border: 1px solid #ddd; text-align: right;">${fmtBRL(inst.value)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #222; background: #fff; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 20mm 25mm 20mm; }
  h1 { font-size: 13pt; text-align: center; text-transform: uppercase; margin-bottom: 4px; }
  h2 { font-size: 11pt; text-transform: uppercase; margin: 18px 0 8px; border-bottom: 1px solid #333; padding-bottom: 3px; }
  h3 { font-size: 10.5pt; text-transform: uppercase; margin: 14px 0 6px; }
  p { margin-bottom: 8px; line-height: 1.6; text-align: justify; }
  .subtitle { text-align: center; font-size: 10pt; color: #555; margin-bottom: 20px; }
  .header-box { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #0a3d6b; padding-bottom: 14px; }
  .header-box .company { font-size: 15pt; font-weight: bold; color: #0a3d6b; letter-spacing: 1px; }
  .section-box { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 12px 16px; margin-bottom: 16px; }
  .field-row { display: flex; gap: 20px; margin-bottom: 6px; flex-wrap: wrap; }
  .field { flex: 1; min-width: 180px; }
  .field label { font-size: 9pt; color: #666; display: block; margin-bottom: 2px; }
  .field span { font-size: 10.5pt; font-weight: bold; border-bottom: 1px solid #999; display: block; min-height: 20px; padding-bottom: 2px; }
  .clause-num { font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
  th { background: #0a3d6b; color: #fff; padding: 6px 8px; text-align: left; border: 1px solid #0a3d6b; }
  td { padding: 4px 8px; border: 1px solid #ddd; }
  .signature-section { margin-top: 40px; }
  .sig-block { display: inline-block; width: 45%; vertical-align: top; margin: 0 2%; }
  .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 6px; text-align: center; font-size: 10pt; }
  .footer { position: fixed; bottom: 10mm; left: 20mm; right: 20mm; text-align: center; font-size: 8.5pt; color: #888; border-top: 1px solid #ccc; padding-top: 6px; }
  .page-break { page-break-before: always; }
  @media print { .page { padding: 15mm; } }
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
  </div>

  <h1>Contrato para Uso Compartilhado de Embarcação</h1>
  <p class="subtitle">"EXCLUSIVE CLUB"</p>

  <!-- QUALIFICAÇÃO DAS PARTES -->
  <h2>Qualificação das Partes</h2>

  <h3>CONTRATADO</h3>
  <div class="section-box">
    <div class="field-row">
      <div class="field"><label>Razão Social</label><span>EXCLUSIVE CLUB — P V G FREITAS</span></div>
      <div class="field"><label>CNPJ/MF</label><span>50.680.592/0001-08</span></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Endereço</label><span>Rua Leôncio Pires Dourado, Nº 840-A, Bairro Bacuri, CEP: 65.901-020 — Imperatriz/MA</span></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Representante Legal</label><span>PAULO VINICIUS GOMES FREITAS</span></div>
      <div class="field"><label>CPF</label><span>988.600.113-53</span></div>
      <div class="field"><label>RG</label><span>16191852001-0 SSP/MA</span></div>
    </div>
  </div>

  <h3>CONTRATANTE</h3>
  <div class="section-box">
    <div class="field-row">
      <div class="field"><label>Nome Completo</label><span>${clientName}</span></div>
      <div class="field"><label>CPF/CNPJ</label><span>${clientCpfCnpj || "___________________________"}</span></div>
    </div>
    <div class="field-row">
      <div class="field"><label>RG</label><span>___________________________</span></div>
      <div class="field"><label>Telefone</label><span>${clientPhone || "___________________________"}</span></div>
      <div class="field"><label>E-mail</label><span>${clientEmail}</span></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Endereço</label><span>_______________________________________________</span></div>
      <div class="field"><label>Bairro</label><span>___________________________</span></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Número</label><span>__________</span></div>
      <div class="field"><label>CEP</label><span>___________________________</span></div>
      <div class="field"><label>Cidade/UF</label><span>Imperatriz/MA</span></div>
    </div>
  </div>

  <!-- OBJETO DO CONTRATO -->
  <h2>Cláusula 1ª — Objeto</h2>
  <p>
    O presente contrato tem por objeto a cessão do direito de uso compartilhado da embarcação
    denominada <strong>${boatName}</strong>${boatDescription ? ` (${boatDescription})` : ""},
    de propriedade da EXCLUSIVE CLUB, na modalidade <strong>${quotaType}</strong>,
    correspondente à <strong>Cota Nº ${quotaNumber}</strong>, equivalente a
    <strong>${quotaPercentage}%</strong> do total de ${totalQuotas} cotas da referida embarcação.
  </p>
  <p>
    A embarcação será utilizada de forma compartilhada entre os cotistas, conforme calendário
    de reservas gerenciado pela CONTRATADA por meio do sistema digital Exclusive Club
    (exclusiveclubitz.com), respeitando as regras de uso estabelecidas neste instrumento.
  </p>

  <!-- CONDIÇÕES FINANCEIRAS -->
  <h2>Cláusula 2ª — Obtenção do Direito de Posse e Uso</h2>
  <p>
    Pela aquisição do direito de uso da cota descrita na Cláusula 1ª, o CONTRATANTE pagará
    à CONTRATADA os seguintes valores:
  </p>
  <div class="section-box">
    <div class="field-row">
      <div class="field">
        <label>Taxa de Adesão (valor único)</label>
        <span>${adhesionValue > 0 ? fmtBRL(adhesionValue) : "Conforme negociação"}</span>
      </div>
      <div class="field">
        <label>Taxa Mensal de Manutenção</label>
        <span>${monthlyFee > 0 ? fmtBRL(monthlyFee) + " / mês" : "Conforme negociação"}</span>
      </div>
    </div>
  </div>

  ${
    installments.length > 0
      ? `
  <h3>Cronograma de Pagamentos</h3>
  <table>
    <thead>
      <tr>
        <th style="width:40px; text-align:center;">#</th>
        <th>Descrição</th>
        <th style="width:110px; text-align:center;">Vencimento</th>
        <th style="width:100px; text-align:right;">Valor</th>
      </tr>
    </thead>
    <tbody>
      ${installmentsRows}
    </tbody>
  </table>
  `
      : ""
  }

  <div class="page-break"></div>

  <!-- RESERVA PARA USO -->
  <div class="header-box" style="margin-top:0;">
    <div class="company">EXCLUSIVE CLUB</div>
  </div>

  <h2>Cláusula 3ª — Reserva para Uso de Embarcação</h2>
  <p>
    3.1. O CONTRATANTE deverá realizar as reservas de uso da embarcação exclusivamente
    por meio do sistema digital disponível em <strong>exclusiveclubitz.com</strong>,
    com antecedência mínima de 24 (vinte e quatro) horas.
  </p>
  <p>
    3.2. As reservas estão sujeitas à disponibilidade da embarcação, sendo vedada a
    sobreposição de horários entre cotistas.
  </p>
  <p>
    3.3. O cancelamento de reserva deverá ser realizado com antecedência mínima de
    12 (doze) horas, sob pena de desconto de 1 (uma) hora de uso do saldo disponível.
  </p>
  <p>
    3.4. Cada cotista terá direito ao uso proporcional à sua cota, conforme calendário
    estabelecido pela CONTRATADA, podendo ser ajustado mediante acordo entre as partes.
  </p>

  <h2>Cláusula 4ª — Uso da Embarcação pelo Contratante</h2>
  <p>
    4.1. O CONTRATANTE se compromete a utilizar a embarcação de forma responsável,
    respeitando as normas de segurança náutica estabelecidas pela Marinha do Brasil
    e pela legislação vigente.
  </p>
  <p>
    4.2. É vedado ao CONTRATANTE: (a) ceder ou sublocar seu direito de uso a terceiros
    sem autorização expressa da CONTRATADA; (b) utilizar a embarcação para fins
    comerciais; (c) realizar modificações na embarcação sem autorização prévia.
  </p>
  <p>
    4.3. Danos causados à embarcação por uso inadequado ou negligência do CONTRATANTE
    serão de sua exclusiva responsabilidade, devendo ser ressarcidos à CONTRATADA
    no prazo de 30 (trinta) dias após a constatação.
  </p>
  <p>
    4.4. O CONTRATANTE deverá apresentar habilitação náutica válida sempre que
    conduzir a embarcação, conforme exigência da Autoridade Marítima Brasileira.
  </p>
  <p>
    4.5. O abastecimento de combustível será custeado pelo CONTRATANTE de forma
    proporcional ao uso, conforme registros do sistema digital da CONTRATADA.
  </p>

  <h2>Cláusula 5ª — Vigência e Término</h2>
  <p>
    5.1. O presente contrato é celebrado por prazo indeterminado, podendo ser rescindido
    por qualquer das partes mediante notificação escrita com antecedência mínima de
    30 (trinta) dias.
  </p>
  <p>
    5.2. A rescisão antecipada pelo CONTRATANTE não implicará devolução da taxa de
    adesão já paga, salvo acordo expresso entre as partes.
  </p>
  <p>
    5.3. Em caso de inadimplência superior a 60 (sessenta) dias, a CONTRATADA poderá
    suspender o direito de uso do CONTRATANTE até a regularização dos débitos,
    sem prejuízo das demais medidas legais cabíveis.
  </p>

  <h2>Cláusula 6ª — Disposições Finais</h2>
  <p>
    6.1. O presente contrato é regido pelas disposições do Código Civil Brasileiro
    (Lei nº 10.406/2002) e pela legislação náutica aplicável.
  </p>
  <p>
    6.2. As partes elegem o foro da Comarca de Imperatriz/MA para dirimir quaisquer
    controvérsias oriundas deste instrumento, com renúncia expressa a qualquer outro,
    por mais privilegiado que seja.
  </p>
  <p>
    6.3. Este instrumento é celebrado em 2 (duas) vias de igual teor e forma,
    na presença de 2 (duas) testemunhas.
  </p>

  <!-- ASSINATURAS -->
  <div class="signature-section">
    <p style="text-align:center; margin-bottom: 30px;">
      Imperatriz/MA, ${contractDate}
    </p>
    <div style="display:flex; justify-content:space-between; gap:40px;">
      <div style="flex:1; text-align:center;">
        <div style="border-top: 1px solid #333; margin-top: 60px; padding-top: 8px;">
          <strong>${clientName}</strong><br>
          <span style="font-size:9.5pt;">CONTRATANTE<br>CPF/CNPJ: ${clientCpfCnpj || "___________________________"}</span>
        </div>
      </div>
      <div style="flex:1; text-align:center;">
        <div style="border-top: 1px solid #333; margin-top: 60px; padding-top: 8px;">
          <strong>PAULO VINICIUS GOMES FREITAS</strong><br>
          <span style="font-size:9.5pt;">EXCLUSIVE CLUB — CONTRATADA<br>CNPJ: 50.680.592/0001-08</span>
        </div>
      </div>
    </div>

    <div style="display:flex; justify-content:space-between; gap:40px; margin-top:40px;">
      <div style="flex:1; text-align:center;">
        <div style="border-top: 1px solid #333; margin-top: 60px; padding-top: 8px;">
          <span style="font-size:9.5pt;">Testemunha 1<br>Nome: ___________________________<br>CPF: ___________________________</span>
        </div>
      </div>
      <div style="flex:1; text-align:center;">
        <div style="border-top: 1px solid #333; margin-top: 60px; padding-top: 8px;">
          <span style="font-size:9.5pt;">Testemunha 2<br>Nome: ___________________________<br>CPF: ___________________________</span>
        </div>
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
export const contractRouter = router({
  /**
   * Busca os dados necessários para pré-visualizar o contrato de um cliente
   */
  getContractData: adminProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Dados do cliente
      const [clientRows] = (await db.execute(
        sql.raw(`SELECT * FROM allowed_clients WHERE id = ${input.clientId} LIMIT 1`)
      )) as any;
      const client = Array.isArray(clientRows) ? clientRows[0] : clientRows;
      if (!client) throw new Error("Cliente não encontrado");

      // 2. Cotas e embarcações do cliente
      const [quotaRows] = (await db.execute(sql.raw(`
        SELECT cq.id, cq.quota_type, cq.quota_number, cq.vessel_id,
               v.name as vessel_name, v.description as vessel_description,
               v.quota_count as total_quotas
        FROM client_quotas cq
        JOIN vessels v ON v.id = cq.vessel_id
        WHERE cq.client_id = ${input.clientId} AND cq.is_active = 1
        ORDER BY cq.id ASC
      `))) as any;
      const quotas = Array.isArray(quotaRows) ? quotaRows : [];

      // 3. Cobranças do cliente (mensalidades + venda de cota)
      const [chargeRows] = (await db.execute(sql.raw(`
        SELECT id, type, description, value, due_date, status, amount_paid
        FROM bpo_charges
        WHERE client_id = ${input.clientId}
          AND type IN ('monthly', 'quota_sale')
          AND status IN ('pending', 'overdue', 'received', 'receivedInCash', 'confirmed', 'partiallyPaid')
        ORDER BY due_date ASC
        LIMIT 60
      `))) as any;
      const charges = Array.isArray(chargeRows) ? chargeRows : [];

      // Calcular taxa de adesão (primeira quota_sale) e mensalidade
      const quotaSaleCharges = charges.filter((c: any) => c.type === "quota_sale");
      const monthlyCharges = charges.filter((c: any) => c.type === "monthly");
      const adhesionValue = quotaSaleCharges.length > 0
        ? parseFloat(quotaSaleCharges[0].value || "0")
        : 0;
      const monthlyFee = monthlyCharges.length > 0
        ? parseFloat(monthlyCharges[0].value || "0")
        : 0;

      return {
        client: {
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone || "",
          cpfCnpj: client.cpf_cnpj || "",
        },
        quotas: quotas.map((q: any) => ({
          id: q.id,
          quotaType: q.quota_type === "full" ? "Cota Inteira" : "Meia Cota",
          quotaNumber: q.quota_number,
          vesselId: q.vessel_id,
          vesselName: q.vessel_name,
          vesselDescription: q.vessel_description || "",
          totalQuotas: q.total_quotas || 6,
        })),
        adhesionValue,
        monthlyFee,
        installments: charges.map((c: any) => ({
          description: c.description || (c.type === "monthly" ? "Mensalidade" : "Adesão"),
          dueDate: c.due_date,
          value: parseFloat(c.value || "0"),
          type: c.type,
        })),
      };
    }),

  /**
   * Gera o PDF do contrato e envia por e-mail para o cliente
   */
  sendContract: adminProcedure
    .input(
      z.object({
        clientId: z.number(),
        quotaId: z.number().optional(), // Se omitido, usa a primeira cota ativa
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

      // 2. Cotas e embarcações
      const quotaFilter = input.quotaId
        ? `AND cq.id = ${input.quotaId}`
        : "";
      const [quotaRows] = (await db.execute(sql.raw(`
        SELECT cq.id, cq.quota_type, cq.quota_number, cq.vessel_id,
               v.name as vessel_name, v.description as vessel_description,
               v.quota_count as total_quotas
        FROM client_quotas cq
        JOIN vessels v ON v.id = cq.vessel_id
        WHERE cq.client_id = ${input.clientId} AND cq.is_active = 1 ${quotaFilter}
        ORDER BY cq.id ASC
        LIMIT 1
      `))) as any;
      const quotaArr = Array.isArray(quotaRows) ? quotaRows : [];
      const quota = quotaArr[0];
      if (!quota) throw new Error("Nenhuma cota ativa encontrada para este cliente");

      const quotaType = quota.quota_type === "full" ? "Cota Inteira" : "Meia Cota";
      const totalQuotas = quota.total_quotas || 6;
      const quotaPercentage = ((1 / totalQuotas) * 100).toFixed(2).replace(".", ",");

      // 3. Cobranças do cliente
      const [chargeRows] = (await db.execute(sql.raw(`
        SELECT id, type, description, value, due_date, status
        FROM bpo_charges
        WHERE client_id = ${input.clientId}
          AND type IN ('monthly', 'quota_sale')
          AND status IN ('pending', 'overdue', 'received', 'receivedInCash', 'confirmed', 'partiallyPaid')
        ORDER BY due_date ASC
        LIMIT 60
      `))) as any;
      const charges = Array.isArray(chargeRows) ? chargeRows : [];

      const quotaSaleCharges = charges.filter((c: any) => c.type === "quota_sale");
      const monthlyCharges = charges.filter((c: any) => c.type === "monthly");
      const adhesionValue = quotaSaleCharges.length > 0
        ? parseFloat(quotaSaleCharges[0].value || "0")
        : 0;
      const monthlyFee = monthlyCharges.length > 0
        ? parseFloat(monthlyCharges[0].value || "0")
        : 0;

      const installments = charges.map((c: any) => ({
        description: c.description || (c.type === "monthly" ? "Mensalidade" : "Adesão/Parcela"),
        dueDate: c.due_date,
        value: parseFloat(c.value || "0"),
      }));

      // 4. Data do contrato
      const now = new Date();
      const contractDate = now.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

      // 5. Gerar HTML do contrato
      const html = generateContractHtml({
        clientName: client.name,
        clientCpfCnpj: client.cpf_cnpj || "",
        clientPhone: client.phone || "",
        clientEmail: client.email,
        boatName: quota.vessel_name,
        boatDescription: quota.vessel_description || "",
        quotaType,
        quotaNumber: quota.quota_number,
        quotaPercentage,
        totalQuotas,
        adhesionValue,
        monthlyFee,
        installments,
        contractDate,
      });

      // 6. Gerar PDF via Puppeteer
      let pdfBuffer: Buffer;
      try {
        const puppeteer = await import("puppeteer");
        const browser = await puppeteer.default.launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
          ],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdfUint8 = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
        });
        await browser.close();
        pdfBuffer = Buffer.from(pdfUint8);
      } catch (pdfErr: any) {
        throw new Error(`Erro ao gerar PDF: ${pdfErr.message}`);
      }

      // 7. Enviar por e-mail
      const clientFirstName = client.name.split(" ")[0];
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #222;">
          <div style="background: #0a3d6b; padding: 20px; text-align: center;">
            <h2 style="color: #fff; margin: 0;">EXCLUSIVE CLUB</h2>
          </div>
          <div style="padding: 24px;">
            <p>Prezado(a) <strong>${client.name}</strong>,</p>
            <p>
              Encaminhamos em anexo o seu <strong>Contrato de Uso Compartilhado de Embarcação</strong>
              referente à <strong>${quotaType} — Cota Nº ${quota.quota_number}</strong>
              da embarcação <strong>${quota.vessel_name}</strong>.
            </p>
            <p>
              Solicitamos que o contrato seja lido atentamente, assinado digitalmente pelo
              <strong>Gov.br</strong> e devolvido para o e-mail
              <a href="mailto:atendimento@exclusiveclubitz.com">atendimento@exclusiveclubitz.com</a>
              para que possamos arquivá-lo em nosso sistema.
            </p>
            <p>
              Em caso de dúvidas, entre em contato conosco pelo e-mail acima ou pelo
              WhatsApp disponível em nosso site.
            </p>
            <p>Atenciosamente,</p>
            <p>
              <strong>Equipe Exclusive Club</strong><br>
              <span style="color: #666; font-size: 13px;">atendimento@exclusiveclubitz.com</span>
            </p>
          </div>
          <div style="background: #f3f4f6; padding: 12px; text-align: center; font-size: 11px; color: #888;">
            Rua Leôncio Pires Dourado, Nº 840-A, Bairro Bacuri, CEP: 65.901-020 — Imperatriz/MA<br>
            CNPJ: 50.680.592/0001-08
          </div>
        </div>
      `;

      const sent = await sendEmail({
        to: client.email,
        subject: `Exclusive Club — Contrato de Uso Compartilhado — ${quota.vessel_name} (${quotaType} #${quota.quota_number})`,
        html: emailHtml,
        attachments: [
          {
            filename: `Contrato_ExclusiveClub_${client.name.replace(/\s+/g, "_")}_${quota.vessel_name.replace(/\s+/g, "_")}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });

      if (!sent) {
        throw new Error("Falha ao enviar e-mail. Verifique as configurações SMTP.");
      }

      // 8. Registrar data de envio na tabela allowed_clients (campo contract_url reutilizado como log)
      await db.execute(sql.raw(`
        UPDATE allowed_clients
        SET updated_at = NOW()
        WHERE id = ${input.clientId}
      `));

      return {
        success: true,
        message: `Contrato enviado com sucesso para ${client.email}`,
        sentTo: client.email,
        quotaType,
        vesselName: quota.vessel_name,
      };
    }),
});
