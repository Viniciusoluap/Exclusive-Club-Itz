/**
 * Client Payments Router — alertas de débitos vencidos e cobrança consolidada
 *
 * Extraído de server/routers.ts (Story 40, SYS-03) sem alteração de
 * comportamento: montado em appRouter sob a mesma chave de antes.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { sql } from "drizzle-orm";
import * as db from "../db";

// ============================================================
// CLIENT PAYMENTS — Alertas de débitos vencidos e cobrança consolidada
// ============================================================
export const clientPaymentsRouter = router({
  // Busca todos os débitos vencidos do cliente logado na tabela bpo_charges
  overdueCharges: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.email) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Email não encontrado' });
    }
    const dbConn = await db.getDb();
    if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // Busca cobranças vencidas: status=overdue OU (status=pending E dueDate < hoje)
    const [rows] = (await dbConn.execute(sql`
      SELECT id, type, description, due_date as dueDate, value,
             asaas_charge_id as asaasChargeId, asaas_customer_id as asaasCustomerId, status
      FROM bpo_charges
      WHERE client_email = ${ctx.user.email}
        AND status NOT IN ('received','confirmed','receivedInCash','refunded')
        AND (status = 'overdue' OR (status = 'pending' AND due_date < ${todayStr}))
        AND (external_reference IS NULL OR external_reference NOT LIKE 'consolidated-%')
      ORDER BY due_date ASC
    `)) as any;
    const charges = Array.isArray(rows) ? rows : [];
    const now = new Date();

    return (charges as any[]).map((c: any) => {
      const due = new Date(c.dueDate + 'T00:00:00');
      const daysOverdue = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      const typeLabel = c.type === 'monthly' ? 'Mensalidade'
        : c.type === 'fuel' ? 'Abastecimento'
        : c.type === 'repair' ? 'Reparo'
        : 'Outro';
      return {
        id: c.id as number,
        type: (c.type ?? 'other') as string,
        typeLabel,
        description: (c.description ?? typeLabel) as string,
        dueDate: c.dueDate as string,
        value: parseFloat(c.value as string),
        asaasChargeId: c.asaasChargeId as string | null,
        asaasCustomerId: c.asaasCustomerId as string | null,
        daysOverdue: Math.max(0, daysOverdue),
      };
    });
  }),

  // Gera cobrança PIX consolidada no Asaas somando todos os débitos vencidos
  generateConsolidatedCharge: protectedProcedure
    .input(z.object({
      chargeIds: z.array(z.number()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.email || !ctx.user.name) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Dados do usuário incompletos' });
      }
      const dbConn = await db.getDb();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });

      // Buscar as cobranças selecionadas e validar que pertencem ao cliente
      const idParams = sql.join(input.chargeIds.map((id) => sql`${id}`), sql`, `);
      const [rows] = (await dbConn.execute(sql`
        SELECT id, type, description, value, asaas_customer_id as asaasCustomerId
        FROM bpo_charges
        WHERE id IN (${idParams})
          AND client_email = ${ctx.user.email}
          AND status NOT IN ('received','confirmed','receivedInCash','refunded')
      `)) as any;
      const charges = Array.isArray(rows) ? rows : [];
      if (!charges || charges.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhuma cobrança vencida encontrada' });
      }

      // Calcular total consolidado
      const total = (charges as any[]).reduce((sum: number, c: any) => sum + parseFloat(c.value), 0);
      const totalRounded = Math.round(total * 100) / 100;

      // Montar descrição consolidada
      const _typeLabelSet = new Set<string>();
      (charges as any[]).forEach((c: any) => {
        const label = c.type === 'monthly' ? 'Mensalidade' : c.type === 'fuel' ? 'Abastecimento' : c.type === 'repair' ? 'Reparo' : 'Outros';
        _typeLabelSet.add(label);
      });
      const typeLabels = Array.from(_typeLabelSet).join(', ');
      const description = `Regularização de débitos vencidos — ${typeLabels} (${charges.length} cobrança${charges.length > 1 ? 's' : ''})`;

      // Obter ou criar cliente no Asaas
      const asaas = await import('../_core/asaas');
      const customer = await asaas.getOrCreateCustomer({
        name: ctx.user.name,
        email: ctx.user.email,
      });

      // Vencimento: amanhã
      const today = new Date();
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 1);
      const dueDateStr = dueDate.toISOString().split('T')[0];

      // IDs das cobranças originais para rastreio no webhook
      const originalIds = (charges as any[]).map((c: any) => c.id).join(',');
      const externalRef = `consolidated-${originalIds}-${Date.now()}`;

      // Criar cobrança PIX consolidada no Asaas
      const charge = await asaas.createCharge({
        customer: customer.id,
        billingType: 'PIX',
        value: totalRounded,
        dueDate: dueDateStr,
        description,
        externalReference: externalRef,
      });

      // Pré-inserir na bpo_charges com classified_by='manual' para evitar que o
      // "Importar do Asaas" crie uma linha duplicada como "Não Classificada"
      try {
        const invoiceUrl = (charge.invoiceUrl || charge.bankSlipUrl || '') as string;
        await dbConn.execute(sql`
          INSERT INTO bpo_charges (
            asaas_charge_id, asaas_customer_id, client_email,
            value, due_date, status, type, classified_by, billing_type,
            description, external_reference, payment_link, invoice_url, source, synced_at
          ) VALUES (
            ${String(charge.id || '')}, ${String(customer.id || '')}, ${ctx.user.email},
            ${totalRounded}, ${dueDateStr}, 'pending', 'other', 'manual', 'PIX',
            ${description}, ${externalRef},
            ${invoiceUrl}, ${invoiceUrl}, 'manual', NOW()
          )
          ON DUPLICATE KEY UPDATE
            status = VALUES(status),
            synced_at = NOW()
        `);
      } catch (insertErr: any) {
        console.warn('[generateConsolidatedCharge] Falha ao pré-inserir bpo_charges:', insertErr?.message);
      }

      return {
        success: true,
        invoiceUrl: (charge.invoiceUrl || charge.bankSlipUrl || null) as string | null,
        value: totalRounded,
        chargeCount: charges.length,
        description,
        asaasChargeId: charge.id as string,
      };
    }),
});
