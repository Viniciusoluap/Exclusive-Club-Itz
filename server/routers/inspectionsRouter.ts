/**
 * Inspections Router — domínio de vistorias e cobranças de danos
 *
 * Extraído de server/routers.ts (Story 40, SYS-03) sem alteração de
 * comportamento: os dois routers abaixo são montados em appRouter sob as mesmas
 * chaves de antes (inspections, inspectionCharges), mantendo o contrato da API
 * idêntico para o frontend.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure, employeeProcedure } from "../_core/trpc";
import * as db from "../db";
import * as stats from "../stats";

// Inspections router - Admin and Employee
export const inspectionsRouter = router({
  create: employeeProcedure
    .input(z.object({
      bookingId: z.number(),
      vesselId: z.number(),
      vesselType: z.enum(['jetski', 'lancha']),
      clientName: z.string(),
      formData: z.record(z.string(), z.string()), // JSON com todos os campos do formulário
      observations: z.string().optional(),
      reprovationPhotos: z.array(z.object({
        itemName: z.string(),
        photoUrl: z.string(),
      })).optional(), // [{itemName: string, photoUrl: string}]
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { inspections, vessels, bookings } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      
      // Buscar nome da embarcação
      const vessel = await db.select().from(vessels).where(eq(vessels.id, input.vesselId)).limit(1);
      if (!vessel || vessel.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Embarcação não encontrada' });
      }
      
      // Buscar email do cliente pelo booking
      let clientEmail: string | null = null;
      if (input.bookingId) {
        const booking = await db.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
        if (booking && booking.length > 0) {
          clientEmail = booking[0].clientEmail;
        }
      }

      // Determinar status geral (approved se todos aprovados, rejected se algum reprovado)
      const hasRejected = Object.values(input.formData).some(v => v === 'REPROVADO');
      const status = hasRejected ? 'rejected' : 'approved';

      try {
        await db.insert(inspections).values({
          bookingId: input.bookingId,
          vesselId: input.vesselId,
          vesselName: vessel[0].name,
          vesselType: input.vesselType,
          clientName: input.clientName,
          clientEmail: clientEmail,
          inspectionData: JSON.stringify(input.formData),
          observations: input.observations || null,
          status,
          inspectedBy: ctx.user?.name || null,
          reprovationPhotos: input.reprovationPhotos && input.reprovationPhotos.length > 0 ? JSON.stringify(input.reprovationPhotos) : null,
        });

        return { success: true };
      } catch (error: any) {
        console.error('[inspections.create] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao criar vistoria: ${error.message}` 
        });
      }
    }),

  list: employeeProcedure
    .input(z.object({
      vesselId: z.number().optional(),
      startDate: z.number().optional(),
      endDate: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        // Buscar vistorias com JOIN para pegar nome da embarcação, cliente e data da reserva
        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT 
            i.id,
            i.booking_id as bookingId,
            i.vessel_id as vesselId,
            i.vessel_name as vesselName,
            i.vessel_type as vesselType,
            i.inspection_data as inspectionData,
            i.observations,
            i.status,
            i.inspected_by as inspectedBy,
            i.created_at as createdAt,
            b.client_name as clientName,
            b.booking_date as bookingDate,
            b.status as bookingStatus
          FROM inspections i
          LEFT JOIN bookings b ON i.booking_id = b.id
          ORDER BY i.created_at DESC
        `) as any;

        const inspections = (Array.isArray(result[0]) ? result[0] : result).map((row: any) => ({
          id: row.id,
          bookingId: row.bookingId,
          vesselId: row.vesselId,
          vesselName: row.vesselName,
          vesselType: row.vesselType,
          clientName: row.clientName,
          bookingDate: row.bookingDate,
          date: row.bookingDate, // Mapear para frontend
          inspectionData: typeof row.inspectionData === 'string' ? JSON.parse(row.inspectionData) : row.inspectionData,
          observations: row.observations,
          status: row.status,
          inspectedBy: row.inspectedBy, // Já é o nome (TEXT)
          createdAt: row.createdAt,
          bookingStatus: row.bookingStatus,
        }));

        return inspections;
      } catch (error: any) {
        console.error('[inspections.list] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao listar vistorias: ${error.message}` 
        });
      }
    }),

  getByBooking: employeeProcedure
    .input(z.object({ bookingId: z.number() }))
    .query(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT i.*, u.name as inspected_by_name
          FROM inspections i
          LEFT JOIN users u ON i.inspected_by = u.id
          WHERE i.booking_id = ${input.bookingId}
          ORDER BY i.created_at DESC
        `) as any;

        const inspections = (Array.isArray(result[0]) ? result[0] : result).map((row: any) => ({
          ...row,
          inspectionData: typeof row.inspection_data === 'string' ? JSON.parse(row.inspection_data) : row.inspection_data
        }));

        return inspections;
      } catch (error: any) {
        console.error('[inspections.getByBooking] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao buscar vistorias: ${error.message}` 
        });
      }
    }),

  delete: employeeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { inspections } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      try {
        await db.delete(inspections).where(eq(inspections.id, input.id));
        return { success: true };
      } catch (error: any) {
        console.error('[inspections.delete] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao excluir vistoria: ${error.message}` 
        });
      }
    }),

  generateReport: employeeProcedure
    .input(z.object({
      inspectionIds: z.array(z.number()).optional(),
    }).optional())
    .mutation(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');

        let result;
        if (input?.inspectionIds && input.inspectionIds.length > 0) {
          // Buscar vistorias específicas por IDs
          const idsSQL = sql.join(input.inspectionIds.map(id => sql`${id}`), sql`, `);
          result = await db.execute(sql`
            SELECT
              i.*,
              v.name as vessel_name,
              b.booking_date,
              b.client_name as booking_client_name,
              u.name as inspected_by_name,
              i.reprovation_photos
            FROM inspections i
            JOIN vessels v ON i.vessel_id = v.id
            LEFT JOIN bookings b ON i.booking_id = b.id
            LEFT JOIN users u ON i.inspected_by = u.id
            WHERE i.id IN (${idsSQL})
            ORDER BY i.created_at DESC
          `) as any;
        } else {
          // Buscar últimas 10 vistorias
          result = await db.execute(sql`
            SELECT 
              i.*,
              v.name as vessel_name,
              b.booking_date,
              b.client_name as booking_client_name,
              u.name as inspected_by_name,
              i.reprovation_photos
            FROM inspections i
            JOIN vessels v ON i.vessel_id = v.id
            LEFT JOIN bookings b ON i.booking_id = b.id
            LEFT JOIN users u ON i.inspected_by = u.id
            ORDER BY i.created_at DESC
            LIMIT 10
          `) as any;
        }

        const inspections = (Array.isArray(result[0]) ? result[0] : result).map((row: any) => ({
          ...row,
          inspection_data: typeof row.inspection_data === 'string' ? JSON.parse(row.inspection_data) : row.inspection_data
        }));

        // Gerar PDF
        const { generateInspectionsReportPDF } = await import('../_core/inspectionsPDF');
        const { notifyOwner } = await import('../_core/notification');
        const pdfBuffer = await generateInspectionsReportPDF(inspections);

        // Notificar owner
        await notifyOwner({
          title: '📋 Relatório de Vistorias Gerado',
          content: `Relatório das últimas ${inspections.length} vistorias foi gerado com sucesso. O PDF foi baixado automaticamente.`,
        });

        return { success: true, count: inspections.length, pdfBase64: pdfBuffer.toString('base64') };
      } catch (error: any) {
        console.error('[inspections.generateReport] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao gerar relatório: ${error.message}` 
        });
      }
    }),

  // Cliente: Buscar minhas últimas 3 vistorias reprovadas com dados de cobrança
  myFailedInspections: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user?.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }

      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        
        // Buscar últimas 3 vistorias reprovadas do cliente
        const result = await db.execute(sql`
          SELECT 
            i.id,
            i.created_at,
            i.vessel_name,
            i.vessel_type,
            i.inspection_data,
            i.observations,
            i.reprovation_photos,
            b.booking_date,
            b.client_name,
            ic.id as charge_id,
            ic.amount as charge_amount,
            ic.due_date as charge_due_date,
            ic.payment_status,
            ic.asaas_charge_id,
            ic.failed_items as charge_failed_items
          FROM inspections i
          LEFT JOIN bookings b ON i.booking_id = b.id
          LEFT JOIN inspection_charges ic ON ic.inspection_id = i.id
          WHERE i.status = 'rejected'
            AND b.client_email = ${ctx.user.email}
          ORDER BY i.created_at DESC
          LIMIT 3
        `) as any;
        
        const inspections = (Array.isArray(result[0]) ? result[0] : result).map((row: any) => ({
          id: row.id,
          createdAt: row.created_at,
          vesselName: row.vessel_name,
          vesselType: row.vessel_type,
          inspectionData: typeof row.inspection_data === 'string' ? JSON.parse(row.inspection_data) : row.inspection_data,
          observations: row.observations,
          reprovationPhotos: row.reprovation_photos ? (typeof row.reprovation_photos === 'string' ? JSON.parse(row.reprovation_photos) : row.reprovation_photos) : null,
          bookingDate: row.booking_date,
          clientName: row.client_name,
          // Dados da cobrança (se existir)
          charge: row.charge_id ? {
            id: row.charge_id,
            amount: parseFloat(row.charge_amount),
            dueDate: row.charge_due_date,
            paymentStatus: row.payment_status,
            asaasChargeId: row.asaas_charge_id,
            failedItems: row.charge_failed_items ? (typeof row.charge_failed_items === 'string' ? JSON.parse(row.charge_failed_items) : row.charge_failed_items) : [],
          } : null,
        }));
        
        return inspections;
      } catch (error: any) {
        console.error('[inspections.myFailedInspections] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao buscar vistorias reprovadas: ${error.message}` 
        });
      }
    }),

  sendReportByEmail: employeeProcedure
    .input(z.object({
      inspectionIds: z.array(z.number()),
      email: z.string().email(),
    }))
    .mutation(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        const ids = input.inspectionIds.join(',');
        
        const result = await db.execute(sql.raw(`
          SELECT 
            i.*,
            v.name as vessel_name,
            b.booking_date,
            b.client_name as booking_client_name,
            u.name as inspected_by_name
          FROM inspections i
          JOIN vessels v ON i.vessel_id = v.id
          LEFT JOIN bookings b ON i.booking_id = b.id
          LEFT JOIN users u ON i.inspected_by = u.id
          WHERE i.id IN (${ids})
          ORDER BY i.created_at DESC
        `)) as any;

        const inspections = (Array.isArray(result[0]) ? result[0] : result).map((row: any) => ({
          ...row,
          inspection_data: typeof row.inspection_data === 'string' ? JSON.parse(row.inspection_data) : row.inspection_data
        }));

        // Gerar PDF
        const { generateInspectionsReportPDF } = await import('../_core/inspectionsPDF');
        const pdfBuffer = await generateInspectionsReportPDF(inspections);

        // Enviar email
        const { sendEmail } = await import('../_core/emailService');
        const emailSent = await sendEmail({
          to: input.email,
          subject: `Relatório de Vistorias - ${new Date().toLocaleDateString('pt-BR')}`,
          text: `Segue em anexo o relatório de ${inspections.length} vistoria(s).`,
          html: `
            <h2>Relatório de Vistorias</h2>
            <p>Prezado(a),</p>
            <p>Segue em anexo o relatório contendo ${inspections.length} vistoria(s) solicitada(s).</p>
            <p>Atenciosamente,<br/>Exclusive Club</p>
          `,
          attachments: [{
            filename: `relatorio-vistorias-${new Date().toISOString().split('T')[0]}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          }],
        });

        if (!emailSent) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao enviar e-mail. Verifique as configurações SMTP.' });
        }

        // Notificar owner
        const { notifyOwner } = await import('../_core/notification');
        await notifyOwner({
          title: '📧 Relatório de Vistorias Enviado',
          content: `Relatório de ${inspections.length} vistoria(s) enviado para ${input.email}.`,
        });

        return { success: true, count: inspections.length };
      } catch (error: any) {
        console.error('[inspections.sendReportByEmail] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao enviar relatório: ${error.message}` 
        });
      }
    }),
});

// Inspection Charges - Cobranças de Danos
export const inspectionChargesRouter = router({
  // Admin: Criar cobrança (Vistoria Reprovada ou Reparo da Embarcação)
  create: adminProcedure
    .input(z.object({
      chargeType: z.enum(['inspection', 'repair']),
      // Campos para tipo 'inspection'
      inspectionId: z.number().optional(),
      failedItems: z.array(z.object({
        name: z.string(),
        status: z.string(),
      })).optional(),
      // Campos para tipo 'repair'
      vesselId: z.number().optional(),
      description: z.string().optional(),
      receiptUrl: z.string().optional(),
      // Campos comuns
      amount: z.number().positive(),
      dueDate: z.number().optional(), // Unix timestamp
    }))
    .mutation(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        const { inspectionCharges } = await import('../../drizzle/schema');
        const { createCharge } = await import('../_core/asaas');
        const { getOrCreateAsaasCustomer } = await import('../_core/asaasService');
        
        // Calcular data de vencimento (7 dias padrão)
        const dueDate = input.dueDate || Date.now() + (7 * 24 * 60 * 60 * 1000);
        const dueDateStr = new Date(dueDate).toISOString().split('T')[0];
        
        if (input.chargeType === 'inspection') {
          // TIPO 1: Vistoria Reprovada
          if (!input.inspectionId || !input.failedItems) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'inspectionId e failedItems são obrigatórios para tipo inspection' });
          }
          
          // Buscar dados da vistoria com CPF/CNPJ do cliente
          const inspectionResult = await db.execute(sql.raw(`
            SELECT
              i.*,
              COALESCE(i.client_email, b.client_email) as client_email,
              v.name as vessel_name,
              ac.id as client_id,
              ac.name as ac_client_name,
              ac.cpf_cnpj as client_cpf_cnpj,
              ac.phone as client_phone
            FROM inspections i
            LEFT JOIN bookings b ON i.booking_id = b.id
            JOIN vessels v ON i.vessel_id = v.id
            LEFT JOIN allowed_clients ac ON LOWER(TRIM(COALESCE(i.client_email, b.client_email))) = LOWER(TRIM(ac.email))
            WHERE i.id = ${input.inspectionId}
          `)) as any;
          
          const inspection = (Array.isArray(inspectionResult[0]) ? inspectionResult[0][0] : inspectionResult[0]);
          if (!inspection) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Vistoria não encontrada' });
          }
          
          // Validar se temos email do cliente
          if (!inspection.client_email) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'Email do cliente não encontrado. Vistoria sem reserva vinculada precisa ter email cadastrado.' 
            });
          }
          
          // Validar CPF/CNPJ do cliente antes de criar no Asaas
          if (!inspection.client_cpf_cnpj) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Cliente ${inspection.client_name || inspection.client_email} não possui CPF/CNPJ cadastrado. Acesse "Clientes Permitidos", edite o cliente e preencha o CPF/CNPJ antes de criar a cobrança.`,
            });
          }

          // Buscar/criar customer no Asaas (versão robusta com cache e CPF/CNPJ)
          const resolvedClientName = inspection.ac_client_name || inspection.client_name || null;
          const customer = await getOrCreateAsaasCustomer({
            name: resolvedClientName || inspection.client_email,
            email: inspection.client_email,
            cpfCnpj: inspection.client_cpf_cnpj,
            phone: inspection.client_phone,
          });
          
          // Criar cobrança no Asaas
          const asaasCharge = await createCharge({
            customer: customer.id,
            billingType: 'PIX',
            value: input.amount,
            dueDate: dueDateStr,
            description: `Conserto de Danos - Vistoria ${new Date(inspection.created_at).toLocaleDateString('pt-BR')}`,
          });
          
          // Salvar no banco
          const { insertId: inspectionChargeId } = await db.insert(inspectionCharges).values({
            chargeType: 'inspection',
            inspectionId: input.inspectionId,
            vesselId: null,
            clientEmail: inspection.client_email,
            vesselName: inspection.vessel_name,
            description: null,
            failedItems: JSON.stringify(input.failedItems),
            amount: input.amount.toString(),
            dueDate: new Date(dueDate).toISOString(),
            asaasChargeId: asaasCharge.id,
            paymentStatus: 'pending',
            receiptUrl: null,
          }) as any;

          // Sincronizar com bpo_charges — upsert para nunca falhar por duplicata de asaas_charge_id
          await db.execute(sql.raw(`
            INSERT INTO bpo_charges
              (asaas_charge_id, asaas_customer_id, client_id, client_name, client_email,
               value, due_date, status, type, classified_by, billing_type, description,
               payment_link, invoice_url, source)
            VALUES
              (${JSON.stringify(asaasCharge.id)},
               ${JSON.stringify(customer.id)},
               ${inspection.client_id ?? 'NULL'},
               ${resolvedClientName ? JSON.stringify(resolvedClientName) : 'NULL'},
               ${JSON.stringify(inspection.client_email)},
               ${parseFloat(input.amount.toString()).toFixed(2)},
               ${JSON.stringify(dueDateStr)},
               'pending', 'repair', 'manual', 'PIX',
               ${JSON.stringify(`Conserto de Danos - Vistoria ${new Date(inspection.created_at).toLocaleDateString('pt-BR')}`)},
               ${asaasCharge.invoiceUrl ? JSON.stringify(asaasCharge.invoiceUrl) : 'NULL'},
               ${asaasCharge.invoiceUrl ? JSON.stringify(asaasCharge.invoiceUrl) : 'NULL'},
               'manual')
            ON DUPLICATE KEY UPDATE
              type = 'repair',
              classified_by = 'manual',
              client_id = COALESCE(VALUES(client_id), client_id),
              client_name = COALESCE(VALUES(client_name), client_name),
              client_email = COALESCE(VALUES(client_email), client_email),
              description = VALUES(description)
          `));
          
          return { 
            success: true, 
            chargeId: asaasCharge.id,
            pixQrCode: asaasCharge.pixQrCode,
            pixCopyPaste: asaasCharge.pixCopyPaste,
          };
          
        } else {
          // TIPO 2: Reparo da Embarcação (com rateio automático)
          if (!input.vesselId || !input.description) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'vesselId e description são obrigatórios para tipo repair' });
          }
          
          // Buscar embarcação
          const vesselResult = await db.execute(sql.raw(`
            SELECT * FROM vessels WHERE id = ${input.vesselId}
          `)) as any;
          const vessel = (Array.isArray(vesselResult[0]) ? vesselResult[0][0] : vesselResult[0]);
          if (!vessel) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Embarcação não encontrada' });
          }
          
          // Buscar clientes com cotas da embarcação
          const quotasResult = await db.execute(sql.raw(`
            SELECT 
              cq.id as quota_id,
              cq.quota_type,
              ac.id as client_id,
              ac.email as client_email,
              ac.name as client_name,
              ac.cpf_cnpj as client_cpf_cnpj,
              ac.phone as client_phone
            FROM client_quotas cq
            JOIN allowed_clients ac ON cq.client_id = ac.id
            WHERE cq.vessel_id = ${input.vesselId} AND cq.is_active = 1
          `)) as any;
          
          const quotas = (Array.isArray(quotasResult[0]) ? quotasResult[0] : quotasResult);
          if (quotas.length === 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhuma cota ativa encontrada para esta embarcação' });
          }
          
          // Calcular valor por cota
          const quotaCount = vessel.quota_count || 6;
          const valuePerFullQuota = input.amount / quotaCount;
          
          // Criar cobranças individuais para cada cliente
          const createdCharges: any[] = [];
          
          for (const quota of quotas) {
            // Calcular valor individual baseado no tipo de cota
            const quotaShare = quota.quota_type === 'full' ? 1.0 : 0.5;
            const individualAmount = valuePerFullQuota * quotaShare;
            
            // Validar CPF/CNPJ do cotista antes de criar no Asaas
            if (!quota.client_cpf_cnpj) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Cotista ${quota.client_name || quota.client_email} não possui CPF/CNPJ cadastrado. Acesse "Clientes Permitidos", edite o cliente e preencha o CPF/CNPJ antes de criar a cobrança.`,
              });
            }

            // Buscar/criar customer no Asaas (versão robusta com cache e CPF/CNPJ)
            const customer = await getOrCreateAsaasCustomer({
              name: quota.client_name || quota.client_email,
              email: quota.client_email,
              cpfCnpj: quota.client_cpf_cnpj,
              phone: quota.client_phone,
            });
            
            // Criar cobrança no Asaas
            const asaasCharge = await createCharge({
              customer: customer.id,
              billingType: 'PIX',
              value: individualAmount,
              dueDate: dueDateStr,
              description: `Reparo da Embarcação: ${vessel.name} - ${input.description}`,
            });
            
            // Salvar no banco
            await db.insert(inspectionCharges).values({
              chargeType: 'repair',
              inspectionId: null,
              vesselId: input.vesselId,
              clientEmail: quota.client_email,
              vesselName: vessel.name,
              description: input.description,
              failedItems: null,
              amount: individualAmount.toString(),
              dueDate: new Date(dueDate).toISOString(),
              asaasChargeId: asaasCharge.id,
              paymentStatus: 'pending',
              receiptUrl: input.receiptUrl || null,
            });

            // Sincronizar com bpo_charges — upsert para nunca falhar por duplicata de asaas_charge_id
            await db.execute(sql.raw(`
              INSERT INTO bpo_charges
                (asaas_charge_id, asaas_customer_id, client_id, client_name, client_email,
                 value, due_date, status, type, classified_by, billing_type, description,
                 payment_link, invoice_url, source)
              VALUES
                (${JSON.stringify(asaasCharge.id)},
                 ${JSON.stringify(customer.id)},
                 ${quota.client_id ?? 'NULL'},
                 ${quota.client_name ? JSON.stringify(quota.client_name) : 'NULL'},
                 ${JSON.stringify(quota.client_email)},
                 ${parseFloat(individualAmount.toString()).toFixed(2)},
                 ${JSON.stringify(dueDateStr)},
                 'pending', 'repair', 'manual', 'PIX',
                 ${JSON.stringify(`Reparo da Embarcação: ${vessel.name} - ${input.description}`)},
                 ${asaasCharge.invoiceUrl ? JSON.stringify(asaasCharge.invoiceUrl) : 'NULL'},
                 ${asaasCharge.invoiceUrl ? JSON.stringify(asaasCharge.invoiceUrl) : 'NULL'},
                 'manual')
              ON DUPLICATE KEY UPDATE
                type = 'repair',
                classified_by = 'manual',
                client_id = COALESCE(VALUES(client_id), client_id),
                client_name = COALESCE(VALUES(client_name), client_name),
                client_email = COALESCE(VALUES(client_email), client_email),
                description = VALUES(description)
            `));
            
            createdCharges.push({
              clientEmail: quota.client_email,
              clientName: quota.client_name,
              amount: individualAmount,
              quotaType: quota.quota_type,
              asaasChargeId: asaasCharge.id,
            });
          }
          
          return { 
            success: true,
            message: `${createdCharges.length} cobranças criadas com sucesso`,
            charges: createdCharges,
          };
        }
      } catch (error: any) {
        console.error('[inspectionCharges.create] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao criar cobrança: ${error.message}` 
        });
      }
    }),

  // Admin: Buscar últimas 5 vistorias reprovadas
  getFailedInspections: adminProcedure
    .query(async () => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql.raw(`
          SELECT 
            i.id,
            i.vessel_name,
            i.client_name,
            i.created_at,
            i.inspection_data
          FROM inspections i
          WHERE i.status = 'rejected'
          ORDER BY i.created_at DESC
          LIMIT 5
        `)) as any;
        
        return (Array.isArray(result[0]) ? result[0] : result);
      } catch (error: any) {
        console.error('[inspectionCharges.getFailedInspections] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao buscar vistorias reprovadas: ${error.message}` 
        });
      }
    }),

  // Admin: Listar todas as cobranças
  listAll: adminProcedure
    .input(z.object({
      status: z.enum(['all', 'pending', 'paid', 'overdue', 'cancelled', 'partiallyPaid']).optional().default('all'),
      month: z.string().optional(), // '01' .. '12'
      year: z.string().optional(),  // '2024'
      clientSearch: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        
        // Filtros na subquery interna (usa effective_status calculado)
        const innerConditions: any[] = [];
        if (input?.month) {
          innerConditions.push(sql`MONTH(ic.due_date) = ${parseInt(input.month)}`);
        }
        if (input?.year) {
          innerConditions.push(sql`YEAR(ic.due_date) = ${parseInt(input.year)}`);
        }
        if (input?.clientSearch && input.clientSearch.trim()) {
          const searchPattern = `%${input.clientSearch.trim()}%`;
          innerConditions.push(sql`(ic.client_email LIKE ${searchPattern} OR ac.name LIKE ${searchPattern})`);
        }
        const innerWhere = innerConditions.length > 0
          ? sql`WHERE ${sql.join(innerConditions, sql` AND `)}`
          : sql``;

        // Filtro de status aplicado APÓS calcular effective_status
        const statusFilter = (input?.status && input.status !== 'all')
          ? sql`WHERE effective_status = ${input.status}`
          : sql``;

        const result = await db.execute(sql`
          SELECT *
          FROM (
            SELECT
              ic.*,
              COALESCE(ac.name, ic.client_email) AS client_name,
              CASE
                WHEN ic.payment_status IN ('paid', 'cancelled', 'partiallyPaid') THEN ic.payment_status
                WHEN ic.payment_status = 'overdue' THEN 'overdue'
                WHEN ic.payment_status = 'pending' AND ic.due_date < CURDATE() THEN 'overdue'
                ELSE 'pending'
              END AS effective_status,
              i.created_at as inspection_date,
              ddr.id as pending_request_id,
              ddr.new_due_date as pending_new_due_date,
              ddr.reason as pending_reason,
              ddr.created_at as pending_request_date
            FROM inspection_charges ic
            LEFT JOIN inspections i ON ic.inspection_id = i.id
            LEFT JOIN due_date_change_requests ddr ON ddr.charge_id = ic.id AND ddr.status = 'pending'
            LEFT JOIN allowed_clients ac ON ac.email = ic.client_email
            ${innerWhere}
          ) AS sub
          ${statusFilter}
          ORDER BY created_at DESC
        `) as any;
        
        const charges = (Array.isArray(result[0]) ? result[0] : result).map((row: any) => ({
          ...row,
          // Sobrescreve payment_status com o status normalizado (overdue se vencido)
          payment_status: row.effective_status || row.payment_status,
          failed_items: typeof row.failed_items === 'string' && row.failed_items ? JSON.parse(row.failed_items) : row.failed_items,
          pending_due_date_request: row.pending_request_id ? {
            id: row.pending_request_id,
            new_due_date: row.pending_new_due_date,
            reason: row.pending_reason,
            created_at: row.pending_request_date,
          } : null,
        }));
        
        return charges;
      } catch (error: any) {
        console.error('[inspectionCharges.listAll] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao listar cobranças: ${error.message}` 
        });
      }
    }),

  // Admin: Atualizar cobrança (prorrogar/amortizar)
  update: adminProcedure
    .input(z.object({
      chargeId: z.number(),
      newAmount: z.number().positive().optional(),
      newDueDate: z.number().optional(), // Unix timestamp
      receiptUrl: z.string().nullable().optional(), // URL do comprovante/foto do reparo
    }))
    .mutation(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        const { inspectionCharges } = await import('../../drizzle/schema');
        
        // Buscar cobrança
        const chargeResult = await db.execute(sql.raw(`
          SELECT * FROM inspection_charges WHERE id = ${input.chargeId}
        `)) as any;
        
        const charge = (Array.isArray(chargeResult[0]) ? chargeResult[0][0] : chargeResult[0]);
        if (!charge) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Cobrança não encontrada' });
        }
        
        if (charge.payment_status === 'paid') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível editar cobrança paga' });
        }
        
        // Atualizar campos
        const updates: any = {};
        if (input.newAmount) updates.amount = input.newAmount.toString();
        if (input.newDueDate) updates.dueDate = new Date(input.newDueDate);
        if (input.receiptUrl !== undefined) updates.receiptUrl = input.receiptUrl;
        
        if (Object.keys(updates).length > 0) {
          await db.update(inspectionCharges)
            .set(updates)
            .where(sql`id = ${input.chargeId}`);
        }
        
        return { success: true };
      } catch (error: any) {
        console.error('[inspectionCharges.update] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao atualizar cobrança: ${error.message}` 
        });
      }
    }),

  // Admin: Excluir cobrança permanentemente
  delete: adminProcedure
    .input(z.object({
      chargeId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql, eq } = await import('drizzle-orm');
        const { inspectionCharges } = await import('../../drizzle/schema');
        
        // Buscar cobrança
        const chargeResult = await db.execute(sql.raw(`
          SELECT * FROM inspection_charges WHERE id = ${input.chargeId}
        `)) as any;
        
        const charge = (Array.isArray(chargeResult[0]) ? chargeResult[0][0] : chargeResult[0]);
        if (!charge) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Cobrança não encontrada' });
        }
        
        // Tentar cancelar no Asaas (se existir), mas não falhar se der erro
        if (charge.asaas_charge_id) {
          try {
            const { deleteCharge } = await import('../_core/asaas');
            await deleteCharge(charge.asaas_charge_id);
          } catch (asaasError: any) {
            console.warn('[inspectionCharges.delete] Erro ao cancelar no Asaas (continuando com exclusão local):', asaasError.message);
            // Continua com a exclusão local mesmo se falhar no Asaas
          }
        }
        
        // EXCLUSÃO PERMANENTE (hard delete)
        await db.delete(inspectionCharges)
          .where(eq(inspectionCharges.id, input.chargeId));
        
        return { success: true };
      } catch (error: any) {
        console.error('[inspectionCharges.delete] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao excluir cobrança: ${error.message}` 
        });
      }
    }),

  // Admin: Marcar cobrança como recebida manualmente
  markAsPaid: adminProcedure
    .input(z.object({
      chargeId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql, eq } = await import('drizzle-orm');
        const { inspectionCharges } = await import('../../drizzle/schema');

        // Buscar cobrança
        const chargeResult = await db.execute(sql`
          SELECT * FROM inspection_charges WHERE id = ${input.chargeId}
        `) as any;

        const charge = (Array.isArray(chargeResult[0]) ? chargeResult[0][0] : chargeResult[0]);
        if (!charge) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Cobrança não encontrada' });
        }

        // Atualizar status local e sincronizar bpo_charges numa única
        // transação (mesmo motivo do fuelRecords.markAsPaid: sem chamada
        // externa no meio, então sucesso parcial não tem justificativa —
        // se o sync falhar, a marcação de pago também é revertida).
        await db.transaction(async (tx) => {
          await tx.update(inspectionCharges)
            .set({
              paymentStatus: 'paid',
            })
            .where(eq(inspectionCharges.id, input.chargeId));

          const chargeType = 'repair';
          const chargeValue = parseFloat(String(charge.amount || 0));
          const dueDate = charge.due_date ? String(charge.due_date).substring(0, 10) : '';

          // 1. Atualizar pelo asaas_charge_id (campo mais confiável)
          if (charge.asaas_charge_id) {
            await tx.execute(sql`
              UPDATE bpo_charges
              SET status = 'receivedInCash', paid_date = CURDATE(), synced_at = NOW(), classified_by = 'manual'
              WHERE asaas_charge_id = ${String(charge.asaas_charge_id)}
            `);
          }

          // 2. Fallback por client_id (busca o cliente pelo email no cadastro)
          if (charge.client_email) {
            const clientEmail = String(charge.client_email);

            // Tenta obter client_id via allowed_clients
            const clientRow = await tx.execute(sql`
              SELECT id FROM allowed_clients WHERE LOWER(email) = LOWER(${clientEmail}) LIMIT 1
            `) as any;
            const clientId = (Array.isArray(clientRow[0]) ? clientRow[0][0] : clientRow[0])?.id ?? null;

            if (clientId) {
              if (dueDate) {
                const dueDatePattern = `${dueDate}%`;
                await tx.execute(sql`
                  UPDATE bpo_charges
                  SET status = 'receivedInCash', paid_date = CURDATE(), synced_at = NOW(), classified_by = 'manual'
                  WHERE client_id = ${clientId}
                    AND type = ${chargeType}
                    AND ABS(CAST(value AS DECIMAL(10,2)) - ${chargeValue}) < 0.02
                    AND due_date LIKE ${dueDatePattern}
                    AND status NOT IN ('receivedInCash','received','confirmed','cancelled')
                `);
              } else {
                await tx.execute(sql`
                  UPDATE bpo_charges
                  SET status = 'receivedInCash', paid_date = CURDATE(), synced_at = NOW(), classified_by = 'manual'
                  WHERE client_id = ${clientId}
                    AND type = ${chargeType}
                    AND ABS(CAST(value AS DECIMAL(10,2)) - ${chargeValue}) < 0.02
                    AND status NOT IN ('receivedInCash','received','confirmed','cancelled')
                `);
              }
            }

            // 3. Fallback por email direto (quando client_id não encontrado)
            await tx.execute(sql`
              UPDATE bpo_charges
              SET status = 'receivedInCash', paid_date = CURDATE(), synced_at = NOW(), classified_by = 'manual'
              WHERE LOWER(client_email) = LOWER(${clientEmail})
                AND type = ${chargeType}
                AND ABS(CAST(value AS DECIMAL(10,2)) - ${chargeValue}) < 0.02
                AND status NOT IN ('receivedInCash','received','confirmed','cancelled')
            `);
          }
        });

        return { success: true };
      } catch (error: any) {
        // Re-lança TRPCErrors intencionais (ex.: NOT_FOUND 'Cobrança não
        // encontrada') sem mascará-los com a mensagem genérica.
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[inspectionCharges.markAsPaid] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro ao marcar cobrança como recebida. Tente novamente.'
        });
      }
    }),

  // Cliente: Buscar vistorias reprovadas (com ou sem cobrança) + filtro de mês/ano
  myCharges: protectedProcedure
    .input(z.object({
      monthYear: z.string().optional(), // formato: YYYY-MM
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user?.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }

      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        
        // Construir filtro de data se fornecido (aplica na data da vistoria)
        const dateConditions: any[] = [];
        if (input.monthYear) {
          const [year, month] = input.monthYear.split('-');
          dateConditions.push(sql`YEAR(i.created_at) = ${Number(year)}`);
          dateConditions.push(sql`MONTH(i.created_at) = ${Number(month)}`);
        }
        const dateFilter = dateConditions.length > 0
          ? sql`AND ${sql.join(dateConditions, sql` AND `)}`
          : sql``;

        // Buscar vistorias reprovadas do cliente (com ou sem cobrança)
        const result = await db.execute(sql`
          SELECT
            i.id as inspection_id,
            i.vessel_name,
            i.client_name,
            i.created_at as inspection_date,
            i.inspection_data,
            i.reprovation_photos,
            ic.id as charge_id,
            ic.amount,
            ic.due_date,
            CASE
              WHEN ic.payment_status IN ('paid', 'cancelled') THEN ic.payment_status
              WHEN ic.payment_status = 'overdue' THEN 'overdue'
              WHEN ic.payment_status = 'pending' AND ic.due_date < CURDATE() THEN 'overdue'
              ELSE ic.payment_status
            END AS payment_status,
            ic.asaas_charge_id,
            ic.receipt_url,
            ic.failed_items
          FROM inspections i
          LEFT JOIN inspection_charges ic ON ic.inspection_id = i.id AND ic.charge_type = 'inspection'
          WHERE i.status = 'rejected'
            AND i.client_name IN (
              SELECT DISTINCT client_name FROM bookings WHERE client_email = ${ctx.user.email}
            )
            ${dateFilter}
          ORDER BY i.created_at DESC
        `) as any;
        
        const inspections = (Array.isArray(result[0]) ? result[0] : result).map((row: any) => {
          // Extrair itens reprovados do inspection_data
          let failedItems: Array<{ name: string; status: string }> = [];
          if (row.inspection_data) {
            try {
              const data = typeof row.inspection_data === 'string' 
                ? JSON.parse(row.inspection_data) 
                : row.inspection_data;
              failedItems = Object.entries(data)
                .filter(([_, value]) => value === 'REPROVADO')
                .map(([key, _]) => ({ name: key, status: 'REPROVADO' }));
            } catch (e) {
              console.error('Error parsing inspection_data:', e);
            }
          }

          // Parsear fotos de reprovação
          let reprovationPhotos: Array<{ itemName: string; photoUrl: string }> = [];
          if (row.reprovation_photos) {
            try {
              reprovationPhotos = typeof row.reprovation_photos === 'string'
                ? JSON.parse(row.reprovation_photos)
                : row.reprovation_photos;
            } catch (e) {
              console.error('Error parsing reprovation_photos:', e);
            }
          }

          return {
            inspection_id: row.inspection_id,
            vessel_name: row.vessel_name,
            client_name: row.client_name,
            inspection_date: row.inspection_date,
            failed_items: failedItems,
            reprovation_photos: reprovationPhotos,
            charge: {
              id: row.charge_id,
              amount: row.amount,
              due_date: row.due_date,
              payment_status: row.payment_status,
              asaas_charge_id: row.asaas_charge_id,
              receipt_url: row.receipt_url,
            },
          };
        });
        
        return inspections;
      } catch (error: any) {
        console.error('[inspectionCharges.myCharges] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao buscar vistorias: ${error.message}` 
        });
      }
    }),

  // Cliente: Buscar reparos das embarcações do cliente
  myRepairs: protectedProcedure
    .input(z.object({
      monthYear: z.string().optional(), // formato: YYYY-MM
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user?.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }

      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        
        // Buscar embarcações do cliente (via client_quotas)
        const vesselsResult = await db.execute(sql`
          SELECT DISTINCT 
            cq.vessel_id,
            CASE 
              WHEN cq.quota_type = 'full' THEN 1.0
              WHEN cq.quota_type = 'half' THEN 0.5
              ELSE 1.0
            END as quota_share
          FROM client_quotas cq
          JOIN allowed_clients ac ON cq.client_id = ac.id
          WHERE ac.email = ${ctx.user.email} AND cq.is_active = 1
        `) as any;
        
        const vessels = (Array.isArray(vesselsResult[0]) ? vesselsResult[0] : vesselsResult);
        if (vessels.length === 0) {
          return [];
        }
        
        const vesselIdList = sql.join(vessels.map((v: any) => sql`${v.vessel_id}`), sql`, `);
        const vesselQuotas = new Map<number, number>(vessels.map((v: any) => [v.vessel_id, parseFloat(v.quota_share)]));
        
        // Construir filtro de data se fornecido
        let dateFilter = sql``;
        if (input.monthYear) {
          const [year, month] = input.monthYear.split('-');
          dateFilter = sql`AND YEAR(ic.created_at) = ${Number(year)} AND MONTH(ic.created_at) = ${Number(month)}`;
        }
        
        // Buscar reparos das embarcações do cliente
        const result = await db.execute(sql`
          SELECT 
            ic.id,
            ic.charge_type as chargeType,
            ic.vessel_id as vesselId,
            ic.vessel_name as vesselName,
            ic.description,
            ic.amount,
            ic.due_date as dueDate,
            CASE
              WHEN ic.payment_status IN ('paid', 'cancelled') THEN ic.payment_status
              WHEN ic.payment_status = 'overdue' THEN 'overdue'
              WHEN ic.payment_status = 'pending' AND ic.due_date < CURDATE() THEN 'overdue'
              ELSE ic.payment_status
            END AS paymentStatus,
            ic.receipt_url as receiptUrl,
            ic.receipt_url as photoUrl,
            ic.asaas_charge_id as asaasChargeId,
            ic.created_at as createdAt,
            ic.client_email as clientEmail
          FROM inspection_charges ic
          WHERE ic.charge_type = 'repair'
            AND ic.vessel_id IN (${vesselIdList})
            AND ic.client_email = ${ctx.user.email}
            ${dateFilter}
          ORDER BY ic.created_at DESC
        `) as any;
        
        const repairs = (Array.isArray(result[0]) ? result[0] : result);
        
        // Calcular valor individual baseado na cota do cliente
        return repairs.map((repair: any) => {
          const quotaShare = vesselQuotas.get(repair.vesselId) ?? 1.0;
          const totalAmount = parseFloat(repair.amount);
          const individualAmount = totalAmount * quotaShare;
          
          return {
            id: repair.id,
            chargeType: repair.chargeType,
            vesselId: repair.vesselId,
            vesselName: repair.vesselName,
            description: repair.description,
            totalAmount,
            individualAmount,
            quotaShare,
            dueDate: repair.dueDate,
            paymentStatus: repair.paymentStatus,
            receiptUrl: repair.receiptUrl,
            photoUrl: repair.photoUrl || repair.receiptUrl,
            asaasChargeId: repair.asaasChargeId,
            createdAt: repair.createdAt,
          };
        });
      } catch (error: any) {
        console.error('[inspectionCharges.myRepairs] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao buscar reparos: ${error.message}` 
        });
      }
    }),

  // Cliente: Solicitar mudança de vencimento
  requestDueDateChange: protectedProcedure
    .input(z.object({
      chargeId: z.number(),
      newDueDate: z.string(), // ISO date string
      reason: z.string().optional(), // Descrição opcional
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }

      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        
        // Verificar se a cobrança pertence ao cliente
        const result = await db.execute(sql`
          SELECT * FROM inspection_charges
          WHERE id = ${input.chargeId} AND client_email = ${ctx.user.email}
        `) as any;

        const charges = (Array.isArray(result[0]) ? result[0] : result);
        if (charges.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Cobrança não encontrada' });
        }

        const charge = charges[0];

        // Inserir solicitação no banco de dados
        const reasonText = input.reason || '';
        const oldDueDateStr = new Date(charge.due_date).toISOString().slice(0, 19).replace('T', ' ');
        const newDueDateStr = new Date(input.newDueDate).toISOString().slice(0, 19).replace('T', ' ');

        await db.execute(sql`
          INSERT INTO due_date_change_requests
          (charge_id, client_email, old_due_date, new_due_date, reason, status, created_at, updated_at)
          VALUES (
            ${input.chargeId},
            ${ctx.user.email},
            ${oldDueDateStr},
            ${newDueDateStr},
            ${reasonText},
            'pending',
            NOW(),
            NOW()
          )
        `);
        
        // Notificar admin
        const { notifyOwner } = await import('../_core/notification');
        const currentDueDate = new Date(charge.due_date).toLocaleDateString('pt-BR');
        const newDueDate = new Date(input.newDueDate).toLocaleDateString('pt-BR');
        
        await notifyOwner({
          title: '📅 Solicitação de Mudança de Vencimento',
          content: `**Cliente:** ${ctx.user.name || ctx.user.email}\n**Cobrança ID:** #${input.chargeId}\n**Embarcação:** ${charge.vessel_name}\n**Valor:** R$ ${parseFloat(charge.amount).toFixed(2)}\n**Vencimento Atual:** ${currentDueDate}\n**Novo Vencimento Solicitado:** ${newDueDate}\n**Motivo:** ${reasonText || 'Não informado'}`,
        });
        
        return {
          success: true,
          message: 'Solicitação enviada com sucesso! O administrador irá analisar seu pedido.',
        };
      } catch (error: any) {
        // Re-lança TRPCErrors intencionais (ex.: NOT_FOUND 'Cobrança não
        // encontrada') sem mascará-los. Só envolve em INTERNAL_SERVER_ERROR
        // genérico os erros inesperados de verdade (ex.: falha de conexão).
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[inspectionCharges.requestDueDateChange] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro ao solicitar mudança de vencimento. Tente novamente.'
        });
      }
    }),

  // Cliente: Estatísticas
  getStats: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user?.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }

      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT
            COUNT(*) as total_charges,
            SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END) as total_paid,
            SUM(CASE WHEN payment_status = 'pending' THEN amount ELSE 0 END) as total_pending,
            SUM(CASE WHEN payment_status = 'overdue' THEN amount ELSE 0 END) as total_overdue
          FROM inspection_charges
          WHERE client_email = ${ctx.user.email}
        `) as any;
        
        const stats = (Array.isArray(result[0]) ? result[0][0] : result[0]);
        
        return {
          totalCharges: parseInt(stats.total_charges) || 0,
          totalPaid: parseFloat(stats.total_paid) || 0,
          totalPending: parseFloat(stats.total_pending) || 0,
          totalOverdue: parseFloat(stats.total_overdue) || 0,
        };
      } catch (error: any) {
        console.error('[inspectionCharges.getStats] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao calcular estatísticas: ${error.message}` 
        });
      }
    }),

  // Admin: Buscar vistorias reprovadas sem cobrança
  getFailedInspectionsForCharges: adminProcedure
    .query(async () => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql.raw(`
          SELECT 
            i.id,
            i.created_at,
            i.vessel_id,
            i.client_name,
            v.name as vessel_name,
            i.inspection_data
          FROM inspections i
          JOIN vessels v ON i.vessel_id = v.id
          LEFT JOIN inspection_charges ic ON ic.inspection_id = i.id
          WHERE i.status = 'rejected' 
            AND ic.id IS NULL
          ORDER BY i.created_at DESC
          LIMIT 50
        `)) as any;
        
        const inspections = (Array.isArray(result[0]) ? result[0] : result).map((row: any) => ({
          ...row,
          inspection_data: typeof row.inspection_data === 'string' ? JSON.parse(row.inspection_data) : row.inspection_data,
        }));
        
        return inspections;
      } catch (error: any) {
        console.error('[inspectionCharges.getFailedInspectionsForCharges] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao buscar vistorias reprovadas: ${error.message}` 
        });
      }
    }),

  // Cliente: Criar cobrança parcelada
  createInstallmentCharge: protectedProcedure
    .input(z.object({
      inspectionId: z.number(),
      totalAmount: z.number().positive(),
      installments: z.number().min(1).max(3), // 1x, 2x ou 3x
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user?.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }

      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        const { inspectionCharges } = await import('../../drizzle/schema');
        
        // Buscar dados da vistoria
        const inspectionResult = await db.execute(sql.raw(`
          SELECT i.*, b.client_email, b.client_name, v.name as vessel_name
          FROM inspections i
          LEFT JOIN bookings b ON i.booking_id = b.id
          JOIN vessels v ON i.vessel_id = v.id
          WHERE i.id = ${input.inspectionId}
        `)) as any;
        
        const inspection = (Array.isArray(inspectionResult[0]) ? inspectionResult[0][0] : inspectionResult[0]);
        if (!inspection) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Vistoria não encontrada' });
        }
        
        // Verificar se já existe cobrança para esta vistoria
        const existingChargeResult = await db.execute(sql.raw(`
          SELECT id FROM inspection_charges WHERE inspection_id = ${input.inspectionId}
        `)) as any;
        
        if ((Array.isArray(existingChargeResult[0]) ? existingChargeResult[0] : existingChargeResult).length > 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Já existe uma cobrança para esta vistoria' });
        }
        
        // Extrair itens reprovados do inspection_data
        const inspectionData = typeof inspection.inspection_data === 'string' 
          ? JSON.parse(inspection.inspection_data) 
          : inspection.inspection_data;
        
        const failedItems = Object.entries(inspectionData)
          .filter(([_, status]) => status === 'REPROVADO')
          .map(([name, status]) => ({ name, status: status as string }));
        
        // Criar cobranças no Asaas (uma para cada parcela)
        const { createCharge } = await import('../_core/asaas');
        const installmentAmount = input.totalAmount / input.installments;
        const createdCharges = [];
        
        for (let i = 0; i < input.installments; i++) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + (i * 30)); // Intervalo de 30 dias
          
          const asaasCharge = await createCharge({
            customer: inspection.client_email,
            billingType: 'PIX',
            value: installmentAmount,
            dueDate: dueDate.toISOString().split('T')[0],
            description: `Conserto de Danos - Parcela ${i + 1}/${input.installments} - Vistoria ${new Date(inspection.created_at).toLocaleDateString('pt-BR')}`,
          });
          
          // Salvar no banco
          await db.insert(inspectionCharges).values({
            chargeType: 'inspection',
            inspectionId: input.inspectionId,
            vesselId: null,
            clientEmail: inspection.client_email,
            vesselName: inspection.vessel_name,
            description: null,
            failedItems: JSON.stringify(failedItems),
            amount: installmentAmount.toString(),
            dueDate: dueDate.toISOString(),
            asaasChargeId: asaasCharge.id,
            paymentStatus: 'pending',
            receiptUrl: null,
          });
          
          createdCharges.push({
            installmentNumber: i + 1,
            amount: installmentAmount,
            dueDate: dueDate.getTime(),
            asaasChargeId: asaasCharge.id,
            pixQrCode: asaasCharge.pixQrCode,
            pixCopyPaste: asaasCharge.pixCopyPaste,
          });
        }
        
        return { 
          success: true,
          totalAmount: input.totalAmount,
          installments: input.installments,
          charges: createdCharges,
        };
      } catch (error: any) {
        console.error('[inspectionCharges.createInstallmentCharge] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao criar cobrança parcelada: ${error.message}` 
        });
      }
    }),

  // Cliente: Gerar pagamento PIX (vistorias e reparos)
  generatePayment: protectedProcedure
    .input(z.object({
      chargeIds: z.array(z.number()).min(1, 'Selecione pelo menos uma cobrança'),
      installments: z.number().min(1).max(3).optional(), // Parcelamento (1x, 2x, 3x) - apenas para reparos
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user?.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }

      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        const idsSQL = sql.join(input.chargeIds.map((id: number) => sql`${id}`), sql`, `);

        // Buscar cobranças
        const result = await db.execute(sql`
          SELECT * FROM inspection_charges
          WHERE id IN (${idsSQL}) AND client_email = ${ctx.user.email}
        `) as any;
        
        const charges = (Array.isArray(result[0]) ? result[0] : result);
        if (charges.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhuma cobrança encontrada' });
        }
        
        // Verificar se todas são reparos (para parcelamento)
        const allRepairs = charges.every((c: any) => c.charge_type === 'repair');
        const installments = input.installments || 1;
        
        if (installments > 1 && !allRepairs) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Parcelamento disponível apenas para reparos' 
          });
        }
        
        // Calcular valor total
        const { getCharge } = await import('../_core/asaas');
        let totalAmount = 0;
        
        for (const charge of charges) {
          if (charge.asaas_charge_id) {
            const asaasCharge = await getCharge(charge.asaas_charge_id);
            totalAmount += parseFloat(asaasCharge.value);
          } else {
            totalAmount += parseFloat(charge.amount);
          }
        }
        
        // Se parcelamento, criar múltiplas cobranças no Asaas
        if (installments > 1) {
          const { createCharge, getOrCreateCustomer, formatDateForAsaas } = await import('../_core/asaas');
          
          // Buscar ou criar cliente no Asaas
          const customer = await getOrCreateCustomer({
            name: ctx.user.name || ctx.user.email,
            email: ctx.user.email,
          });
          
          // Calcular valor de cada parcela
          const installmentValue = totalAmount / installments;
          const installmentCharges = [];
          
          // Criar cobrança para cada parcela
          for (let i = 0; i < installments; i++) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + (i * 30)); // 30 dias entre parcelas
            
            const asaasCharge = await createCharge({
              customer: customer.id,
              billingType: 'PIX',
              value: installmentValue,
              dueDate: formatDateForAsaas(dueDate),
              description: `Parcela ${i + 1}/${installments} - Reparos`,
              externalReference: `repair-installment-${i + 1}-${Date.now()}`,
            });
            
            installmentCharges.push({
              installment: i + 1,
              value: installmentValue,
              dueDate: formatDateForAsaas(dueDate),
              asaasChargeId: asaasCharge.id,
              pixQrCode: asaasCharge.encodedImage || null,
              pixCopyPaste: asaasCharge.payload || null,
            });
          }
          
          // Atualizar cobranças com asaas_charge_id da primeira parcela
          const firstInstallmentId = installmentCharges[0].asaasChargeId;
          for (const charge of charges) {
            await db.execute(sql.raw(`
              UPDATE inspection_charges
              SET asaas_charge_id = '${firstInstallmentId}'
              WHERE id = ${charge.id}
            `));
          }
          
          console.log('[inspectionCharges.generatePayment] Retornando dados parcelados:', {
            totalAmount,
            installmentsCount: installmentCharges.length,
            hasPixQrCode: !!installmentCharges[0].pixQrCode,
            hasPixCopyPaste: !!installmentCharges[0].pixCopyPaste,
          });
          
          return {
            totalAmount,
            installments: installmentCharges,
            pixQrCode: installmentCharges[0].pixQrCode,
            pixCopyPaste: installmentCharges[0].pixCopyPaste,
          };
        }
        
        // Pagamento à vista (sem parcelamento)
        const pixData: any = {};
        
        // Buscar QR Code da primeira cobrança com asaas_charge_id
        for (const charge of charges) {
          if (charge.asaas_charge_id && !pixData.qrCode) {
            const { getPixQrCode } = await import('../_core/asaas');
            const pixQrData = await getPixQrCode(charge.asaas_charge_id);
            
            if (pixQrData.encodedImage) {
              pixData.qrCode = pixQrData.encodedImage;
              pixData.copyPaste = pixQrData.payload;
              console.log('[inspectionCharges.generatePayment] QR Code obtido com sucesso');
              break; // Encontrou QR Code, pode parar
            }
          }
        }
        
        // Se não tem PIX, criar cobrança única no Asaas
        if (!pixData.qrCode) {
          const { createCharge, getOrCreateCustomer, formatDateForAsaas } = await import('../_core/asaas');
          
          const customer = await getOrCreateCustomer({
            name: ctx.user.name || ctx.user.email,
            email: ctx.user.email,
          });
          
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 1); // Vencimento: 1 dia
          
          const asaasCharge = await createCharge({
            customer: customer.id,
            billingType: 'PIX',
            value: totalAmount,
            dueDate: formatDateForAsaas(dueDate),
            description: allRepairs ? 'Pagamento de Reparos' : 'Pagamento de Vistorias',
            externalReference: `charges-${Date.now()}`,
          });
          
          pixData.qrCode = asaasCharge.encodedImage || null;
          pixData.copyPaste = asaasCharge.payload || null;
          
          // Atualizar cobranças com asaas_charge_id
          for (const charge of charges) {
            await db.execute(sql.raw(`
              UPDATE inspection_charges
              SET asaas_charge_id = '${asaasCharge.id}'
              WHERE id = ${charge.id}
            `));
          }
        }
        
        console.log('[inspectionCharges.generatePayment] Retornando dados:', {
          totalAmount,
          hasPixQrCode: !!pixData.qrCode,
          hasPixCopyPaste: !!pixData.copyPaste,
          pixQrCodeLength: pixData.qrCode?.length || 0,
          pixCopyPasteLength: pixData.copyPaste?.length || 0,
        });
        
        return {
          totalAmount,
          pixQrCode: pixData.qrCode || null,
          pixCopyPaste: pixData.copyPaste || null,
        };
      } catch (error: any) {
        console.error('[inspectionCharges.generatePayment] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao gerar pagamento: ${error.message}` 
        });
      }
    }),
});
