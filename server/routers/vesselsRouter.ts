/**
 * Vessels Router — gestão de embarcações
 *
 * Extraído de server/routers.ts (Story 40, SYS-03), montado em appRouter sob a
 * mesma chave de antes.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import * as db from "../db";

// Vessels Management
export const vesselsRouter = router({
  list: publicProcedure.query(async () => {
    return await db.getActiveVessels();
  }),

  listAll: adminProcedure.query(async () => {
    return await db.getVessels();
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      type: z.enum(["lancha", "jetski"]),
      description: z.string().optional(),
      imageUrl: z.string().optional(),
      capacity: z.number().optional(),
      quotaCount: z.number().min(1).max(10),
    }))
    .mutation(async ({ input }) => {
      await db.createVessel(input);
      return { success: true };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      type: z.enum(["lancha", "jetski"]).optional(),
      description: z.string().optional(),
      imageUrl: z.string().optional(),
      capacity: z.number().optional(),
      quotaCount: z.number().min(1).max(10).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, isActive, ...data } = input;
      await db.updateVessel(id, { ...data, isActive: isActive !== undefined ? (isActive ? 1 : 0) : undefined });
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteVessel(input.id);
      return { success: true };
    }),

  // Get vessels where client has quotas (for document access)
  getMyVessels: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.email) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Email não encontrado' });
    }

    // Get client by email
    const client = await db.getAllowedClientByEmail(ctx.user.email);
    if (!client) {
      return [];
    }

    // Get vessels where client has active quotas
    const quotas = await db.getClientQuotasByClientId(client.id);
    const vesselIds = Array.from(new Set(quotas.map(q => q.vesselId)));
    
    const vessels = [];
    for (const vesselId of vesselIds) {
      const vessel = await db.getVesselById(vesselId);
      if (vessel) {
        vessels.push({
          id: vessel.id,
          name: vessel.name,
          type: vessel.type,
          documentUrl: vessel.documentUrl,
          extraDocumentUrl: vessel.extraDocumentUrl,
        });
      }
    }
    
    return vessels;
  }),

  // Update vessel documents (admin only)
  updateDocuments: adminProcedure
    .input(z.object({
      id: z.number(),
      documentUrl: z.string().optional(),
      extraDocumentUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateVessel(id, data);
      return { success: true };
    }),

  // Delete vessel document (admin only)
  deleteDocument: adminProcedure
    .input(z.object({
      id: z.number(),
      documentType: z.enum(['document', 'extraDocument']),
    }))
    .mutation(async ({ input }) => {
      const updateData: Record<string, null> = {};
      if (input.documentType === 'document') {
        updateData.documentUrl = null;
      } else {
        updateData.extraDocumentUrl = null;
      }
      await db.updateVessel(input.id, updateData);
      return { success: true };
    }),
});
