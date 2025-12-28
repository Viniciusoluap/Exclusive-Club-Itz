/**
 * Router de Pagamentos - Integração completa com Asaas
 * 
 * Funcionalidades:
 * - Criação de cobranças PIX
 * - Consulta de status de pagamentos
 * - Listagem de pagamentos do cliente
 * - Dashboard admin de pagamentos
 * - Reconciliação de pagamentos
 * - Logs de auditoria e webhooks
 */
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  getOrCreateAsaasCustomer,
  createPixCharge,
  getPixQrCode,
  getChargeStatus,
  cancelCharge,
  formatDateForAsaas,
  savePaymentRecord,
  updatePaymentStatus,
  logPaymentAudit,
  mapAsaasStatus,
  mapToLegacyStatus,
  isValidCpfCnpj,
} from "./_core/asaasService";
import { getAllowedClientByEmail } from "./db";
import {
  runReconciliation,
  expireOldPixCharges,
  checkOverdueCharges,
  getReconciliationHistory,
  runMaintenanceTasks,
} from "./_core/paymentReconciliation";

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const paymentsRouter = router({
  /**
   * Cria cobrança PIX para uma reserva ou mensalidade
   */
  createPixCharge: protectedProcedure
    .input(z.object({
      chargeType: z.enum(['booking', 'monthly', 'fuel', 'inspection', 'repair']),
      chargeId: z.number(),
      value: z.number().min(1, 'Valor deve ser maior que zero'),
      description: z.string(),
      dueDate: z.string().optional(), // YYYY-MM-DD, default: hoje
      clientEmail: z.string().email().optional(), // Se não informado, usa email do usuário logado
      clientName: z.string().optional(),
      cpfCnpj: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const clientEmail = input.clientEmail || ctx.user.email;
      if (!clientEmail) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email do cliente não informado' });
      }

      // Busca dados do cliente
      const client = await getAllowedClientByEmail(clientEmail);
      const clientName = input.clientName || client?.name || ctx.user.name || 'Cliente';
      const cpfCnpj = input.cpfCnpj || client?.cpfCnpj;

      // Valida CPF/CNPJ se informado
      if (cpfCnpj && !isValidCpfCnpj(cpfCnpj)) {
        console.warn('[Payments] CPF/CNPJ inválido:', cpfCnpj);
      }

      // Cria ou busca cliente no Asaas
      const asaasCustomer = await getOrCreateAsaasCustomer({
        email: clientEmail,
        name: clientName,
        cpfCnpj: cpfCnpj || undefined,
        phone: client?.phone || undefined,
      });

      // Define data de vencimento (padrão: hoje)
      const dueDate = input.dueDate || formatDateForAsaas(new Date());

      // Cria referência externa única
      const externalReference = `${input.chargeType}-${input.chargeId}-${Date.now()}`;

      // Cria cobrança PIX no Asaas
      const charge = await createPixCharge({
        customerId: asaasCustomer.id,
        value: input.value,
        description: input.description,
        dueDate,
        externalReference,
      });

      // Busca QR Code PIX
      const pixData = await getPixQrCode(charge.id);

      // Salva no banco de dados central
      const paymentId = await savePaymentRecord({
        chargeType: input.chargeType,
        chargeId: input.chargeId,
        asaasPaymentId: charge.id,
        asaasCustomerId: asaasCustomer.id,
        value: input.value,
        billingType: 'PIX',
        dueDate: new Date(dueDate),
        description: input.description,
        externalReference,
        clientEmail,
        pixQrCode: pixData.encodedImage || undefined,
        pixCopyPaste: pixData.payload || undefined,
        pixExpirationDate: pixData.expirationDate ? new Date(pixData.expirationDate) : undefined,
      });

      console.log('[Payments] Cobrança PIX criada:', {
        paymentId,
        asaasPaymentId: charge.id,
        chargeType: input.chargeType,
        chargeId: input.chargeId,
        value: input.value,
      });

      return {
        success: true,
        paymentId,
        asaasPaymentId: charge.id,
        pixQrCode: pixData.encodedImage,
        pixCopyPaste: pixData.payload,
        pixExpirationDate: pixData.expirationDate,
        invoiceUrl: charge.invoiceUrl,
        value: input.value,
      };
    }),

  /**
   * Consulta status de um pagamento
   */
  getStatus: protectedProcedure
    .input(z.object({
      paymentId: z.number().optional(),
      asaasPaymentId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      if (!input.paymentId && !input.asaasPaymentId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Informe paymentId ou asaasPaymentId' });
      }

      // Busca no banco local
      let query;
      if (input.paymentId) {
        query = sql`SELECT * FROM asaas_payments WHERE id = ${input.paymentId}`;
      } else {
        query = sql`SELECT * FROM asaas_payments WHERE asaas_payment_id = ${input.asaasPaymentId}`;
      }

      const result = await db.execute(query) as any;
      const payment = Array.isArray(result[0]) ? result[0][0] : result[0];

      if (!payment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pagamento não encontrado' });
      }

      // Opcionalmente, sincroniza com Asaas
      if (payment.asaas_payment_id && payment.status === 'pending') {
        const asaasCharge = await getChargeStatus(payment.asaas_payment_id);
        if (asaasCharge) {
          const newStatus = mapAsaasStatus(asaasCharge.status);
          if (newStatus !== payment.status) {
            await updatePaymentStatus({
              asaasPaymentId: payment.asaas_payment_id,
              status: asaasCharge.status,
              paymentDate: asaasCharge.paymentDate ? new Date(asaasCharge.paymentDate) : undefined,
              netValue: asaasCharge.netValue,
              source: 'api',
            });
            payment.status = newStatus;
          }
        }
      }

      return {
        id: payment.id,
        chargeType: payment.charge_type,
        chargeId: payment.charge_id,
        asaasPaymentId: payment.asaas_payment_id,
        status: payment.status,
        value: parseFloat(payment.value),
        billingType: payment.billing_type,
        dueDate: payment.due_date,
        paymentDate: payment.payment_date,
        pixQrCode: payment.pix_qr_code,
        pixCopyPaste: payment.pix_copy_paste,
        pixExpirationDate: payment.pix_expiration_date,
        invoiceUrl: payment.invoice_url,
        clientEmail: payment.client_email,
        createdAt: payment.created_at,
      };
    }),

  /**
   * Lista pagamentos do cliente logado
   */
  myPayments: protectedProcedure
    .input(z.object({
      status: z.enum(['all', 'pending', 'paid', 'overdue']).optional(),
      chargeType: z.enum(['all', 'booking', 'monthly', 'fuel', 'inspection', 'repair']).optional(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      if (!ctx.user.email) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email do usuário não encontrado' });
      }

      const status = input?.status || 'all';
      const chargeType = input?.chargeType || 'all';
      const limit = input?.limit || 50;
      const offset = input?.offset || 0;

      let whereClause = `WHERE client_email = '${ctx.user.email}'`;
      
      if (status !== 'all') {
        const statusMap: Record<string, string[]> = {
          'pending': ['pending'],
          'paid': ['confirmed', 'received'],
          'overdue': ['overdue'],
        };
        const statuses = statusMap[status] || ['pending'];
        whereClause += ` AND status IN (${statuses.map(s => `'${s}'`).join(',')})`;
      }

      if (chargeType !== 'all') {
        whereClause += ` AND charge_type = '${chargeType}'`;
      }

      const result = await db.execute(sql.raw(`
        SELECT * FROM asaas_payments 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `)) as any;

      const countResult = await db.execute(sql.raw(`
        SELECT COUNT(*) as total FROM asaas_payments ${whereClause}
      `)) as any;

      const payments = Array.isArray(result[0]) ? result[0] : [];
      const total = Array.isArray(countResult[0]) ? countResult[0][0]?.total || 0 : 0;

      return {
        payments: payments.map((p: any) => ({
          id: p.id,
          chargeType: p.charge_type,
          chargeId: p.charge_id,
          asaasPaymentId: p.asaas_payment_id,
          status: p.status,
          value: parseFloat(p.value),
          billingType: p.billing_type,
          dueDate: p.due_date,
          paymentDate: p.payment_date,
          description: p.description,
          createdAt: p.created_at,
        })),
        total,
        limit,
        offset,
      };
    }),

  /**
   * Dashboard admin - Lista todos os pagamentos
   */
  adminList: adminProcedure
    .input(z.object({
      status: z.enum(['all', 'pending', 'paid', 'overdue', 'failed']).optional(),
      chargeType: z.enum(['all', 'booking', 'monthly', 'fuel', 'inspection', 'repair']).optional(),
      clientEmail: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const status = input?.status || 'all';
      const chargeType = input?.chargeType || 'all';
      const limit = input?.limit || 50;
      const offset = input?.offset || 0;

      let whereClause = 'WHERE 1=1';
      
      if (status !== 'all') {
        const statusMap: Record<string, string[]> = {
          'pending': ['pending'],
          'paid': ['confirmed', 'received'],
          'overdue': ['overdue'],
          'failed': ['failed', 'cancelled', 'refunded'],
        };
        const statuses = statusMap[status] || ['pending'];
        whereClause += ` AND status IN (${statuses.map(s => `'${s}'`).join(',')})`;
      }

      if (chargeType !== 'all') {
        whereClause += ` AND charge_type = '${chargeType}'`;
      }

      if (input?.clientEmail) {
        whereClause += ` AND client_email LIKE '%${input.clientEmail}%'`;
      }

      if (input?.startDate) {
        whereClause += ` AND created_at >= '${input.startDate}'`;
      }

      if (input?.endDate) {
        whereClause += ` AND created_at <= '${input.endDate} 23:59:59'`;
      }

      const result = await db.execute(sql.raw(`
        SELECT * FROM asaas_payments 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `)) as any;

      const countResult = await db.execute(sql.raw(`
        SELECT COUNT(*) as total FROM asaas_payments ${whereClause}
      `)) as any;

      const statsResult = await db.execute(sql.raw(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status IN ('confirmed', 'received') THEN 1 ELSE 0 END) as paid,
          SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
          SUM(CASE WHEN status IN ('confirmed', 'received') THEN value ELSE 0 END) as total_received,
          SUM(CASE WHEN status = 'pending' THEN value ELSE 0 END) as total_pending
        FROM asaas_payments
      `)) as any;

      const payments = Array.isArray(result[0]) ? result[0] : [];
      const total = Array.isArray(countResult[0]) ? countResult[0][0]?.total || 0 : 0;
      const stats = Array.isArray(statsResult[0]) ? statsResult[0][0] : {};

      return {
        payments: payments.map((p: any) => ({
          id: p.id,
          chargeType: p.charge_type,
          chargeId: p.charge_id,
          asaasPaymentId: p.asaas_payment_id,
          status: p.status,
          value: parseFloat(p.value),
          netValue: p.net_value ? parseFloat(p.net_value) : null,
          billingType: p.billing_type,
          dueDate: p.due_date,
          paymentDate: p.payment_date,
          description: p.description,
          clientEmail: p.client_email,
          createdAt: p.created_at,
        })),
        total,
        limit,
        offset,
        stats: {
          total: stats.total || 0,
          pending: stats.pending || 0,
          paid: stats.paid || 0,
          overdue: stats.overdue || 0,
          totalReceived: parseFloat(stats.total_received) || 0,
          totalPending: parseFloat(stats.total_pending) || 0,
        },
      };
    }),

  /**
   * Cancela um pagamento
   */
  cancel: adminProcedure
    .input(z.object({
      paymentId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Busca pagamento
      const result = await db.execute(sql`
        SELECT * FROM asaas_payments WHERE id = ${input.paymentId}
      `) as any;
      
      const payment = Array.isArray(result[0]) ? result[0][0] : result[0];
      if (!payment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pagamento não encontrado' });
      }

      if (['confirmed', 'received'].includes(payment.status)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível cancelar pagamento já confirmado' });
      }

      // Cancela no Asaas
      const cancelled = await cancelCharge(payment.asaas_payment_id);
      if (!cancelled) {
        console.warn('[Payments] Falha ao cancelar no Asaas, continuando com cancelamento local');
      }

      // Atualiza status local
      await db.execute(sql`
        UPDATE asaas_payments 
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = ${input.paymentId}
      `);

      // Registra log de auditoria
      await logPaymentAudit({
        paymentId: input.paymentId,
        asaasPaymentId: payment.asaas_payment_id,
        action: 'cancelled',
        oldStatus: payment.status,
        newStatus: 'cancelled',
        details: { reason: input.reason, cancelledInAsaas: cancelled },
        source: 'manual',
        performedBy: ctx.user.email || undefined,
      });

      return { success: true };
    }),

  /**
   * Lista logs de webhook
   */
  webhookLogs: adminProcedure
    .input(z.object({
      processed: z.boolean().optional(),
      source: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const limit = input?.limit || 50;
      const offset = input?.offset || 0;

      let whereClause = 'WHERE 1=1';
      
      if (input?.processed !== undefined) {
        whereClause += ` AND processed = ${input.processed ? 1 : 0}`;
      }

      if (input?.source) {
        whereClause += ` AND source = '${input.source}'`;
      }

      const result = await db.execute(sql.raw(`
        SELECT * FROM webhook_logs 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `)) as any;

      const logs = Array.isArray(result[0]) ? result[0] : [];

      return {
        logs: logs.map((log: any) => ({
          id: log.id,
          source: log.source,
          eventType: log.event_type,
          payload: log.payload ? JSON.parse(log.payload) : null,
          processed: log.processed,
          processedAt: log.processed_at,
          errorMessage: log.error_message,
          retryCount: log.retry_count,
          relatedPaymentId: log.related_payment_id,
          ipAddress: log.ip_address,
          createdAt: log.created_at,
        })),
      };
    }),

  /**
   * Lista logs de auditoria de um pagamento
   */
  auditLogs: adminProcedure
    .input(z.object({
      paymentId: z.number().optional(),
      asaasPaymentId: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      if (!input.paymentId && !input.asaasPaymentId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Informe paymentId ou asaasPaymentId' });
      }

      const limit = input.limit || 50;

      let whereClause = 'WHERE 1=1';
      if (input.paymentId) {
        whereClause += ` AND payment_id = ${input.paymentId}`;
      }
      if (input.asaasPaymentId) {
        whereClause += ` AND asaas_payment_id = '${input.asaasPaymentId}'`;
      }

      const result = await db.execute(sql.raw(`
        SELECT * FROM payment_audit_logs 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `)) as any;

      const logs = Array.isArray(result[0]) ? result[0] : [];

      return {
        logs: logs.map((log: any) => ({
          id: log.id,
          paymentId: log.payment_id,
          asaasPaymentId: log.asaas_payment_id,
          action: log.action,
          oldStatus: log.old_status,
          newStatus: log.new_status,
          details: log.details ? JSON.parse(log.details) : null,
          source: log.source,
          performedBy: log.performed_by,
          createdAt: log.created_at,
        })),
      };
    }),

  /**
   * Executa reconciliação manual
   */
  runReconciliation: adminProcedure.mutation(async ({ ctx }) => {
    const result = await runReconciliation(ctx.user.email || undefined);
    return result;
  }),

  /**
   * Expira cobranças PIX antigas
   */
  expirePixCharges: adminProcedure.mutation(async () => {
    const result = await expireOldPixCharges();
    return result;
  }),

  /**
   * Verifica cobranças vencidas
   */
  checkOverdue: adminProcedure.mutation(async () => {
    const result = await checkOverdueCharges();
    return result;
  }),

  /**
   * Executa todas as tarefas de manutenção
   */
  runMaintenance: adminProcedure.mutation(async () => {
    const result = await runMaintenanceTasks();
    return result;
  }),

  /**
   * Histórico de reconciliações
   */
  reconciliationHistory: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(async ({ input }) => {
      const history = await getReconciliationHistory(input?.limit || 10);
      return { history };
    }),

  /**
   * Estatísticas de pagamentos para dashboard
   */
  stats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
    }

    const result = await db.execute(sql.raw(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status IN ('confirmed', 'received') THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN status IN ('cancelled', 'refunded', 'failed') THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status IN ('confirmed', 'received') THEN value ELSE 0 END) as total_received,
        SUM(CASE WHEN status = 'pending' THEN value ELSE 0 END) as total_pending,
        SUM(CASE WHEN status = 'overdue' THEN value ELSE 0 END) as total_overdue
      FROM asaas_payments
    `)) as any;

    const byTypeResult = await db.execute(sql.raw(`
      SELECT 
        charge_type,
        COUNT(*) as count,
        SUM(CASE WHEN status IN ('confirmed', 'received') THEN value ELSE 0 END) as received
      FROM asaas_payments
      GROUP BY charge_type
    `)) as any;

    const stats = Array.isArray(result[0]) ? result[0][0] : {};
    const byType = Array.isArray(byTypeResult[0]) ? byTypeResult[0] : [];

    return {
      total: stats.total || 0,
      pending: stats.pending || 0,
      paid: stats.paid || 0,
      overdue: stats.overdue || 0,
      cancelled: stats.cancelled || 0,
      totalReceived: parseFloat(stats.total_received) || 0,
      totalPending: parseFloat(stats.total_pending) || 0,
      totalOverdue: parseFloat(stats.total_overdue) || 0,
      byType: byType.map((t: any) => ({
        type: t.charge_type,
        count: t.count,
        received: parseFloat(t.received) || 0,
      })),
    };
  }),
});
