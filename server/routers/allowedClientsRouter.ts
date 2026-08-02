/**
 * Allowed Clients Router — gestão de clientes autorizados (admin)
 *
 * Extraído de server/routers.ts (Story 40, SYS-03), montado em appRouter sob a
 * mesma chave de antes.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import { sendWelcomeEmail } from "../_core/welcomeEmail";
import * as db from "../db";

// Allowed Clients Management (Admin only)
export const allowedClientsRouter = router({
  list: adminProcedure.query(async () => {
    return await db.getAllowedClients();
  }),

  create: adminProcedure
    .input(z.object({
      email: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }),
      name: z.string().min(1),
      phone: z.string().optional(),
      cpfCnpj: z.string().optional(),
      rg: z.string().optional(),
      address: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      state: z.string().max(2).optional(),
      zipCode: z.string().optional(),
      quotas: z.array(z.object({
        vesselId: z.number(),
        quotaNumber: z.number().min(1).max(10), // 1-7 para lancha, 1-6 para jetski
        quotaType: z.enum(["full", "half"]),
      })).optional().default([]),
    }))
    .mutation(async ({ input }) => {
      const existing = await db.getAllowedClientByEmail(input.email);
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Email já cadastrado' });
      }
      
      // Validate quota numbers based on vessel quotaCount
      for (const quota of input.quotas) {
        const vessel = await db.getVesselById(quota.vesselId);
        if (!vessel) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Embarcação não encontrada' });
        }
        
        const maxQuota = vessel.quotaCount || 10;
        if (quota.quotaNumber < 1 || quota.quotaNumber > maxQuota) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: `Número de cota inválido. Permitido: 1-${maxQuota}` 
          });
        }
      }
      
      // Create client
      const result = await db.createAllowedClient({
        email: input.email,
        name: input.name,
        phone: input.phone,
        cpfCnpj: input.cpfCnpj,
        rg: input.rg,
        address: input.address,
        neighborhood: input.neighborhood,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
      });
      
      // Get the created client ID
      const client = await db.getAllowedClientByEmail(input.email);
      if (!client) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      
      // Create quotas
      const quotaNames: string[] = [];
      for (const quota of input.quotas) {
        await db.createClientQuota({
          clientId: client.id,
          vesselId: quota.vesselId,
          quotaNumber: quota.quotaNumber,
          quotaType: quota.quotaType,
        });
        
        // Get vessel name for welcome email
        const vessel = await db.getVesselById(quota.vesselId);
        if (vessel) {
          quotaNames.push(`${vessel.name} - Cota ${quota.quotaNumber}`);
        }
      }
      
      // Send welcome email only if there are quotas
      if (quotaNames.length > 0) {
        await sendWelcomeEmail({
          clientName: input.name,
          clientEmail: input.email,
          quotaName: quotaNames.join(', '),
        });
      }

      return { success: true, id: client.id };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      email: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }).optional(),
      name: z.string().min(1).optional(),
      phone: z.string().optional(),
      cpfCnpj: z.string().optional(),
      rg: z.string().optional(),
      address: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      state: z.string().max(2).optional(),
      zipCode: z.string().optional(),
      contractUrl: z.string().optional(),
      contract2Url: z.string().optional(),
      documentUrl: z.string().optional(),
      isActive: z.boolean().optional(),
      quotas: z.array(z.object({
        vesselId: z.number(),
        quotaNumber: z.number().min(1).max(10),
        quotaType: z.enum(["full", "half"]),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, quotas, isActive, ...data } = input;
      
      // Update client basic info
      await db.updateAllowedClient(id, { ...data, isActive: isActive !== undefined ? (isActive ? 1 : 0) : undefined });
      
      // Update quotas if provided
      if (quotas) {
        // Delete existing quotas
        await db.deleteClientQuotasByClientId(id);
        
        // Create new quotas
        for (const quota of quotas) {
          await db.createClientQuota({
            clientId: id,
            vesselId: quota.vesselId,
            quotaNumber: quota.quotaNumber,
            quotaType: quota.quotaType,
          });
        }
      }
      
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteAllowedClient(input.id);
      return { success: true };
    }),

  deleteDocument: adminProcedure
    .input(z.object({
      clientId: z.number(),
      documentType: z.enum(["contract", "contract2", "document"]),
    }))
    .mutation(async ({ input }) => {
      const { clientId, documentType } = input;
      
      // Map document type to database column
      const columnMap = {
        contract: "contractUrl",
        contract2: "contract2Url",
        document: "documentUrl",
      };
      
      const column = columnMap[documentType];
      
      // Update client to set document URL to null
      await db.updateAllowedClient(clientId, { [column]: null });
      
      return { success: true };
    }),

  generateReport: adminProcedure
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ input }) => {
      // Buscar dados do cliente
      const client = await db.getAllowedClientById(input.clientId);
      if (!client) {
        throw new TRPCError({ 
          code: 'NOT_FOUND', 
          message: 'Cliente não encontrado' 
        });
      }

      // Buscar cotas do cliente
      const quotas = await db.getClientQuotasByClientId(input.clientId);
      const quotasWithVessels = await Promise.all(
        quotas.map(async (quota) => {
          const vessel = await db.getVesselById(quota.vesselId);
          return {
            vesselName: vessel?.name || 'Embarcação desconhecida',
            quotaNumber: quota.quotaNumber,
            quotaType: quota.quotaType,
          };
        })
      );

      // Gerar PDF
      const { generateClientReport } = await import('../_core/clientReportPDF');
      const pdfBuffer = await generateClientReport({
        name: client.name,
        email: client.email,
        phone: client.phone || undefined,
        quotas: quotasWithVessels,
        contractUrl: client.contractUrl || undefined,
        contract2Url: client.contract2Url || undefined,
        documentUrl: client.documentUrl || undefined,
      });

      // Retornar PDF em base64
      const base64 = pdfBuffer.toString('base64');
      return { 
        success: true, 
        pdf: base64,
        filename: `cliente-${client.name.replace(/\s+/g, '-')}-${Date.now()}.pdf`
      };
    }),
});
