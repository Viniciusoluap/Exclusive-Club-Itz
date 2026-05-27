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
import { generateContractPdf } from "../_core/htmlToPdf";

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

      const [clientRows] = (await db.execute(
        sql.raw(`SELECT * FROM allowed_clients WHERE id = ${input.clientId} LIMIT 1`)
      )) as any;
      const client = Array.isArray(clientRows) ? clientRows[0] : clientRows;
      if (!client) throw new Error("Cliente não encontrado");

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

      const [chargeRows] = (await db.execute(sql.raw(`
        SELECT id, type, description, value, due_date, status
        FROM bpo_charges
        WHERE client_id = ${input.clientId}
          AND type IN ('monthly', 'quota_sale')
        ORDER BY type DESC, due_date ASC
        LIMIT 100
      `))) as any;
      const charges = Array.isArray(chargeRows) ? chargeRows : [];

      const quotaSaleCharges = charges.filter((c: any) => c.type === "quota_sale");
      const monthlyCharges = charges.filter((c: any) => c.type === "monthly");

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
        adhesionTotal: quotaSaleCharges.reduce((sum: number, c: any) => sum + parseFloat(c.value || "0"), 0),
        monthlyFee: monthlyCharges.length > 0 ? parseFloat(monthlyCharges[0].value || "0") : 0,
        installments: quotaSaleCharges.map((c: any) => ({
          description: c.description || "Venda de Cota",
          dueDate: c.due_date,
          value: parseFloat(c.value || "0"),
          status: c.status,
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

      // 2. Todas as cotas ativas do cliente
      const [quotaRows] = (await db.execute(sql.raw(`
        SELECT cq.id, cq.quota_type, cq.quota_number, cq.vessel_id,
               v.name as vessel_name, v.description as vessel_description,
               v.quota_count as total_quotas
        FROM client_quotas cq
        JOIN vessels v ON v.id = cq.vessel_id
        WHERE cq.client_id = ${input.clientId} AND cq.is_active = 1
        ORDER BY cq.id ASC
      `))) as any;
      const quotaArr = Array.isArray(quotaRows) ? quotaRows : [];
      if (quotaArr.length === 0) throw new Error("Nenhuma cota ativa encontrada para este cliente");

      // 3. Todos os lançamentos de venda de cota (qualquer status)
      const [saleRows] = (await db.execute(sql.raw(`
        SELECT id, type, description, value, due_date, status
        FROM bpo_charges
        WHERE client_id = ${input.clientId}
          AND type = 'quota_sale'
        ORDER BY due_date ASC
        LIMIT 100
      `))) as any;
      const saleCharges = Array.isArray(saleRows) ? saleRows : [];

      // 4. Taxa mensal (pegar valor do primeiro lançamento mensal)
      const [monthlyRows] = (await db.execute(sql.raw(`
        SELECT value FROM bpo_charges
        WHERE client_id = ${input.clientId} AND type = 'monthly'
        ORDER BY due_date ASC
        LIMIT 1
      `))) as any;
      const monthlyArr = Array.isArray(monthlyRows) ? monthlyRows : [];
      const monthlyFee = monthlyArr.length > 0 ? parseFloat(monthlyArr[0].value || "0") : 0;

      // 5. Total de adesão = soma de todos os lançamentos quota_sale
      const adhesionTotal = saleCharges.reduce((sum: number, c: any) => sum + parseFloat(c.value || "0"), 0);

      // 6. Mapear cotas para o formato do PDF
      const quotasForPdf = quotaArr.map((q: any) => {
        const totalQuotas = q.total_quotas || 6;
        const isHalf = q.quota_type === "half";
        const effectiveQuotas = isHalf ? totalQuotas * 2 : totalQuotas;
        const percentage = ((1 / effectiveQuotas) * 100).toFixed(2).replace(".", ",");
        return {
          boatName: q.vessel_name,
          boatDescription: q.vessel_description || "",
          quotaType: isHalf ? "Meia Cota" : "Cota Inteira",
          quotaNumber: q.quota_number,
          totalQuotas,
          adhesionValue: adhesionTotal,
          monthlyFee,
          quotaPercentage: percentage,
        };
      });

      // 7. Parcelas de venda de cota para a tabela do contrato
      const statusLabel: Record<string, string> = {
        pending: "Pendente",
        overdue: "Vencida",
        received: "Paga",
        receivedInCash: "Paga (Dinheiro)",
        confirmed: "Confirmada",
        partiallyPaid: "Parcial",
        refunded: "Reembolsada",
        awaitingChargeback: "Estorno",
        detached: "Desvinculada",
      };

      const installments = saleCharges.map((c: any) => ({
        description: c.description || "Venda de Cota",
        dueDate: c.due_date,
        value: parseFloat(c.value || "0"),
        status: statusLabel[c.status] || c.status || "",
      }));

      // 8. Data do contrato
      const now = new Date();
      const contractDate = now.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

      // 9. Gerar PDF
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generateContractPdf({
          clientName: client.name,
          clientCpfCnpj: client.cpf_cnpj || "",
          clientRg: client.rg || undefined,
          clientPhone: client.phone || "",
          clientEmail: client.email,
          clientAddress: client.address || undefined,
          clientNeighborhood: client.neighborhood || undefined,
          clientCity: client.city || undefined,
          clientState: client.state || undefined,
          clientZipCode: client.zip_code || undefined,
          quotas: quotasForPdf,
          installments,
          contractDate,
        });
      } catch (pdfErr: any) {
        throw new Error(`Erro ao gerar PDF: ${pdfErr.message}`);
      }

      // 10. Montar lista de cotas para o e-mail
      const quotasSummary = quotasForPdf
        .map((q) => `${q.quotaType} Nº ${q.quotaNumber} — ${q.boatName}`)
        .join(", ");

      // 11. Enviar por e-mail
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #222;">
          <div style="background: #0a3d6b; padding: 20px; text-align: center;">
            <h2 style="color: #fff; margin: 0;">EXCLUSIVE CLUB</h2>
          </div>
          <div style="padding: 24px;">
            <p>Prezado(a) <strong>${client.name}</strong>,</p>
            <p>
              Encaminhamos em anexo o seu <strong>Contrato de Uso Compartilhado de Embarcação</strong>
              referente à(s) cota(s): <strong>${quotasSummary}</strong>.
            </p>
            <p>
              Solicitamos que o contrato seja lido atentamente, assinado e devolvido para o e-mail
              <a href="mailto:atendimento@exclusiveclubitz.com">atendimento@exclusiveclubitz.com</a>
              para que possamos arquivá-lo em nosso sistema.
            </p>
            <p>Em caso de dúvidas, entre em contato conosco pelo e-mail acima ou pelo WhatsApp.</p>
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

      const firstQuota = quotasForPdf[0];
      const sent = await sendEmail({
        to: client.email,
        subject: `Exclusive Club — Contrato de Uso Compartilhado — ${firstQuota.boatName}`,
        html: emailHtml,
        attachments: [
          {
            filename: `Contrato_ExclusiveClub_${client.name.replace(/\s+/g, "_")}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });

      if (!sent) {
        throw new Error("Falha ao enviar e-mail. Verifique as configurações SMTP.");
      }

      await db.execute(sql.raw(`
        UPDATE allowed_clients SET updated_at = NOW() WHERE id = ${input.clientId}
      `));

      return {
        success: true,
        message: `Contrato enviado com sucesso para ${client.email}`,
        sentTo: client.email,
        quotasSummary,
      };
    }),
});
