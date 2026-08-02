/**
 * Maintenances Router — domínio de manutenções de embarcações
 *
 * Extraído de server/routers.ts (Story 40, SYS-03) sem alteração de
 * comportamento: montado em appRouter sob a mesma chave de antes
 * (maintenances), mantendo o contrato da API idêntico para o frontend.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminProcedure, employeeProcedure } from "../_core/trpc";
import {
  notifyClientMaintenanceCancellation,
  notifyAdminMaintenanceCancellations,
  notifyAdminMaintenanceStatusChange,
  notifyClientsMaintenanceStatusChange,
} from "../_core/emailNotification";
import { notifyOwner } from "../_core/notification";
import * as db from "../db";

// Maintenances (Admin only)
export const maintenancesRouter = router({
  // Endpoint público para buscar manutenções ativas (para calendário)
  getActive: publicProcedure
    .input(z.object({
      startDate: z.number(),
      endDate: z.number(),
    }))
    .query(async ({ input }) => {
      const allMaintenances = await db.getMaintenances();
      
      // Filtrar apenas manutenções ativas no período
      return allMaintenances.filter((m: any) => {
        if (m.status === 'cancelled' || m.status === 'completed') return false;
        
        // Verificar se há sobreposição de datas (usar camelCase do Drizzle)
        return m.startDate <= input.endDate && m.endDate >= input.startDate;
      });
    }),

  list: employeeProcedure.query(async () => {
    return await db.getMaintenances();
  }),

  getById: employeeProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await db.getMaintenanceById(input.id);
    }),

  getByVessel: employeeProcedure
    .input(z.object({ vesselId: z.number() }))
    .query(async ({ input }) => {
      return await db.getMaintenancesByVesselId(input.vesselId);
    }),

  checkConflicts: adminProcedure
    .input(z.object({
      vesselId: z.number(),
      startDate: z.number(),
      endDate: z.number(),
    }))
    .query(async ({ input }) => {
      // Buscar reservas ativas no período
      const allBookings = await db.getAllBookings();
      
      // Normalizar datas para meia-noite
      const startNormalized = new Date(input.startDate);
      startNormalized.setHours(0, 0, 0, 0);
      const endNormalized = new Date(input.endDate);
      endNormalized.setHours(23, 59, 59, 999);
      
      const conflictingBookings = allBookings.filter((booking: any) => {
        // Apenas reservas confirmadas da embarcação selecionada
        if (booking.vesselId !== input.vesselId) return false;
        if (booking.status === 'cancelled' || booking.status === 'used') return false;
        
        // Verificar se a data da reserva está no período de manutenção
        const bookingDate = new Date(booking.bookingDate);
        bookingDate.setHours(0, 0, 0, 0);
        
        return bookingDate >= startNormalized && bookingDate <= endNormalized;
      });
      
      return {
        hasConflicts: conflictingBookings.length > 0,
        conflictingBookings: conflictingBookings.map((b: any) => ({
          id: b.id,
          clientName: b.clientName,
          clientEmail: b.clientEmail,
          vesselName: b.vesselName,
          bookingDate: b.bookingDate,
        })),
      };
    }),

  create: employeeProcedure
    .input(z.object({
      vesselId: z.number(),
      startDate: z.number(),
      endDate: z.number(),
      description: z.string().optional(),
      status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get vessel info
      const vessel = await db.getVesselById(input.vesselId);
      if (!vessel) {
        throw new TRPCError({ 
          code: 'NOT_FOUND', 
          message: 'Embarcação não encontrada' 
        });
      }

      // Validate dates
      if (input.startDate >= input.endDate) {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: 'Data de início deve ser anterior à data de término' 
        });
      }

      // Buscar reservas conflitantes
      const allBookings = await db.getAllBookings();
      
      // Normalizar datas usando UTC para evitar problemas de timezone
      // O frontend envia timestamps com horário local (GMT-3), então precisamos usar UTC
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      

      // Usar Date.UTC para criar datas normalizadas em UTC
      const startNormalized = new Date(Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
        0, 0, 0, 0
      ));
      
      const endNormalized = new Date(Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth(),
        endDate.getUTCDate(),
        23, 59, 59, 999
      ));
      

      const conflictingBookings = allBookings.filter((booking: any) => {
        if (booking.vesselId !== input.vesselId) return false;
        if (booking.status === 'cancelled' || booking.status === 'used') return false;
        
        // Normalizar bookingDate usando UTC para evitar problemas de timezone
        const bookingDateObj = new Date(booking.bookingDate);
        const bookingDate = new Date(Date.UTC(
          bookingDateObj.getUTCFullYear(),
          bookingDateObj.getUTCMonth(),
          bookingDateObj.getUTCDate(),
          0, 0, 0, 0
        ));
        
        return bookingDate >= startNormalized && bookingDate <= endNormalized;
      });

      // Criar manutenção
      const maintenanceData: any = {
        vesselId: input.vesselId,
        vesselName: vessel.name,
        startDate: new Date(input.startDate).getTime(),
        endDate: new Date(input.endDate).getTime(),
        description: input.description || '',
        status: input.status || 'scheduled',
        createdBy: ctx.user.id, // Salvar ID do usuário logado (admin ou funcionário)
      };
      
      const created = await db.createMaintenance(maintenanceData);

      // Cancelar reservas conflitantes
      const cancelledBookings = [];
      for (const booking of conflictingBookings) {
        await db.updateBooking(booking.id, { status: 'cancelled' });
        cancelledBookings.push({
          id: booking.id,
          clientName: booking.clientName,
          clientEmail: booking.clientEmail,
          vesselName: booking.vesselName,
          bookingDate: booking.bookingDate,
        });
      }

      // Enviar notificações para clientes afetados
      for (const booking of cancelledBookings) {
        await notifyClientMaintenanceCancellation({
          clientName: booking.clientName,
          clientEmail: booking.clientEmail,
          vesselName: booking.vesselName,
          bookingDate: new Date(booking.bookingDate),
          maintenanceStartDate: new Date(input.startDate),
          maintenanceEndDate: new Date(input.endDate),
          maintenanceDescription: input.description,
        });
      }

      // Enviar notificação para admin (sempre, independente de cancelamentos)
      if (cancelledBookings.length > 0) {
        // Notificar sobre reservas canceladas
        await notifyAdminMaintenanceCancellations({
          vesselName: vessel.name,
          maintenanceStartDate: new Date(input.startDate),
          maintenanceEndDate: new Date(input.endDate),
          cancelledBookings: cancelledBookings.map(b => ({
            clientName: b.clientName,
            clientEmail: b.clientEmail,
            bookingDate: new Date(b.bookingDate),
          })),
        });
      } else {
        // Notificar sobre criação de manutenção sem conflitos
        const startStr = new Date(input.startDate).toLocaleDateString('pt-BR');
        const endStr = new Date(input.endDate).toLocaleDateString('pt-BR');
        await notifyOwner({
          title: "🔧 Nova Manutenção Agendada",
          content: `
**Embarcação:** ${vessel.name}
**Período:** ${startStr} a ${endStr}
**Descrição:** ${input.description || 'Sem descrição'}
**Status:** ${input.status || 'scheduled'}

Nenhuma reserva foi afetada.
          `.trim()
        });
      }

      return { 
        success: true,
        id: created.id,
        cancelledCount: cancelledBookings.length,
        cancelledBookings 
      };
    }),

  update: employeeProcedure
    .input(z.object({
      id: z.number(),
      vesselId: z.number().optional(),
      startDate: z.number().optional(),
      endDate: z.number().optional(),
      description: z.string().optional(),
      status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      
      // Get current maintenance to check if status changed
      const currentMaintenance = await db.getMaintenanceById(id);
      if (!currentMaintenance) {
        throw new TRPCError({ 
          code: 'NOT_FOUND', 
          message: 'Manutenção não encontrada' 
        });
      }
      
      // Determine vessel info
      let vesselName = currentMaintenance.vesselName;
      let vesselId = data.vesselId || currentMaintenance.vesselId;
      
      // If vessel changed, update vessel name
      if (data.vesselId && data.vesselId !== currentMaintenance.vesselId) {
        const vessel = await db.getVesselById(data.vesselId);
        if (!vessel) {
          throw new TRPCError({ 
            code: 'NOT_FOUND', 
            message: 'Embarcação não encontrada' 
          });
        }
        vesselName = vessel.name;
        (data as any).vesselName = vessel.name;
      }

      // Check if dates or vessel changed - need to check for conflicting bookings
      const datesChanged = (data.startDate && data.startDate !== currentMaintenance.startDate) ||
                          (data.endDate && data.endDate !== currentMaintenance.endDate);
      const vesselChanged = data.vesselId && data.vesselId !== currentMaintenance.vesselId;
      
      let cancelledBookings: any[] = [];
      
      // If dates or vessel changed, check for conflicting bookings and cancel them
      if (datesChanged || vesselChanged) {
        const newStartDate = data.startDate || currentMaintenance.startDate;
        const newEndDate = data.endDate || currentMaintenance.endDate;
        
        // Validate dates
        if (newStartDate >= newEndDate) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Data de início deve ser anterior à data de término' 
          });
        }
        
        // Buscar reservas conflitantes no novo período
        const allBookings = await db.getAllBookings();
        const startNormalized = new Date(newStartDate);
        startNormalized.setHours(0, 0, 0, 0);
        const endNormalized = new Date(newEndDate);
        endNormalized.setHours(23, 59, 59, 999);
        
        const conflictingBookings = allBookings.filter((booking: any) => {
          if (booking.vesselId !== vesselId) return false;
          if (booking.status === 'cancelled' || booking.status === 'used') return false;
          
          const bookingDate = new Date(booking.bookingDate);
          bookingDate.setHours(0, 0, 0, 0);
          
          return bookingDate >= startNormalized && bookingDate <= endNormalized;
        });
        
        // Cancelar reservas conflitantes
        for (const booking of conflictingBookings) {
          await db.updateBooking(booking.id, { status: 'cancelled' });
          cancelledBookings.push({
            id: booking.id,
            clientName: booking.clientName,
            clientEmail: booking.clientEmail,
            vesselName: booking.vesselName,
            bookingDate: booking.bookingDate,
          });
        }
        
        // Enviar notificações para clientes afetados
        for (const booking of cancelledBookings) {
          await notifyClientMaintenanceCancellation({
            clientName: booking.clientName,
            clientEmail: booking.clientEmail,
            vesselName: booking.vesselName,
            bookingDate: new Date(booking.bookingDate),
            maintenanceStartDate: new Date(newStartDate),
            maintenanceEndDate: new Date(newEndDate),
            maintenanceDescription: data.description || currentMaintenance.description,
          });
        }
        
        // Enviar notificação para admin sobre edição e cancelamentos
        if (cancelledBookings.length > 0) {
          await notifyAdminMaintenanceCancellations({
            vesselName: vesselName,
            maintenanceStartDate: new Date(newStartDate),
            maintenanceEndDate: new Date(newEndDate),
            cancelledBookings: cancelledBookings.map(b => ({
              clientName: b.clientName,
              clientEmail: b.clientEmail,
              bookingDate: new Date(b.bookingDate),
            })),
          });
        } else {
          // Notificar sobre edição de manutenção sem conflitos
          const startStr = new Date(newStartDate).toLocaleDateString('pt-BR');
          const endStr = new Date(newEndDate).toLocaleDateString('pt-BR');
          const oldStartStr = new Date(currentMaintenance.startDate).toLocaleDateString('pt-BR');
          const oldEndStr = new Date(currentMaintenance.endDate).toLocaleDateString('pt-BR');
          await notifyOwner({
            title: "🔧 Manutenção Editada",
            content: `
**Embarcação:** ${vesselName}
**Período Anterior:** ${oldStartStr} a ${oldEndStr}
**Novo Período:** ${startStr} a ${endStr}
**Descrição:** ${data.description || currentMaintenance.description || 'Sem descrição'}

Nenhuma reserva foi afetada.
            `.trim()
          });
        }
      }

      // Update the maintenance record
      await db.updateMaintenance(id, data);
      
      // If only status changed (without date changes), send status notifications
      if (data.status && data.status !== currentMaintenance.status && !datesChanged && !vesselChanged) {
        // Notify admin
        await notifyAdminMaintenanceStatusChange({
          vesselName: currentMaintenance.vesselName,
          oldStatus: currentMaintenance.status,
          newStatus: data.status,
          startDate: new Date(currentMaintenance.startDate),
          endDate: new Date(currentMaintenance.endDate),
          description: currentMaintenance.description || undefined,
        });
        
        // Get affected bookings (during maintenance period)
        const allBookings = await db.getAllBookings();
        const affectedBookings = allBookings.filter(b => 
          b.vesselId === currentMaintenance.vesselId &&
          b.status === 'confirmed' &&
          new Date(b.bookingDate) >= new Date(currentMaintenance.startDate) &&
          new Date(b.bookingDate) <= new Date(currentMaintenance.endDate)
        );
        
        // Notify affected clients
        if (affectedBookings.length > 0) {
          await notifyClientsMaintenanceStatusChange({
            vesselName: currentMaintenance.vesselName,
            newStatus: data.status,
            startDate: new Date(currentMaintenance.startDate),
            endDate: new Date(currentMaintenance.endDate),
            affectedClients: affectedBookings.map(b => ({
              clientName: b.clientName,
              clientEmail: b.clientEmail,
              bookingDate: new Date(b.bookingDate),
            })),
          });
        }
      }
      
      return { 
        success: true,
        cancelledCount: cancelledBookings.length,
        cancelledBookings 
      };
    }),

  delete: employeeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteMaintenance(input.id);
      return { success: true };
    }),
});
