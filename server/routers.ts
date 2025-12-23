import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { webhookRouter } from "./webhookRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { notifyNewBooking, notifyBookingCancellation, notifyBookingUsed, notifyClientMaintenanceCancellation, notifyAdminMaintenanceCancellations, notifyClientBookingConfirmation, notifyClientBookingCancellation, notifyAdminMaintenanceStatusChange, notifyClientsMaintenanceStatusChange } from "./_core/emailNotification";
import { notifyOwner } from "./_core/notification";
import { sendWelcomeEmail } from "./_core/welcomeEmail";
import * as db from "./db";
import * as stats from "./stats";
import * as weather from "./weather";
import * as systemSettings from "./systemSettings";

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

// Allowed client procedure - checks if user email is in allowed clients
const allowedClientProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role === 'admin') {
    return next({ ctx });
  }
  
  if (!ctx.user.email) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Email não encontrado' });
  }

  const allowedClient = await db.getAllowedClientByEmail(ctx.user.email);
  if (!allowedClient || !allowedClient.isActive) {
    throw new TRPCError({ 
      code: 'FORBIDDEN', 
      message: 'Seu email não está autorizado a fazer reservas. Entre em contato com o administrador.' 
    });
  }

  return next({ ctx });
});

// Employee procedure - checks if user is employee or admin
const employeeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'employee' && ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Employee access required' });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  webhooks: webhookRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    updateName: protectedProcedure
      .input(z.object({ name: z.string().min(1, "Nome é obrigatório") }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserName(ctx.user.id, input.name);
        return { success: true };
      }),
  }),

  // Allowed Clients Management (Admin only)
  allowedClients: router({
    list: adminProcedure.query(async () => {
      return await db.getAllowedClients();
    }),

    create: adminProcedure
      .input(z.object({
        email: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }),
        name: z.string().min(1),
        phone: z.string().optional(),
        quotas: z.array(z.object({
          vesselId: z.number(),
          quotaNumber: z.number().min(1).max(10), // 1-7 para lancha, 1-6 para jetski
          quotaType: z.enum(["full", "half"]),
        })),
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
        
        // Send welcome email
        await sendWelcomeEmail({
          clientName: input.name,
          clientEmail: input.email,
          quotaName: quotaNames.join(', '),
        });
        
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        email: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }).optional(),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
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
        const { id, quotas, ...data } = input;
        
        // Update client basic info
        await db.updateAllowedClient(id, data);
        
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
        const { generateClientReport } = await import('./_core/clientReportPDF');
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
  }),

  // Vessels Management
  vessels: router({
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
        const { id, ...data } = input;
        await db.updateVessel(id, data);
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
  }),

  // Bookings
  bookings: router({
    // Get recent bookings for fuel registration and inspections (Admin and Employee)
    getRecent: publicProcedure
      .input(z.object({ 
        days: z.number().optional(), // Se não fornecido, retorna todas
        includeUsed: z.boolean().default(false), // Incluir reservas já usadas
        onlyUsed: z.boolean().default(false) // Apenas reservas já usadas (para abastecimento)
      }))
      .query(async ({ input, ctx }) => {
        // Validar que apenas admin ou employee podem acessar
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado. Apenas funcionários e administradores podem acessar.' });
        }
        
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        let query = `SELECT 
          b.id,
          b.vessel_id as vesselId,
          b.booking_date as startTime,
          b.booking_date as endTime,
          b.status,
          b.client_name as clientName,
          b.client_email as clientEmail,
          b.vessel_name as vesselName
        FROM bookings b
        WHERE `;
        
        const params: any[] = [];
        
        // Se onlyUsed for true, retorna apenas reservas utilizadas (para abastecimento)
        if (input.onlyUsed) {
          query += `b.status = 'used'`;
        } else {
          query += `(b.status = 'confirmed' OR b.status = 'used')`;
        }
        
        // Se days for fornecido, filtra por período
        if (input.days !== undefined) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - input.days);
          query += ' AND b.booking_date >= ?';
          params.push(cutoffDate.getTime());
        }
        
        query += ' ORDER BY b.booking_date DESC';
        
        // Para abastecimento, limita a 6 registros
        if (input.onlyUsed) {
          query += ' LIMIT 6';
        }

        const { sql: sqlTag } = await import('drizzle-orm');
        const result = await db.execute(sqlTag.raw(query)) as any;
        return (Array.isArray(result[0]) ? result[0] : result) as any[];
      }),

    // Get user's own bookings
    myBookings: allowedClientProcedure.query(async ({ ctx }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      return await db.getBookingsByEmail(ctx.user.email);
    }),

    // Get user's quota information by vessel
    myQuota: allowedClientProcedure
      .input(z.object({
        vesselId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (!ctx.user.email) {
          throw new TRPCError({ code: 'UNAUTHORIZED' });
        }
        
        const client = await db.getAllowedClientByEmail(ctx.user.email);
        if (!client) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado' });
        }
        
        // If no vessel specified, return all quotas
        if (!input?.vesselId) {
          const allQuotas = await db.getClientQuotasByClientId(client.id);
          let maxBookings = 0;
          for (const quota of allQuotas) {
            maxBookings += quota.quotaType === 'full' ? 2 : 1;
          }
          return {
            quotas: allQuotas,
            maxBookings,
            hasQuota: allQuotas.length > 0,
          };
        }
        
        // Get quotas for this vessel
        const quotas = await db.getClientQuotaByVessel(client.id, input.vesselId);
        
        // Calculate max bookings: full = 2 per quota, half = 1 per quota
        let maxBookings = 0;
        for (const quota of quotas) {
          maxBookings += quota.quotaType === 'full' ? 2 : 1;
        }
        
        return {
          quotas,
          maxBookings,
          hasQuota: quotas.length > 0,
        };
      }),
    
    // Get all user's quotas
    myQuotas: allowedClientProcedure.query(async ({ ctx }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      return await db.getClientQuotasByEmail(ctx.user.email);
    }),

    // Get all bookings (admin only)
    listAll: adminProcedure
      .input(z.object({
        timeFilter: z.enum(["future", "past"]).default("future"),
      }).optional())
      .query(async ({ input }) => {
        const dbInstance = await import('./db').then(m => m.getDb());
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql: sqlTag } = await import('drizzle-orm');
        const now = Date.now();
        const timeFilter = input?.timeFilter || "future";

        let query = `
          SELECT 
            b.id,
            b.client_email as clientEmail,
            b.client_name as clientName,
            b.vessel_id as vesselId,
            b.vessel_name as vesselName,
            b.booking_date as bookingDate,
            b.status,
            b.notes,
            b.created_at as createdAt,
            b.updated_at as updatedAt
          FROM bookings b
          WHERE `;

        if (timeFilter === "future") {
          // Futuras: data >= hoje, ordenadas da mais próxima
          query += `b.booking_date >= ${now} ORDER BY b.booking_date ASC`;
        } else {
          // Passadas: data < hoje, ordenadas da mais recente
          query += `b.booking_date < ${now} ORDER BY b.booking_date DESC`;
        }

        const result = await dbInstance.execute(sqlTag.raw(query)) as any;
        return (Array.isArray(result[0]) ? result[0] : result) as any[];
      }),

    // Get bookings by date range (for calendar availability)
    getByDateRange: allowedClientProcedure
      .input(z.object({
        startDate: z.number(),
        endDate: z.number(),
      }))
      .query(async ({ input }) => {
        return await db.getBookingsByDateRange(input.startDate, input.endDate);
      }),
    
    // Get all bookings for a specific month (for employee calendar)
    getByMonth: publicProcedure
      .input(z.object({
        year: z.number(),
        month: z.number(), // 1-12
      }))
      .query(async ({ input, ctx }) => {
        // Only allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        
        // Calculate start and end of month in UTC
        const startDate = new Date(Date.UTC(input.year, input.month - 1, 1, 0, 0, 0)).getTime();
        const endDate = new Date(Date.UTC(input.year, input.month, 0, 23, 59, 59)).getTime();
        
        const query = `SELECT 
          b.id,
          b.vesselId,
          b.bookingDate as booking_date,
          b.startTime,
          b.endTime,
          b.status,
          b.notes,
          u.name as client_name,
          u.email as client_email,
          v.name as vessel_name
        FROM bookings b
        JOIN users u ON b.userId = u.id
        JOIN vessels v ON b.vesselId = v.id
        WHERE b.bookingDate >= ? AND b.bookingDate <= ?
        ORDER BY b.bookingDate ASC`;
        
        const { sql: sqlTag } = await import('drizzle-orm');
        const result = await db.execute(sqlTag.raw(query)) as any;
        return (Array.isArray(result[0]) ? result[0] : result) as any[];
      }),

    // Create booking with validation
    create: allowedClientProcedure
      .input(z.object({
        vesselId: z.number(),
        bookingDate: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.email || !ctx.user.name) {
          throw new TRPCError({ code: 'UNAUTHORIZED' });
        }

        // Check if date is a Monday (0 = Sunday, 1 = Monday)
        // Use UTC to avoid timezone issues
        const date = new Date(input.bookingDate);
        const dayOfWeek = date.getUTCDay();
        if (dayOfWeek === 1) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Reservas não são permitidas às segundas-feiras' 
          });
        }

        // Check if date is in the past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (input.bookingDate < today.getTime()) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Não é possível reservar datas passadas' 
          });
        }

        // Check if vessel exists and is active
        const vessel = await db.getVesselById(input.vesselId);
        if (!vessel || !vessel.isActive) {
          throw new TRPCError({ 
            code: 'NOT_FOUND', 
            message: 'Embarcação não encontrada ou inativa' 
          });
        }

        // Check if vessel is under maintenance for this date
        const maintenances = await db.getActiveMaintenancesByVesselAndDate(input.vesselId, input.bookingDate);
        if (maintenances.length > 0) {
          const maintenance = maintenances[0];
          throw new TRPCError({ 
            code: 'CONFLICT', 
            message: `Esta embarcação está em manutenção de ${new Date(maintenance.startDate).toLocaleDateString('pt-BR')} até ${new Date(maintenance.endDate).toLocaleDateString('pt-BR')}` 
          });
        }

        // Check if vessel is already booked for this date
        const existingBookings = await db.getBookingsByVesselAndDate(input.vesselId, input.bookingDate);
        if (existingBookings.length > 0) {
          throw new TRPCError({ 
            code: 'CONFLICT', 
            message: 'Esta embarcação já está reservada para esta data' 
          });
        }

        // Check user's quota for this specific vessel
        const client = await db.getAllowedClientByEmail(ctx.user.email);
        if (!client) {
          throw new TRPCError({ 
            code: 'UNAUTHORIZED', 
            message: 'Cliente não autorizado' 
          });
        }

        // Get quotas for this vessel
        const quotas = await db.getClientQuotaByVessel(client.id, input.vesselId);
        if (quotas.length === 0) {
          throw new TRPCError({ 
            code: 'FORBIDDEN', 
            message: `Você não possui cota para esta embarcação (${vessel.name}). Entre em contato com o administrador.` 
          });
        }

        // Calculate max bookings for this vessel: full = 2 per quota, half = 1 per quota
        let maxBookingsForVessel = 0;
        for (const quota of quotas) {
          maxBookingsForVessel += quota.quotaType === 'full' ? 2 : 1;
        }

        // Count active bookings for this vessel only
        const allActiveBookings = await db.getActiveBookingsByEmail(ctx.user.email);
        const activeBookingsForVessel = allActiveBookings.filter(b => b.vesselId === input.vesselId);
        
        if (activeBookingsForVessel.length >= maxBookingsForVessel) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: `Você já atingiu o limite de ${maxBookingsForVessel} reserva(s) simultânea(s) para ${vessel.name}. Utilize uma reserva para liberar um novo agendamento.` 
          });
        }

        // Create booking
        await db.createBooking({
          clientEmail: ctx.user.email,
          clientName: ctx.user.name,
          vesselId: input.vesselId,
          vesselName: vessel.name,
          bookingDate: input.bookingDate,
          status: 'confirmed',
          notes: input.notes,
        });

        // Send notification to admin
        await notifyNewBooking({
          clientName: ctx.user.name,
          clientEmail: ctx.user.email,
          vesselName: vessel.name,
          bookingDate: new Date(input.bookingDate),
          notes: input.notes,
        });
        
        // Send confirmation email to client
        await notifyClientBookingConfirmation({
          clientName: ctx.user.name,
          clientEmail: ctx.user.email,
          vesselName: vessel.name,
          bookingDate: new Date(input.bookingDate),
          notes: input.notes,
        });

        return { success: true };
      }),

    // Create booking for any client (admin only, no limits)
    createForClient: adminProcedure
      .input(z.object({
        clientEmail: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }),
        vesselId: z.number(),
        bookingDate: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Get client info
        const client = await db.getAllowedClientByEmail(input.clientEmail);
        if (!client) {
          throw new TRPCError({ 
            code: 'NOT_FOUND', 
            message: 'Cliente não encontrado na lista de autorizados' 
          });
        }

        // Check if vessel exists
        const vessel = await db.getVesselById(input.vesselId);
        if (!vessel) {
          throw new TRPCError({ 
            code: 'NOT_FOUND', 
            message: 'Embarcação não encontrada' 
          });
        }

        // Check if it's a Monday (not allowed)
        const bookingDate = new Date(input.bookingDate);
        const dayOfWeek = bookingDate.getUTCDay();
        if (dayOfWeek === 1) { // 1 = Monday
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Reservas não são permitidas às segundas-feiras' 
          });
        }

        // Check if vessel is under maintenance for this date
        const maintenances = await db.getActiveMaintenancesByVesselAndDate(input.vesselId, input.bookingDate);
        if (maintenances.length > 0) {
          const maintenance = maintenances[0];
          throw new TRPCError({ 
            code: 'CONFLICT', 
            message: `Esta embarcação está em manutenção de ${new Date(maintenance.startDate).toLocaleDateString('pt-BR')} até ${new Date(maintenance.endDate).toLocaleDateString('pt-BR')}` 
          });
        }

        // Check if vessel is already booked for this date
        const existingBookings = await db.getBookingsByVesselAndDate(input.vesselId, input.bookingDate);
        if (existingBookings.length > 0) {
          throw new TRPCError({ 
            code: 'CONFLICT', 
            message: 'Esta embarcação já está reservada para esta data' 
          });
        }

        // Admin can create booking without quota limits
        await db.createBooking({
          clientEmail: input.clientEmail,
          clientName: client.name,
          vesselId: input.vesselId,
          vesselName: vessel.name,
          bookingDate: input.bookingDate,
          status: 'confirmed',
          notes: input.notes,
        });

        return { success: true };
      }),

    // Cancel booking
    cancel: allowedClientProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.email) {
          throw new TRPCError({ code: 'UNAUTHORIZED' });
        }

        const bookings = await db.getBookingsByEmail(ctx.user.email);
        const booking = bookings.find(b => b.id === input.id);

        if (!booking) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Reserva não encontrada' });
        }

        if (booking.status !== 'confirmed') {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Esta reserva não pode ser cancelada' 
          });
        }

        await db.updateBooking(input.id, { status: 'cancelled' });
        
        // Send notification to admin
        await notifyBookingCancellation({
          clientName: booking.clientName,
          clientEmail: booking.clientEmail,
          vesselName: booking.vesselName,
          bookingDate: new Date(booking.bookingDate),
        });
        
        // Send cancellation email to client
        await notifyClientBookingCancellation({
          clientName: booking.clientName,
          clientEmail: booking.clientEmail,
          vesselName: booking.vesselName,
          bookingDate: new Date(booking.bookingDate),
        });
        
        return { success: true };
      }),

    // Mark as used (admin only)
    markAsUsed: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        // Get booking details before updating
        const allBookings = await db.getBookings();
        const booking = allBookings.find(b => b.id === input.id);
        
        await db.updateBooking(input.id, { status: 'used' });
        
        // Send notification to admin if booking found
        if (booking) {
          await notifyBookingUsed({
            clientName: booking.clientName,
            vesselName: booking.vesselName,
            bookingDate: new Date(booking.bookingDate),
          });
        }
        
        return { success: true };
      }),

    // Update booking (admin only)
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'confirmed', 'used', 'cancelled']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateBooking(id, data);
        return { success: true };
      }),

    // Delete booking (admin only)
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteBooking(input.id);
        return { success: true };
      }),
  }),

  // Maintenances (Admin only)
  maintenances: router({
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

    list: publicProcedure.query(async ({ ctx }) => {
      // Allow admin and employee to access
      if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
      }
      return await db.getMaintenances();
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        return await db.getMaintenanceById(input.id);
      }),

    getByVessel: publicProcedure
      .input(z.object({ vesselId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
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

    create: publicProcedure
      .input(z.object({
        vesselId: z.number(),
        startDate: z.number(),
        endDate: z.number(),
        description: z.string().optional(),
        status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
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
        const startNormalized = new Date(input.startDate);
        startNormalized.setHours(0, 0, 0, 0);
        const endNormalized = new Date(input.endDate);
        endNormalized.setHours(23, 59, 59, 999);
        
        const conflictingBookings = allBookings.filter((booking: any) => {
          if (booking.vesselId !== input.vesselId) return false;
          if (booking.status === 'cancelled' || booking.status === 'used') return false;
          
          const bookingDate = new Date(booking.bookingDate);
          bookingDate.setHours(0, 0, 0, 0);
          
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

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        vesselId: z.number().optional(),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
        description: z.string().optional(),
        status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const { id, ...data } = input;
        
        // Get current maintenance to check if status changed
        const currentMaintenance = await db.getMaintenanceById(id);
        if (!currentMaintenance) {
          throw new TRPCError({ 
            code: 'NOT_FOUND', 
            message: 'Manutenção não encontrada' 
          });
        }
        
        // If vessel changed, update vessel name
        if (data.vesselId) {
          const vessel = await db.getVesselById(data.vesselId);
          if (!vessel) {
            throw new TRPCError({ 
              code: 'NOT_FOUND', 
              message: 'Embarcação não encontrada' 
            });
          }
          (data as any).vesselName = vessel.name;
        }

        await db.updateMaintenance(id, data);
        
        // If status changed, send notifications
        if (data.status && data.status !== currentMaintenance.status) {
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
        
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        await db.deleteMaintenance(input.id);
        return { success: true };
      }),
  }),

  // Weather
  weather: router({
    forecast: publicProcedure
      .input(z.object({ date: z.number() })) // Unix timestamp
      .query(async ({ input }) => {
        const date = new Date(input.date);
        const forecast = await weather.getWeatherForecast(date);
        return forecast ? {
          ...forecast,
          emoji: weather.getWeatherEmoji(forecast.icon),
        } : null;
      }),
  }),

  // Statistics
  stats: router({
    client: allowedClientProcedure.query(async ({ ctx }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Email não encontrado' });
      }
      return await stats.getClientStats(ctx.user.email);
    }),
    admin: adminProcedure.query(async () => {
      return await stats.getAdminStats();
    }),
  }),

  reviews: router({
    create: allowedClientProcedure
      .input(z.object({
        bookingId: z.number(),
        vesselId: z.number(),
        vesselName: z.string(),
        rating: z.number().min(1).max(5),
        comment: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        
        const { sql } = await import('drizzle-orm');
        
        // Check if already reviewed
        const existing = await db.execute(sql`
          SELECT id FROM reviews WHERE booking_id = ${input.bookingId}
        `) as any;
        
        if ((Array.isArray(existing[0]) ? existing[0] : existing).length > 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Você já avaliou esta reserva' });
        }
        
        await db.execute(sql`
          INSERT INTO reviews (booking_id, client_email, client_name, vessel_id, vessel_name, rating, comment) 
          VALUES (${input.bookingId}, ${ctx.user.email || ''}, ${ctx.user.name || ''}, ${input.vesselId}, ${input.vesselName}, ${input.rating}, ${input.comment || null})
        `);
        
        return { success: true };
      }),
    
    listAll: adminProcedure.query(async () => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) return [];
      
      const { sql } = await import('drizzle-orm');
      const result = await db.execute(sql`
        SELECT * FROM reviews ORDER BY created_at DESC
      `) as any;
      
      return (Array.isArray(result[0]) ? result[0] : result);
    }),
    
    listByVessel: publicProcedure
      .input(z.object({ vesselId: z.number() }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) return [];
        
        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT * FROM reviews WHERE vessel_id = ${input.vesselId} ORDER BY created_at DESC
        `) as any;
        
        return (Array.isArray(result[0]) ? result[0] : result);
      }),
    
    stats: publicProcedure
      .input(z.object({ vesselId: z.number() }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) return { averageRating: 0, totalReviews: 0 };
        
        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT AVG(rating) as avgRating, COUNT(*) as total FROM reviews WHERE vessel_id = ${input.vesselId}
        `) as any;
        
        const stats = (Array.isArray(result[0]) ? result[0][0] : result[0]);
        return {
          averageRating: stats?.avgRating ? Math.round(stats.avgRating * 10) / 10 : 0,
          totalReviews: stats?.total || 0,
        };
      }),
  }),

  // Employee router - For employee and admin users
  employee: router({
    // Get upcoming reservations (today + next 20 future confirmed)
    upcomingReservations: employeeProcedure.query(async () => {
      const dbInstance = await import('./db').then(m => m.getDb());
      if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const { sql: sqlTag } = await import('drizzle-orm');
      
      // Normalizar para meia-noite para comparar apenas datas (sem horas)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const now = today.getTime();
      const query = `
        SELECT 
          id,
          client_email as clientEmail,
          client_name as clientName,
          vessel_id as vesselId,
          vessel_name as vesselName,
          booking_date as bookingDate,
          status,
          notes,
          created_at as createdAt,
          updated_at as updatedAt
        FROM bookings
        WHERE booking_date >= ${now}
          AND status = 'confirmed'
        ORDER BY booking_date ASC
        LIMIT 21
      `;
      const result = await dbInstance.execute(sqlTag.raw(query)) as any;
      return (Array.isArray(result[0]) ? result[0] : result) as any[];
    }),
  }),

  // Employees router - Admin only
  employees: router({
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }),
        phone: z.string().optional(),
        vesselIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { employees } = await import('../drizzle/schema');

        try {
          await db.insert(employees).values({
            name: input.name,
            email: input.email,
            phone: input.phone || null,
            vesselIds: input.vesselIds ? JSON.stringify(input.vesselIds) : null,
            isActive: true,
          });
          return { success: true };
        } catch (error: any) {
          console.error('[employees.create] Error:', error);
          // Tratar erro de email duplicado (MySQL error code 1062)
          // Drizzle encapsula o erro do MySQL em error.cause
          const cause = error.cause || error;
          const errorMsg = error.message || String(error);
          const causeMsg = cause.sqlMessage || cause.message || '';
          
          // Verificar código de erro duplicado em múltiplos níveis
          if (
            error.code === 'ER_DUP_ENTRY' || 
            error.errno === 1062 ||
            cause.code === 'ER_DUP_ENTRY' || 
            cause.errno === 1062 ||
            errorMsg.includes('Duplicate entry') || 
            causeMsg.includes('Duplicate entry') ||
            errorMsg.includes('duplicate key') ||
            causeMsg.includes('duplicate key')
          ) {
            throw new TRPCError({ 
              code: 'CONFLICT', 
              message: `Email ${input.email} já está cadastrado` 
            });
          }
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao cadastrar funcionário: ${errorMsg}` 
          });
        }
      }),

    list: adminProcedure.query(async () => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) return [];

      const result = await db.execute(
        'SELECT * FROM employees WHERE is_active = 1 ORDER BY created_at DESC'
      ) as any;

      // db.execute retorna [rows, fields], pegar apenas rows
      const rows = Array.isArray(result[0]) ? result[0] : result;

      return rows.map((row: any) => ({
        ...row,
        vesselIds: row.vessel_ids ? JSON.parse(row.vessel_ids) : [],
      }));
    }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        email: z.string().min(1).refine((val) => val.includes('@'), { message: 'Email inválido' }).optional(),
        phone: z.string().optional(),
        vesselIds: z.array(z.number()).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');

        // Construir SET clause dinamicamente
        const updates: string[] = [];

        if (input.name !== undefined) {
          const name = input.name.replace(/'/g, "''");
          updates.push(`name = '${name}'`);
        }

        if (input.email !== undefined) {
          const email = input.email.replace(/'/g, "''");
          updates.push(`email = '${email}'`);
        }

        if (input.phone !== undefined) {
          const phone = input.phone ? `'${input.phone.replace(/'/g, "''")}' ` : 'null';
          updates.push(`phone = ${phone}`);
        }

        if (input.vesselIds !== undefined) {
          const vesselIdsJson = JSON.stringify(input.vesselIds).replace(/'/g, "''");
          updates.push(`vessel_ids = '${vesselIdsJson}'`);
        }

        if (input.isActive !== undefined) {
          updates.push(`is_active = ${input.isActive ? 1 : 0}`);
        }

        if (updates.length === 0) {
          return { success: true };
        }

        try {
          await db.execute(sql.raw(`
            UPDATE employees
            SET ${updates.join(', ')}
            WHERE id = ${input.id}
          `));
          
          return { success: true };
        } catch (error: any) {
          console.error('[employees.update] Error:', error);
          // Tratar erro de email duplicado
          if (error.message && error.message.includes('Duplicate entry')) {
            throw new TRPCError({ 
              code: 'CONFLICT', 
              message: `Email ${input.email} já está cadastrado` 
            });
          }
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao atualizar funcionário: ${error.message}` 
          });
        }
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { employees, users } = await import('../drizzle/schema');
        const { eq, sql } = await import('drizzle-orm');

        try {
          // 1. Buscar email do funcionário antes de deletar
          const result = await db.execute(sql`SELECT email FROM employees WHERE id = ${input.id}`);
          const employeeEmail = (result[0] as any)?.[0]?.email;

          // 2. Hard delete da tabela employees para liberar o email imediatamente
          await db.delete(employees)
            .where(eq(employees.id, input.id));
          
          // 3. Remover também da tabela users (se existir) para evitar órfãos
          if (employeeEmail) {
            await db.delete(users)
              .where(eq(users.email, employeeEmail));
          }
          
          return { success: true };
        } catch (error: any) {
          console.error('[employees.delete] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao desativar funcionário: ${error.message}` 
          });
        }
      }),
  }),

  // Fuel Records router - Admin and Employee
  fuelRecords: router({  
    create: publicProcedure
      .input(z.object({
        bookingId: z.number(),
        vesselId: z.number(),
        liters: z.number().positive().optional(), // Opcional quando usa método por peso
        pricePerLiter: z.number().positive().optional(), // Opcional - busca do estoque se não informado
        notes: z.string().optional(),
        // Campos opcionais do método de abastecimento por pesagem
        litersInitial: z.number().positive().optional(), // Litros iniciais no galão (ex: 50.05)
        weightFull: z.number().positive().optional(), // Peso do galão cheio em kg (ex: 37.80)
        weightAfter: z.number().positive().optional(), // Peso do galão após em kg (ex: 23.40)
        photoBeforeUrl: z.string().url().optional(), // URL da foto ANTES
        photoAfterUrl: z.string().url().optional(), // URL da foto DEPOIS
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const database = await import('./db').then(m => m.getDb());
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        // Buscar dados da reserva e embarcação
        const { sql } = await import('drizzle-orm');
        const bookingResult = await database.execute(sql`
          SELECT b.client_name, b.client_email, b.vessel_name, v.name as vessel_name_actual
          FROM bookings b
          JOIN vessels v ON b.vessel_id = v.id
          WHERE b.id = ${input.bookingId}
        `) as any;
        const booking = (Array.isArray(bookingResult[0]) ? bookingResult[0][0] : bookingResult[0]);
        if (!booking) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Reserva não encontrada' });
        }

        // Validar campos de peso (se um for informado, todos devem ser)
        const hasWeightData = input.litersInitial || input.weightFull || input.weightAfter;
        if (hasWeightData) {
          if (!input.litersInitial || !input.weightFull || !input.weightAfter) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'Se usar o método de pesagem, todos os campos (litros iniciais, peso cheio e peso após) são obrigatórios' 
            });
          }
          if (!input.photoBeforeUrl || !input.photoAfterUrl) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'As fotos da balança (antes e depois) são obrigatórias ao usar o método de pesagem' 
            });
          }
          if (input.weightAfter >= input.weightFull) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'O peso após deve ser menor que o peso cheio' 
            });
          }
        }

        // Buscar preço/L do estoque (se não foi informado)
        const currentDate = new Date();
        const currentMonthYear = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        
        const budgetResult = await database.execute(sql`
          SELECT last_price_per_liter, stock_liters FROM fuel_budget WHERE month_year = ${currentMonthYear}
        `) as any;
        const budget = (Array.isArray(budgetResult[0]) ? budgetResult[0][0] : budgetResult[0]);
        
        const defaultPricePerLiter = budget?.last_price_per_liter ? budget.last_price_per_liter / 100 : null;
        const currentStockLiters = budget?.stock_liters ? budget.stock_liters / 100 : 0;
        
        // Usar preço do estoque se não foi informado
        let finalPricePerLiter = input.pricePerLiter;
        if (!finalPricePerLiter && defaultPricePerLiter) {
          finalPricePerLiter = defaultPricePerLiter;
          console.log('[fuelRecords.create] Preço/L aplicado do estoque:', finalPricePerLiter);
        } else if (!finalPricePerLiter) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Preço por litro não informado e não há preço no estoque. Configure o orçamento primeiro.' 
          });
        }

        // Calcular valores de peso e litros (se método de pesagem for usado)
        let litersInitialInCents = null;
        let weightFullInGrams = null;
        let weightAfterInGrams = null;
        let weightConsumedInGrams = null;
        let litersCalculatedInCents = null;
        let finalLitersInCents = input.liters ? Math.round(input.liters * 100) : 0; // Padrão: usar litros informados manualmente

        if (hasWeightData && input.litersInitial && input.weightFull && input.weightAfter) {
          // Converter para unidades inteiras (centavos/gramas)
          litersInitialInCents = Math.round(input.litersInitial * 100); // 50.05L -> 5005
          weightFullInGrams = Math.round(input.weightFull * 100); // 37.80kg -> 3780 (gramas em centavos)
          weightAfterInGrams = Math.round(input.weightAfter * 100); // 23.40kg -> 2340
          weightConsumedInGrams = weightFullInGrams - weightAfterInGrams; // 3780 - 2340 = 1440

          // Regra de 3: litros_consumidos = (peso_consumido * litros_iniciais) / peso_cheio
          litersCalculatedInCents = Math.round((weightConsumedInGrams * litersInitialInCents) / weightFullInGrams);
          
          // Usar litros calculados ao invés de litros manuais
          finalLitersInCents = litersCalculatedInCents;
        }

        const SERVICE_FEE = 1000; // Taxa de abastecimento e aplicativo em centavos (R$ 10,00)
        const pricePerLiterInCents = Math.round(finalPricePerLiter * 100); // Converter para centavos
        const fuelCost = Math.round((finalLitersInCents / 100) * finalPricePerLiter * 100); // em centavos
        const totalAmount = fuelCost + SERVICE_FEE;
        
        // Descontar litros do estoque
        const finalLiters = finalLitersInCents / 100;
        console.log('[fuelRecords.create] Descontando do estoque:', finalLiters, 'L');
        console.log('[fuelRecords.create] Estoque antes:', currentStockLiters, 'L');
        
        await database.execute(sql`
          UPDATE fuel_budget 
          SET stock_liters = stock_liters - ${finalLitersInCents}
          WHERE month_year = ${currentMonthYear}
        `);
        
        console.log('[fuelRecords.create] Estoque após:', (currentStockLiters - finalLiters), 'L');

        // Criar ou buscar cliente no Asaas
        const asaas = await import('./_core/asaas');
        let asaasCustomerId = '';
        let asaasChargeId = '';
        let paymentUrl = '';
        let syncStatus = 'pending';
        let syncError = null;
        
        try {
          console.log('[fuelRecords.create] Iniciando criação de cobrança Asaas...');
          console.log('[fuelRecords.create] Cliente:', booking.client_name, booking.client_email);
          
          const customer = await asaas.getOrCreateCustomer({
            name: booking.client_name,
            email: booking.client_email,
          });
          asaasCustomerId = customer.id;
          console.log('[fuelRecords.create] Cliente Asaas ID:', asaasCustomerId);

          // Criar cobrança no Asaas
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 7); // Vencimento em 7 dias
          
          console.log('[fuelRecords.create] Criando cobrança...');
          const charge = await asaas.createCharge({
            customer: asaasCustomerId,
            billingType: 'UNDEFINED', // Cliente escolhe forma de pagamento
            value: totalAmount / 100, // Converter centavos para reais
            dueDate: asaas.formatDateForAsaas(dueDate),
            description: `Abastecimento - ${booking.vessel_name_actual} - ${input.liters}L`,
            externalReference: `booking_${input.bookingId}`,
          });
          
          asaasChargeId = charge.id;
          paymentUrl = charge.invoiceUrl || charge.bankSlipUrl || '';
          syncStatus = 'synced';
          
          console.log('[fuelRecords.create] ✅ Cobrança criada com sucesso!');
          console.log('[fuelRecords.create] Charge ID:', asaasChargeId);
          console.log('[fuelRecords.create] Payment URL:', paymentUrl);
        } catch (error: any) {
          syncStatus = 'failed';
          syncError = error.message;
          console.error('[fuelRecords.create] ❌ ERRO ao criar cobrança Asaas:');
          console.error('[fuelRecords.create] Mensagem:', error.message);
          console.error('[fuelRecords.create] Stack:', error.stack);
          console.error('[fuelRecords.create] Abastecimento será salvo, mas cobrança pode ser criada manualmente depois');
        }

        const notesValue = input.notes ? `'${input.notes.replace(/'/g, "''")}'` : 'NULL';
        const photoBeforeUrlValue = input.photoBeforeUrl ? `'${input.photoBeforeUrl}'` : 'NULL';
        const photoAfterUrlValue = input.photoAfterUrl ? `'${input.photoAfterUrl}'` : 'NULL';
        const asaasChargeIdValue = asaasChargeId ? `'${asaasChargeId}'` : 'NULL';
        const asaasCustomerIdValue = asaasCustomerId ? `'${asaasCustomerId}'` : 'NULL';
        const paymentUrlValue = paymentUrl ? `'${paymentUrl}'` : 'NULL';
        const syncErrorValue = syncError ? `'${syncError.replace(/'/g, "''")}'` : 'NULL';
        
        await database.execute(`
          INSERT INTO fuel_records (
            booking_id, vessel_id, vessel_name, client_email, client_name, 
            liters, price_per_liter, total_amount, notes, 
            liters_initial, weight_full, weight_after, weight_consumed, liters_calculated,
            photo_before_url, photo_after_url,
            asaas_charge_id, asaas_customer_id, payment_url, payment_status,
            sync_status, sync_error, last_sync_attempt,
            recorded_by, recorded_at
          )
          VALUES (
            ${input.bookingId}, ${input.vesselId}, '${booking.vessel_name_actual}', 
            '${booking.client_email}', '${booking.client_name}', 
            ${finalLitersInCents}, ${pricePerLiterInCents}, ${totalAmount}, ${notesValue}, 
            ${litersInitialInCents}, ${weightFullInGrams}, ${weightAfterInGrams}, ${weightConsumedInGrams}, ${litersCalculatedInCents},
            ${photoBeforeUrlValue}, ${photoAfterUrlValue},
            ${asaasChargeIdValue}, ${asaasCustomerIdValue}, ${paymentUrlValue}, 'pending',
            '${syncStatus}', ${syncErrorValue}, NOW(),
            ${ctx.user?.id || 'NULL'}, NOW()
          )
        `);
        
        console.log('[fuelRecords.create] Abastecimento salvo no banco com sync_status:', syncStatus); 

        return { 
          success: true, 
          totalCost: totalAmount / 100,
          paymentUrl: paymentUrl || undefined,
          asaasChargeId: asaasChargeId || undefined,
        };
      }),

    list: publicProcedure
      .input(z.object({
        vesselId: z.number().optional(),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
        month: z.number().min(1).max(12).optional(), // Mês (1-12)
        year: z.number().min(2020).max(2030).optional(), // Ano
      }))
      .query(async ({ input, ctx }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        
        // Construir query base
        let queryStr = `
          SELECT 
            fr.*,
            b.booking_date,
            b.client_name,
            b.vessel_name,
            fr.sync_status,
            fr.sync_error,
            fr.last_sync_attempt,
            fr.manual_payment_note,
            u.name as recorded_by_name,
            fr.recorded_at
          FROM fuel_records fr
          JOIN bookings b ON fr.booking_id = b.id
          LEFT JOIN users u ON fr.recorded_by = u.id
          WHERE 1=1
        `;

        if (input.vesselId) {
          queryStr += ` AND fr.vessel_id = ${input.vesselId}`;
        }

        // Se month e year forem fornecidos, filtrar por mês/ano
        if (input.month && input.year) {
          queryStr += ` AND MONTH(fr.created_at) = ${input.month}`;
          queryStr += ` AND YEAR(fr.created_at) = ${input.year}`;
        } else {
          // Caso contrário, usar startDate/endDate se fornecidos
          if (input.startDate) {
            queryStr += ` AND fr.created_at >= FROM_UNIXTIME(${input.startDate / 1000})`;
          }

          if (input.endDate) {
            queryStr += ` AND fr.created_at <= FROM_UNIXTIME(${input.endDate / 1000})`;
          }
        }

        queryStr += ' ORDER BY fr.created_at DESC';

        const result = await db.execute(sql.raw(queryStr)) as any;
        const records = (Array.isArray(result[0]) ? result[0] : result) as any[];
        
        // Converter valores de centavos para reais
        return records.map((record: any) => ({
          ...record,
          date: record.booking_date, // Mapear booking_date para date
          clientName: record.client_name, // Nome do cliente
          vesselName: record.vessel_name, // Nome da embarcação
          liters: record.liters / 100,
          price_per_liter: record.price_per_liter / 100,
          total_cost: record.total_amount / 100,
          recorded_by_name: record.recorded_by_name || 'Sistema', // Nome do usuário que registrou
          recorded_at: record.recorded_at, // Data/hora de registro
        }));
      }),

    getByBooking: publicProcedure
      .input(z.object({ bookingId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT fr.*
          FROM fuel_records fr
          WHERE fr.booking_id = ${input.bookingId}
          ORDER BY fr.created_at DESC
        `) as any;

        return (Array.isArray(result[0]) ? result[0] : result) as any[];
      }),

    stats: publicProcedure
      .input(z.object({
        vesselId: z.number().optional(),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
        month: z.number().min(1).max(12).optional(), // Mês (1-12)
        year: z.number().min(2020).max(2030).optional(), // Ano
      }))
      .query(async ({ input, ctx }) => {
        // Allow admin and employee to access
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        let query = `
          SELECT 
            COUNT(*) as total_records,
            SUM(liters) as total_liters,
            SUM(total_amount) as total_cost,
            AVG(liters) as avg_liters_per_refuel,
            AVG(price_per_liter) as avg_price_per_liter,
            SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_received,
            SUM(CASE WHEN payment_status = 'pending' THEN total_amount ELSE 0 END) as total_pending
          FROM fuel_records
          WHERE 1=1
        `;
        const params: any[] = [];

        if (input.vesselId) {
          query += ' AND vessel_id = ?';
          params.push(input.vesselId);
        }

        // Se month e year forem fornecidos, filtrar por mês/ano
        if (input.month && input.year) {
          query += ` AND MONTH(created_at) = ${input.month}`;
          query += ` AND YEAR(created_at) = ${input.year}`;
        } else {
          // Caso contrário, usar startDate/endDate se fornecidos
          if (input.startDate) {
            query += ' AND created_at >= FROM_UNIXTIME(?)';
            params.push(input.startDate / 1000);
          }

          if (input.endDate) {
            query += ' AND created_at <= FROM_UNIXTIME(?)';
            params.push(input.endDate / 1000);
          }
        }

        const { sql: sqlTag } = await import('drizzle-orm');
        const result = await db.execute(sqlTag.raw(query)) as any;
        const stats = (Array.isArray(result[0]) ? result[0][0] : result[0]);

        return {
          totalRecords: Number(stats.total_records) || 0,
          totalLiters: Number(stats.total_liters) || 0,
          totalCost: Number(stats.total_cost) / 100 || 0, // Converter centavos para reais
          totalReceived: Number(stats.total_received) / 100 || 0, // Converter centavos para reais
          totalPending: Number(stats.total_pending) / 100 || 0, // Converter centavos para reais
          avgLitersPerRefuel: Number(stats.avg_liters_per_refuel) / 100 || 0,
          avgPricePerLiter: Number(stats.avg_price_per_liter) / 100 || 0,
        };
      }),

    delete: publicProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          
          // 1. Buscar informações do abastecimento e da reserva associada
          const recordResult = await db.execute(sql`
            SELECT 
              fr.liters,
              fr.booking_id,
              b.booking_date
            FROM fuel_records fr
            INNER JOIN bookings b ON fr.booking_id = b.id
            WHERE fr.id = ${input.id}
          `) as any;
          const record = (Array.isArray(recordResult[0]) ? recordResult[0][0] : recordResult[0]);
          
          if (!record) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Abastecimento não encontrado' });
          }
          
          // 2. Calcular monthYear a partir da data da reserva (timestamp em milissegundos)
          const bookingDate = new Date(Number(record.booking_date));
          const monthYear = `${bookingDate.getFullYear()}-${String(bookingDate.getMonth() + 1).padStart(2, '0')}`;
          
          // 3. Devolver litros ao estoque (adicionar de volta)
          const litersToReturn = record.liters; // Já está em centésimos
          
          await db.execute(sql`
            UPDATE fuel_budget 
            SET stock_liters = stock_liters + ${litersToReturn}
            WHERE month_year = ${monthYear}
          `);
          
          console.log(`[fuelRecords.delete] Devolvendo ${litersToReturn / 100}L ao estoque do mês ${monthYear}`);
          
          // 3. Excluir o registro
          await db.execute(sql`DELETE FROM fuel_records WHERE id = ${input.id}`);
          
          return { success: true };
        } catch (error: any) {
          console.error('[fuelRecords.delete] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao excluir abastecimento: ${error.message}` 
          });
        }
      }),

    // Sincronizar abastecimento individual com Asaas
    syncWithAsaas: publicProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user || ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Apenas administradores podem sincronizar' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          // Buscar registro de abastecimento
          const { sql } = await import('drizzle-orm');
          const result = await db.execute(sql`
            SELECT * FROM fuel_records WHERE id = ${input.id}
          `) as any;
          const record = (Array.isArray(result[0]) ? result[0][0] : result[0]);

          if (!record) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Abastecimento não encontrado' });
          }

          // Se já está sincronizado, retornar sucesso
          if (record.sync_status === 'synced' && record.asaas_charge_id) {
            return { 
              success: true, 
              message: 'Abastecimento já sincronizado',
              chargeId: record.asaas_charge_id,
              paymentUrl: record.payment_url
            };
          }

          // Tentar criar cobrança no Asaas
          const asaas = await import('./_core/asaas');
          
          console.log('[syncWithAsaas] Buscando/criando cliente:', record.client_email);
          const customer = await asaas.getOrCreateCustomer({
            name: record.client_name,
            email: record.client_email,
          });
          console.log('[syncWithAsaas] Cliente obtido:', customer.id);

          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 7); // Vencimento em 7 dias
          
          console.log('[syncWithAsaas] Criando cobrança...');
          const charge = await asaas.createCharge({
            customer: customer.id,
            billingType: 'UNDEFINED',
            value: record.total_amount / 100, // Converter centavos para reais
            dueDate: asaas.formatDateForAsaas(dueDate),
            description: `Abastecimento - ${record.vessel_name} - ${record.liters / 100}L`,
            externalReference: `fuel_record_${record.id}`,
          });
          console.log('[syncWithAsaas] Cobrança criada:', charge.id);

          // Atualizar registro com dados da cobrança
          await db.execute(sql`
            UPDATE fuel_records 
            SET 
              asaas_charge_id = ${charge.id},
              asaas_customer_id = ${customer.id},
              payment_url = ${charge.invoiceUrl || charge.bankSlipUrl || ''},
              sync_status = 'synced',
              sync_error = NULL,
              last_sync_attempt = NOW()
            WHERE id = ${input.id}
          `);

          return { 
            success: true, 
            message: 'Cobrança criada com sucesso no Asaas',
            chargeId: charge.id,
            paymentUrl: charge.invoiceUrl || charge.bankSlipUrl || ''
          };
        } catch (error: any) {
          console.error('[syncWithAsaas] Erro:', error);
          
          // Salvar erro no banco
          const { sql } = await import('drizzle-orm');
          await db.execute(sql`
            UPDATE fuel_records 
            SET 
              sync_status = 'failed',
              sync_error = ${error.message},
              last_sync_attempt = NOW()
            WHERE id = ${input.id}
          `);

          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao sincronizar com Asaas: ${error.message}` 
          });
        }
      }),

    // Sincronizar todos os abastecimentos pendentes
    syncAllPending: publicProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.user || ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Apenas administradores podem sincronizar' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          // Buscar todos os registros pendentes
          const { sql } = await import('drizzle-orm');
          const result = await db.execute(sql`
            SELECT id FROM fuel_records 
            WHERE sync_status = 'pending' OR sync_status = 'failed'
            ORDER BY created_at ASC
          `) as any;
          const records = (Array.isArray(result[0]) ? result[0] : result) as any[];

          let successCount = 0;
          let failCount = 0;
          const errors: string[] = [];

          // Sincronizar cada registro
          for (const record of records) {
            try {
              // Reutilizar lógica do endpoint syncWithAsaas
              const recordResult = await db.execute(sql`
                SELECT * FROM fuel_records WHERE id = ${record.id}
              `) as any;
              const fullRecord = (Array.isArray(recordResult[0]) ? recordResult[0][0] : recordResult[0]);

              if (!fullRecord) continue;

              const asaas = await import('./_core/asaas');
              const customer = await asaas.getOrCreateCustomer({
                name: fullRecord.client_name,
                email: fullRecord.client_email,
              });

              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + 7);
              
              const charge = await asaas.createCharge({
                customer: customer.id,
                billingType: 'UNDEFINED',
                value: fullRecord.total_amount / 100,
                dueDate: asaas.formatDateForAsaas(dueDate),
                description: `Abastecimento - ${fullRecord.vessel_name} - ${fullRecord.liters / 100}L`,
                externalReference: `fuel_record_${fullRecord.id}`,
              });

              await db.execute(sql`
                UPDATE fuel_records 
                SET 
                  asaas_charge_id = ${charge.id},
                  asaas_customer_id = ${customer.id},
                  payment_url = ${charge.invoiceUrl || charge.bankSlipUrl || ''},
                  sync_status = 'synced',
                  sync_error = NULL,
                  last_sync_attempt = NOW()
                WHERE id = ${record.id}
              `);

              successCount++;
            } catch (error: any) {
              console.error(`[syncAllPending] Erro no registro ${record.id}:`, error);
              failCount++;
              errors.push(`Registro ${record.id}: ${error.message}`);
              
              await db.execute(sql`
                UPDATE fuel_records 
                SET 
                  sync_status = 'failed',
                  sync_error = ${error.message},
                  last_sync_attempt = NOW()
                WHERE id = ${record.id}
              `);
            }
          }

          return {
            success: true,
            total: records.length,
            successCount,
            failCount,
            errors: errors.length > 0 ? errors : undefined
          };
        } catch (error: any) {
          console.error('[syncAllPending] Erro:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao sincronizar abastecimentos: ${error.message}` 
          });
        }
      }),

    // Marcar pagamento como recebido manualmente
    markAsPaid: publicProcedure
      .input(z.object({
        id: z.number(),
        note: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user || ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Apenas administradores podem marcar pagamentos' });
        }
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          await db.execute(sql`
            UPDATE fuel_records 
            SET 
              payment_status = 'paid',
              sync_status = 'manual',
              paid_at = NOW(),
              manual_payment_note = ${input.note || 'Pagamento recebido manualmente'}
            WHERE id = ${input.id}
          `);

          return { success: true, message: 'Pagamento marcado como recebido' };
        } catch (error: any) {
          console.error('[markAsPaid] Erro:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao marcar pagamento: ${error.message}` 
          });
        }
      }),

    // Generate PDF report for selected fuel records
    generateReport: publicProcedure
      .input(z.object({
        recordIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        if (input.recordIds.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum registro selecionado' });
        }

        // Buscar registros selecionados via raw SQL
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        const ids = input.recordIds.join(',');
        const result = await db.execute(sql.raw(`
          SELECT 
            fr.*,
            b.booking_date,
            b.client_name,
            u.name as recorded_by_name
          FROM fuel_records fr
          LEFT JOIN bookings b ON fr.booking_id = b.id
          LEFT JOIN users u ON fr.recorded_by = u.id
          WHERE fr.id IN (${ids})
          ORDER BY fr.created_at DESC
        `)) as any;
        
        const records = (Array.isArray(result[0]) ? result[0] : result) as any[];

        if (!records || records.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhum registro encontrado' });
        }

        // Mapear snake_case para camelCase e calcular campos faltantes
        const mappedRecords = records.map(r => ({
          id: r.id,
          vesselName: r.vessel_name || 'N/A',
          clientName: r.client_name || 'N/A', // Nome do cliente que usou a embarcação
          employeeName: r.recorded_by_name || 'Sistema', // Nome do funcionário que registrou
          date: r.booking_date || r.created_at,
          liters: r.liters || 0,
          pricePerLiter: r.price_per_liter || 0,
          subtotal: (r.liters || 0) * (r.price_per_liter || 0) / 100, // Calculado: litros × preço/L (em centavos)
          serviceFee: 1000, // Taxa fixa: R$ 10.00 em centavos
          totalAmount: r.total_amount || 0,
          notes: r.notes,
          // Campos de pesagem (opcionais)
          litersInitial: r.liters_initial || null,
          weightFull: r.weight_full || null,
          weightAfter: r.weight_after || null,
          weightConsumed: r.weight_consumed || null,
          litersCalculated: r.liters_calculated || null,
          photoBeforeUrl: r.photo_before_url || null,
          photoAfterUrl: r.photo_after_url || null,
        }));

        // Gerar PDF
        const { generateFuelRecordsPDF } = await import('./_core/fuelRecordPDF');
        const pdfBuffer = await generateFuelRecordsPDF(mappedRecords);

        // Retornar PDF como base64
        return {
          pdf: pdfBuffer.toString('base64'),
          filename: `abastecimentos-${new Date().toISOString().split('T')[0]}.pdf`,
        };
      }),

    sendReportByEmail: publicProcedure
      .input(z.object({
        recordIds: z.array(z.number()),
        email: z.string().email(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        if (input.recordIds.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum registro selecionado' });
        }

        // Buscar registros selecionados via raw SQL
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        const ids = input.recordIds.join(',');
        const result = await db.execute(sql.raw(`
          SELECT 
            fr.*,
            b.booking_date,
            b.client_name,
            u.name as recorded_by_name
          FROM fuel_records fr
          LEFT JOIN bookings b ON fr.booking_id = b.id
          LEFT JOIN users u ON fr.recorded_by = u.id
          WHERE fr.id IN (${ids})
          ORDER BY fr.created_at DESC
        `)) as any;
        
        const records = (Array.isArray(result[0]) ? result[0] : result) as any[];

        if (!records || records.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhum registro encontrado' });
        }

        // Mapear snake_case para camelCase e calcular campos faltantes
        const mappedRecords = records.map(r => ({
          id: r.id,
          vesselName: r.vessel_name || 'N/A',
          clientName: r.client_name || 'N/A', // Nome do cliente que usou a embarcação
          employeeName: r.recorded_by_name || 'Sistema', // Nome do funcionário que registrou
          date: r.booking_date || r.created_at,
          liters: r.liters || 0,
          pricePerLiter: r.price_per_liter || 0,
          subtotal: (r.liters || 0) * (r.price_per_liter || 0) / 100, // Calculado: litros × preço/L (em centavos)
          serviceFee: 1000, // Taxa fixa: R$ 10.00 em centavos
          totalAmount: r.total_amount || 0,
          notes: r.notes,
          // Campos de pesagem (opcionais)
          litersInitial: r.liters_initial || null,
          weightFull: r.weight_full || null,
          weightAfter: r.weight_after || null,
          weightConsumed: r.weight_consumed || null,
          litersCalculated: r.liters_calculated || null,
          photoBeforeUrl: r.photo_before_url || null,
          photoAfterUrl: r.photo_after_url || null,
        }));

        // Gerar PDF
        const { generateFuelRecordsPDF } = await import('./_core/fuelRecordPDF');
        const pdfBuffer = await generateFuelRecordsPDF(mappedRecords);
        const filename = `abastecimentos-${new Date().toISOString().split('T')[0]}.pdf`;

        // Enviar email com PDF anexado
        const { sendEmail } = await import('./_core/emailService');
        
        const totalLiters = mappedRecords.reduce((sum, r) => sum + r.liters, 0) / 100;
        const totalAmount = mappedRecords.reduce((sum, r) => sum + r.totalAmount, 0) / 100;

        await sendEmail({
          to: input.email,
          subject: `Relatório de Abastecimentos - ${new Date().toLocaleDateString('pt-BR')}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); color: white; padding: 30px; text-align: center;">
                <h1 style="margin: 0; font-size: 28px;">⚓ EXCLUSIVE CLUB</h1>
                <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Sistema de Compartilhamento de Embarcações</p>
              </div>
              
              <div style="padding: 30px; background: #f9fafb;">
                <h2 style="color: #1f2937; margin-top: 0;">Relatório de Abastecimentos</h2>
                
                <p style="color: #6b7280; line-height: 1.6;">
                  Prezado(a),
                </p>
                
                <p style="color: #6b7280; line-height: 1.6;">
                  Segue em anexo o relatório de abastecimentos solicitado, contendo <strong>${records.length} registro(s)</strong>.
                </p>
                
                <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #0891b2;">
                  <h3 style="margin: 0 0 15px 0; color: #0891b2;">Resumo</h3>
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">Total de Registros:</td>
                      <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #1f2937;">${records.length}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280;">Total de Litros:</td>
                      <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #1f2937;">${totalLiters.toFixed(2)}L</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px;">Valor Total:</td>
                      <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #0891b2; font-size: 18px; border-top: 1px solid #e5e7eb; padding-top: 12px;">R$ ${totalAmount.toFixed(2)}</td>
                    </tr>
                  </table>
                </div>
                
                <p style="color: #6b7280; line-height: 1.6;">
                  O relatório completo em PDF está anexado a este email.
                </p>
                
                <p style="color: #6b7280; line-height: 1.6; margin-bottom: 0;">
                  Atenciosamente,<br>
                  <strong>Equipe Exclusive Club</strong>
                </p>
              </div>
              
              <div style="background: #1f2937; color: #9ca3af; padding: 20px; text-align: center; font-size: 12px;">
                <p style="margin: 0;">
                  Relatório gerado automaticamente em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </p>
                <p style="margin: 10px 0 0 0;">
                  © ${new Date().getFullYear()} Exclusive Club - Todos os direitos reservados
                </p>
              </div>
            </div>
          `,
          text: `
RELATÓRIO DE ABASTECIMENTOS - EXCLUSIVE CLUB

Resumo:
- Total de Registros: ${records.length}
- Total de Litros: ${totalLiters.toFixed(2)}L
- Valor Total: R$ ${totalAmount.toFixed(2)}

O relatório completo em PDF está anexado a este email.

Atenciosamente,
Equipe Exclusive Club

Relatório gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
          `,
          attachments: [{
            filename,
            content: pdfBuffer,
            contentType: 'application/pdf',
          }],
        });

        return { success: true, email: input.email };
      }),

    // Novo endpoint: generatePayment - Gerar pagamento PIX para abastecimentos selecionados
    generatePayment: publicProcedure
      .input(z.object({
        recordIds: z.array(z.number()).min(1, 'Selecione pelo menos um abastecimento'),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
        }

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        const asaas = await import('./_core/asaas');
        const { getSetting } = await import('./systemSettings');

        // Buscar ASAAS_API_KEY do banco de dados (configurações do sistema)
        let apiKey = await getSetting('asaas_api_key');
        
        // Fallback para variável de ambiente (caso esteja configurada)
        if (!apiKey) {
          apiKey = process.env.ASAAS_API_KEY || null;
        }
        
        if (!apiKey) {
          console.error('[generatePayment] ASAAS_API_KEY não configurada');
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: 'Integração de pagamento não configurada. Configure a chave API em Configurações do Admin.' 
          });
        }

        const ASAAS_API_URL = apiKey.startsWith('$aact_prod_')
          ? 'https://api.asaas.com/v3'
          : 'https://sandbox.asaas.com/api/v3';

        // Buscar abastecimentos selecionados
        const result = await db.execute(sql`
          SELECT 
            id,
            client_name as clientName,
            client_email as clientEmail,
            vessel_name as vesselName,
            liters,
            total_amount as totalAmount,
            asaas_charge_id as asaasChargeId,
            payment_status as paymentStatus
          FROM fuel_records
          WHERE id IN (${sql.raw(input.recordIds.join(','))})
            AND client_email = ${ctx.user.email}
            AND payment_status IN ('pending', 'overdue')
        `) as any;

        const records = (Array.isArray(result[0]) ? result[0] : result);

        if (records.length === 0) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Nenhum abastecimento pendente encontrado para pagamento' 
          });
        }

        // Buscar valores atualizados no Asaas (com multas/juros)
        let totalValue = 0;
        const chargeDetails: any[] = [];

        for (const record of records) {
          if (record.asaasChargeId) {
            try {
              // Buscar cobrança atualizada no Asaas
              const charge = await asaas.getCharge(record.asaasChargeId);
              totalValue += parseFloat(charge.value);
              chargeDetails.push({
                id: record.id,
                vesselName: record.vesselName,
                originalAmount: record.totalAmount / 100,
                currentAmount: parseFloat(charge.value),
                asaasChargeId: record.asaasChargeId,
              });
            } catch (error) {
              console.error('[generatePayment] Erro ao buscar cobrança:', error);
              // Se falhar, usar valor original
              totalValue += record.totalAmount / 100;
              chargeDetails.push({
                id: record.id,
                vesselName: record.vesselName,
                originalAmount: record.totalAmount / 100,
                currentAmount: record.totalAmount / 100,
                asaasChargeId: record.asaasChargeId,
              });
            }
          } else {
            // Se não tem cobrança no Asaas, usar valor original
            totalValue += record.totalAmount / 100;
            chargeDetails.push({
              id: record.id,
              vesselName: record.vesselName,
              originalAmount: record.totalAmount / 100,
              currentAmount: record.totalAmount / 100,
              asaasChargeId: null,
            });
          }
        }

        // Buscar ou criar cliente no Asaas
        const customer = await asaas.getOrCreateCustomer({
          name: records[0].clientName,
          email: records[0].clientEmail,
        });

        // Criar descrição da cobrança
        const description = records.length === 1
          ? `Abastecimento - ${records[0].vesselName}`
          : `${records.length} abastecimentos - Exclusive Club`;

        // Criar cobrança única no Asaas com PIX
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1); // Vencimento em 1 dia

        const charge = await asaas.createCharge({
          customer: customer.id,
          billingType: 'PIX',
          value: totalValue,
          dueDate: asaas.formatDateForAsaas(dueDate),
          description,
          externalReference: `MULTI-${input.recordIds.join('-')}`,
        });

        // Buscar QR Code PIX
        console.log(`[generatePayment] Buscando QR Code PIX para charge ${charge.id}`);

        try {
          const pixResponse = await fetch(`${ASAAS_API_URL}/payments/${charge.id}/pixQrCode`, {
            method: 'GET',
            headers: {
              'access_token': apiKey,
            },
          });

          if (!pixResponse.ok) {
            const errorText = await pixResponse.text();
            console.error('[generatePayment] Erro ao buscar QR Code:', {
              status: pixResponse.status,
              statusText: pixResponse.statusText,
              body: errorText,
            });
            throw new TRPCError({ 
              code: 'INTERNAL_SERVER_ERROR', 
              message: `Erro ao gerar QR Code PIX: ${pixResponse.statusText}` 
            });
          }

          const pixData = await pixResponse.json();
          console.log('[generatePayment] QR Code gerado com sucesso');

          // Validar que os dados do PIX existem
          if (!pixData.encodedImage || !pixData.payload) {
            console.error('[generatePayment] Dados do PIX incompletos:', pixData);
            throw new TRPCError({ 
              code: 'INTERNAL_SERVER_ERROR', 
              message: 'Dados do QR Code PIX estão incompletos' 
            });
          }

          // Atualizar registros com ID da cobrança consolidada
          for (const recordId of input.recordIds) {
            await db.execute(sql`
              UPDATE fuel_records
              SET 
                asaas_charge_id = ${charge.id},
                due_date = ${dueDate}
              WHERE id = ${recordId}
            `);
          }

          return {
            success: true,
            chargeId: charge.id,
            totalValue,
            qrCode: pixData.encodedImage, // Base64 da imagem QR Code
            payload: pixData.payload, // Código PIX copia-e-cola
            expirationDate: pixData.expirationDate,
            chargeDetails,
          };
        } catch (error: any) {
          console.error('[generatePayment] Erro ao processar pagamento:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao gerar pagamento: ${error.message || 'Erro desconhecido'}` 
          });
        }
      }),

    // Novo endpoint: myRecords - Cliente vê seus próprios abastecimentos
    myRecords: publicProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
        }

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT 
            fr.id,
            fr.vessel_name as vesselName,
            fr.liters,
            fr.price_per_liter as pricePerLiter,
            fr.total_amount as totalAmount,
            fr.notes,
            fr.receipt_url as receiptUrl,
            fr.asaas_charge_id as asaasChargeId,
            fr.payment_status as paymentStatus,
            fr.paid_at as paidAt,
            fr.due_date as dueDate,
            fr.created_at as createdAt,
            b.booking_date as bookingDate
          FROM fuel_records fr
          LEFT JOIN bookings b ON fr.booking_id = b.id
          WHERE fr.client_email = ${ctx.user.email}
          ORDER BY fr.created_at DESC
        `) as any;

        const records = (Array.isArray(result[0]) ? result[0] : result);

        // Mapear campos para camelCase e converter centavos para reais
        return records.map((r: any) => ({
          id: r.id,
          vesselName: r.vesselName,
          liters: r.liters / 100, // Converter centavos para reais
          pricePerLiter: r.pricePerLiter / 100,
          totalAmount: r.totalAmount / 100,
          notes: r.notes,
          receiptUrl: r.receiptUrl,
          asaasChargeId: r.asaasChargeId,
          paymentStatus: r.paymentStatus,
          paidAt: r.paidAt,
          dueDate: r.dueDate,
          createdAt: r.createdAt,
          bookingDate: r.bookingDate,
        }));
      }),

    // Novo endpoint: uploadReceipt - Upload de comprovante de pagamento
    uploadReceipt: publicProcedure
      .input(z.object({
        recordId: z.number(),
        receiptUrl: z.string().url(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        await db.execute(sql`
          UPDATE fuel_records 
          SET receipt_url = ${input.receiptUrl}
          WHERE id = ${input.recordId}
        `);

        return { success: true };
      }),

    // Novo endpoint: financialStats - Estatísticas financeiras para dashboard
    financialStats: publicProcedure
      .input(z.object({
        monthYear: z.string().optional(), // formato: YYYY-MM
      }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user || ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');

        // Se não especificado, usar mês atual
        const monthYear = input.monthYear || new Date().toISOString().slice(0, 7);

        // Buscar estatísticas do mês
        const result = await db.execute(sql`
          SELECT 
            COUNT(*) as total_records,
            SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_received,
            SUM(total_amount) as total_billed,
            SUM(CASE WHEN payment_status = 'pending' THEN total_amount ELSE 0 END) as total_pending,
            SUM(CASE WHEN payment_status = 'overdue' THEN total_amount ELSE 0 END) as total_overdue
          FROM fuel_records
          WHERE DATE_FORMAT(created_at, '%Y-%m') = ${monthYear}
        `) as any;

        const stats = (Array.isArray(result[0]) ? result[0][0] : result[0]);

        // Buscar orçamento do mês (soma das compras de combustível)
        const budgetResult = await db.execute(sql`
          SELECT COALESCE(SUM(amount_paid), 0) as total_budget
          FROM fuel_purchases
          WHERE month_year = ${monthYear}
        `) as any;

        const budgetData = (Array.isArray(budgetResult[0]) ? budgetResult[0][0] : budgetResult[0]);

        const totalReceived = Number(stats.total_received) || 0;
        const totalBilled = Number(stats.total_billed) || 0;
        const totalPending = Number(stats.total_pending) || 0;
        const totalOverdue = Number(stats.total_overdue) || 0;
        const totalBudget = Number(budgetData.total_budget) || 0;

        // Calcular saldo (Orçamento - Gasto)
        // Saldo = quanto ainda resta do orçamento mensal após os gastos
        const balance = totalBudget - totalBilled;

        return {
          monthYear,
          totalRecords: Number(stats.total_records) || 0,
          totalReceived: totalReceived / 100, // Converter centavos para reais
          totalBilled: totalBilled / 100,
          totalPending: totalPending / 100,
          totalOverdue: totalOverdue / 100,
          balance: balance / 100,
          totalBudget: totalBudget / 100,
          budgetUsagePercent: totalBudget > 0 ? (totalBilled / totalBudget) * 100 : 0,
        };
      }),
  }),

  // Fuel Budget router - Admin and Employee access
  fuelBudget: router({
    get: publicProcedure
      .input(z.object({
        monthYear: z.string(), // formato: YYYY-MM
      }))
      .query(async ({ input, ctx }) => {
        // Permitir acesso para admin e employee (funcionários precisam do preço/L)
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT * FROM fuel_budget WHERE month_year = ${input.monthYear}
        `) as any;

        const budget = (Array.isArray(result[0]) ? result[0][0] : result[0]);
        
        // Calcular orçamento total como soma das compras do histórico
        const purchasesResult = await db.execute(sql`
          SELECT COALESCE(SUM(amount_paid), 0) as total_purchases,
                 COALESCE(SUM(liters_purchased), 0) as total_liters_purchased
          FROM fuel_purchases
          WHERE month_year = ${input.monthYear}
        `) as any;
        const purchasesData = (Array.isArray(purchasesResult[0]) ? purchasesResult[0][0] : purchasesResult[0]);
        const totalBudget = Number(purchasesData.total_purchases) || 0; // Já em centavos
        const totalLitersPurchased = Number(purchasesData.total_liters_purchased) || 0; // Já em centésimos

        // Calcular total de litros já abastecidos (usados)
        const usedResult = await db.execute(sql`
          SELECT COALESCE(SUM(liters), 0) as total_liters_used
          FROM fuel_records
          WHERE DATE_FORMAT(created_at, '%Y-%m') = ${input.monthYear}
        `) as any;
        const usedData = (Array.isArray(usedResult[0]) ? usedResult[0][0] : usedResult[0]);
        const totalLitersUsed = Number(usedData.total_liters_used) || 0; // Já em centésimos

        // Estoque real = Total comprado - Total usado
        const realStockLiters = totalLitersPurchased - totalLitersUsed;

        // Buscar último preço por litro da compra mais recente
        const lastPriceResult = await db.execute(sql`
          SELECT price_per_liter
          FROM fuel_purchases
          WHERE month_year = ${input.monthYear}
          ORDER BY purchased_at DESC
          LIMIT 1
        `) as any;
        const lastPriceData = (Array.isArray(lastPriceResult[0]) ? lastPriceResult[0][0] : lastPriceResult[0]);
        const lastPricePerLiter = lastPriceData ? Number(lastPriceData.price_per_liter) : 0;

        // Calcular total gasto (soma dos abastecimentos)
        const spentResult = await db.execute(sql`
          SELECT COALESCE(SUM(total_amount), 0) as total_spent
          FROM fuel_records
          WHERE DATE_FORMAT(created_at, '%Y-%m') = ${input.monthYear}
        `) as any;
        const spentData = (Array.isArray(spentResult[0]) ? spentResult[0][0] : spentResult[0]);
        const totalSpent = Number(spentData.total_spent) || 0;

        // Calcular total recebido (pagamentos confirmados)
        const receivedResult = await db.execute(sql`
          SELECT COALESCE(SUM(total_amount), 0) as total_received
          FROM fuel_records
          WHERE DATE_FORMAT(created_at, '%Y-%m') = ${input.monthYear}
            AND payment_status = 'paid'
        `) as any;
        const receivedData = (Array.isArray(receivedResult[0]) ? receivedResult[0][0] : receivedResult[0]);
        const totalReceived = Number(receivedData.total_received) || 0;

        return {
          monthYear: input.monthYear,
          totalBudget: totalBudget / 100, // Orçamento = soma das compras
          totalSpent: totalSpent / 100, // Gasto = soma dos abastecimentos
          totalReceived: totalReceived / 100, // Recebido = pagamentos confirmados
          stockLiters: realStockLiters / 100, // Estoque = comprado - usado
          lastPricePerLiter: lastPricePerLiter / 100, // Último preço/L das compras
        };
      }),

    // REMOVIDO: endpoint 'set' não é mais necessário
    // Orçamento agora é calculado automaticamente como soma das compras
  }),

  // Fuel Purchases router - Admin only
  fuelPurchases: router({
    create: adminProcedure
      .input(z.object({
        monthYear: z.string(), // formato: YYYY-MM
        liters: z.number().positive(),
        amountPaid: z.number().positive(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        
        // Calcular preço por litro
        const pricePerLiter = Math.round((input.amountPaid * 100) / input.liters); // em centavos
        const litersPurchased = Math.round(input.liters * 100); // em centésimos
        const amountPaid = Math.round(input.amountPaid * 100); // em centavos
        
        // Inserir compra
        await db.execute(sql`
          INSERT INTO fuel_purchases (
            month_year, liters_purchased, amount_paid, price_per_liter, 
            purchased_by, notes
          )
          VALUES (
            ${input.monthYear}, ${litersPurchased}, ${amountPaid}, ${pricePerLiter},
            ${ctx.user.id}, ${input.notes || null}
          )
        `);
        
        // Atualizar estoque e preço no fuel_budget
        await db.execute(sql`
          INSERT INTO fuel_budget (month_year, total_budget, total_spent, total_received, stock_liters, last_price_per_liter)
          VALUES (${input.monthYear}, 0, 0, 0, ${litersPurchased}, ${pricePerLiter})
          ON DUPLICATE KEY UPDATE 
            stock_liters = stock_liters + ${litersPurchased},
            last_price_per_liter = ${pricePerLiter}
        `);
        
        return { success: true };
      }),

    list: adminProcedure
      .input(z.object({
        monthYear: z.string(), // formato: YYYY-MM
      }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT 
            fp.*,
            u.name as purchased_by_name
          FROM fuel_purchases fp
          LEFT JOIN users u ON fp.purchased_by = u.id
          WHERE fp.month_year = ${input.monthYear}
          ORDER BY fp.purchased_at DESC
        `) as any;

        const purchases = (Array.isArray(result[0]) ? result[0] : result) as any[];
        
        return purchases.map((p: any) => ({
          id: p.id,
          monthYear: p.month_year,
          litersPurchased: p.liters_purchased / 100, // Converter para litros
          amountPaid: p.amount_paid / 100, // Converter para reais
          pricePerLiter: p.price_per_liter / 100, // Converter para reais
          purchasedAt: p.purchased_at,
          purchasedByName: p.purchased_by_name || 'Sistema',
          notes: p.notes,
        }));
      }),

    delete: adminProcedure
      .input(z.object({
        purchaseId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { sql } = await import('drizzle-orm');
        
        // Buscar compra para devolver litros ao estoque
        const result = await db.execute(sql`
          SELECT * FROM fuel_purchases WHERE id = ${input.purchaseId}
        `) as any;
        const purchase = (Array.isArray(result[0]) ? result[0][0] : result[0]);
        
        if (!purchase) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Compra não encontrada' });
        }
        
        // Devolver litros ao estoque
        await db.execute(sql`
          UPDATE fuel_budget 
          SET stock_liters = stock_liters - ${purchase.liters_purchased}
          WHERE month_year = ${purchase.month_year}
        `);
        
        // Deletar compra
        await db.execute(sql`
          DELETE FROM fuel_purchases WHERE id = ${input.purchaseId}
        `);
        
        return { success: true };
      }),
  }),

  // Inspections router - Admin and Employee
  inspections: router({
    create: publicProcedure
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
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { inspections, vessels } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        
        // Buscar nome da embarcação
        const vessel = await db.select().from(vessels).where(eq(vessels.id, input.vesselId)).limit(1);
        if (!vessel || vessel.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Embarcação não encontrada' });
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

    list: publicProcedure
      .input(z.object({
        vesselId: z.number().optional(),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const db = await import('./db').then(m => m.getDb());
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

    getByBooking: publicProcedure
      .input(z.object({ bookingId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        const db = await import('./db').then(m => m.getDb());
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

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        const { inspections } = await import('../drizzle/schema');
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

    generateReport: publicProcedure
      .input(z.object({
        inspectionIds: z.array(z.number()).optional(),
      }).optional())
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          
          let result;
          if (input?.inspectionIds && input.inspectionIds.length > 0) {
            // Buscar vistorias específicas por IDs
            const ids = input.inspectionIds.join(',');
            result = await db.execute(sql.raw(`
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
              WHERE i.id IN (${ids})
              ORDER BY i.created_at DESC
            `)) as any;
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
          const { generateInspectionsReportPDF } = await import('./_core/inspectionsPDF');
          const { notifyOwner } = await import('./_core/notification');
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

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          
          // Buscar últimas 3 vistorias reprovadas do cliente
          const result = await db.execute(sql.raw(`
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
              AND b.client_email = '${ctx.user.email}'
            ORDER BY i.created_at DESC
            LIMIT 3
          `)) as any;
          
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

    sendReportByEmail: publicProcedure
      .input(z.object({
        inspectionIds: z.array(z.number()),
        email: z.string().email(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
        }
        
        const db = await import('./db').then(m => m.getDb());
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
          const { generateInspectionsReportPDF } = await import('./_core/inspectionsPDF');
          const pdfBuffer = await generateInspectionsReportPDF(inspections);

          // Enviar email
          const { sendEmail } = await import('./_core/emailService');
          await sendEmail({
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

          // Notificar owner
          const { notifyOwner } = await import('./_core/notification');
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
  }),

  // Inspection Charges - Cobranças de Danos
  inspectionCharges: router({
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
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          const { inspectionCharges } = await import('../drizzle/schema');
          const { createCharge, getOrCreateCustomer } = await import('./_core/asaas');
          
          // Calcular data de vencimento (7 dias padrão)
          const dueDate = input.dueDate || Date.now() + (7 * 24 * 60 * 60 * 1000);
          const dueDateStr = new Date(dueDate).toISOString().split('T')[0];
          
          if (input.chargeType === 'inspection') {
            // TIPO 1: Vistoria Reprovada
            if (!input.inspectionId || !input.failedItems) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'inspectionId e failedItems são obrigatórios para tipo inspection' });
            }
            
            // Buscar dados da vistoria
            const inspectionResult = await db.execute(sql.raw(`
              SELECT i.*, b.client_email, v.name as vessel_name
              FROM inspections i
              LEFT JOIN bookings b ON i.booking_id = b.id
              JOIN vessels v ON i.vessel_id = v.id
              WHERE i.id = ${input.inspectionId}
            `)) as any;
            
            const inspection = (Array.isArray(inspectionResult[0]) ? inspectionResult[0][0] : inspectionResult[0]);
            if (!inspection) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'Vistoria não encontrada' });
            }
            
            // Buscar ou criar customer no Asaas
            const customer = await getOrCreateCustomer({
              name: inspection.client_name || inspection.client_email,
              email: inspection.client_email,
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
            await db.insert(inspectionCharges).values({
              chargeType: 'inspection',
              inspectionId: input.inspectionId,
              vesselId: null,
              clientEmail: inspection.client_email,
              vesselName: inspection.vessel_name,
              description: null,
              failedItems: JSON.stringify(input.failedItems),
              amount: input.amount.toString(),
              dueDate: new Date(dueDate),
              asaasChargeId: asaasCharge.id,
              paymentStatus: 'pending',
              receiptUrl: null,
            });
            
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
                ac.name as client_name
              FROM client_quotas cq
              JOIN allowed_clients ac ON cq.client_id = ac.id
              WHERE cq.vessel_id = ${input.vesselId} AND cq.is_active = 1 AND ac.is_active = 1
            `)) as any;
            
            const quotas = (Array.isArray(quotasResult[0]) ? quotasResult[0] : quotasResult);
            if (quotas.length === 0) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhum cliente com cotas ativas para esta embarcação' });
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
              
              // Buscar ou criar customer no Asaas
              const customer = await getOrCreateCustomer({
                name: quota.client_name || quota.client_email,
                email: quota.client_email,
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
                dueDate: new Date(dueDate),
                asaasChargeId: asaasCharge.id,
                paymentStatus: 'pending',
                receiptUrl: input.receiptUrl || null,
              });
              
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
        const db = await import('./db').then(m => m.getDb());
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
      .query(async () => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          const result = await db.execute(sql.raw(`
            SELECT 
              ic.*,
              i.created_at as inspection_date
            FROM inspection_charges ic
            LEFT JOIN inspections i ON ic.inspection_id = i.id
            ORDER BY ic.created_at DESC
          `)) as any;
          
          const charges = (Array.isArray(result[0]) ? result[0] : result).map((row: any) => ({
            ...row,
            failed_items: typeof row.failed_items === 'string' && row.failed_items ? JSON.parse(row.failed_items) : row.failed_items,
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
      }))
      .mutation(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          const { inspectionCharges } = await import('../drizzle/schema');
          
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
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql, eq } = await import('drizzle-orm');
          const { inspectionCharges } = await import('../drizzle/schema');
          
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
              const { deleteCharge } = await import('./_core/asaas');
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

    // Cliente: Buscar vistorias reprovadas (com ou sem cobrança) + filtro de mês/ano
    myCharges: protectedProcedure
      .input(z.object({
        monthYear: z.string().optional(), // formato: YYYY-MM
      }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user?.email) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
        }

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          
          // Construir filtro de data se fornecido (aplica na data da vistoria)
          let dateFilter = '';
          if (input.monthYear) {
            const [year, month] = input.monthYear.split('-');
            dateFilter = `AND YEAR(i.created_at) = ${year} AND MONTH(i.created_at) = ${month}`;
          }
          
          // Buscar vistorias reprovadas do cliente (com ou sem cobrança)
          // Usa LEFT JOIN para pegar vistorias mesmo sem cobrança criada
          const result = await db.execute(sql.raw(`
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
              ic.payment_status,
              ic.asaas_charge_id,
              ic.receipt_url,
              ic.failed_items
            FROM inspections i
            LEFT JOIN inspection_charges ic ON ic.inspection_id = i.id AND ic.charge_type = 'inspection'
            WHERE i.status = 'rejected'
              AND i.client_name IN (
                SELECT DISTINCT client_name FROM bookings WHERE client_email = '${ctx.user.email}'
              )
              ${dateFilter}
            ORDER BY i.created_at DESC
          `)) as any;
          
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

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          
          // Buscar embarcações do cliente (via client_quotas)
          const vesselsResult = await db.execute(sql.raw(`
            SELECT DISTINCT 
              cq.vessel_id,
              CASE 
                WHEN cq.quota_type = 'full' THEN 1.0
                WHEN cq.quota_type = 'half' THEN 0.5
                ELSE 1.0
              END as quota_share
            FROM client_quotas cq
            JOIN allowed_clients ac ON cq.client_id = ac.id
            WHERE ac.email = '${ctx.user.email}' AND cq.is_active = 1
          `)) as any;
          
          const vessels = (Array.isArray(vesselsResult[0]) ? vesselsResult[0] : vesselsResult);
          if (vessels.length === 0) {
            return [];
          }
          
          const vesselIds = vessels.map((v: any) => v.vessel_id).join(',');
          const vesselQuotas = new Map<number, number>(vessels.map((v: any) => [v.vessel_id, parseFloat(v.quota_share)]));
          
          // Construir filtro de data se fornecido
          let dateFilter = '';
          if (input.monthYear) {
            const [year, month] = input.monthYear.split('-');
            dateFilter = `AND YEAR(ic.created_at) = ${year} AND MONTH(ic.created_at) = ${month}`;
          }
          
          // Buscar reparos das embarcações do cliente
          const result = await db.execute(sql.raw(`
            SELECT 
              ic.id,
              ic.charge_type as chargeType,
              ic.vessel_id as vesselId,
              ic.vessel_name as vesselName,
              ic.description,
              ic.amount,
              ic.due_date as dueDate,
              ic.payment_status as paymentStatus,
              ic.receipt_url as receiptUrl,
              ic.asaas_charge_id as asaasChargeId,
              ic.created_at as createdAt,
              ic.client_email as clientEmail
            FROM inspection_charges ic
            WHERE ic.charge_type = 'repair'
              AND ic.vessel_id IN (${vesselIds})
              AND ic.client_email = '${ctx.user.email}'
              ${dateFilter}
            ORDER BY ic.created_at DESC
          `)) as any;
          
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
        reason: z.string().min(10, 'Motivo deve ter pelo menos 10 caracteres'),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.email) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
        }

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          
          // Verificar se a cobrança pertence ao cliente
          const result = await db.execute(sql.raw(`
            SELECT * FROM inspection_charges
            WHERE id = ${input.chargeId} AND client_email = '${ctx.user.email}'
          `)) as any;
          
          const charges = (Array.isArray(result[0]) ? result[0] : result);
          if (charges.length === 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Cobrança não encontrada' });
          }
          
          const charge = charges[0];
          
          // Notificar admin
          const { notifyOwner } = await import('./_core/notification');
          const currentDueDate = new Date(charge.due_date).toLocaleDateString('pt-BR');
          const newDueDate = new Date(input.newDueDate).toLocaleDateString('pt-BR');
          
          await notifyOwner({
            title: '📅 Solicitação de Mudança de Vencimento',
            content: `**Cliente:** ${ctx.user.name || ctx.user.email}\n**Cobrança ID:** #${input.chargeId}\n**Embarcação:** ${charge.vessel_name}\n**Valor:** R$ ${parseFloat(charge.amount).toFixed(2)}\n**Vencimento Atual:** ${currentDueDate}\n**Novo Vencimento Solicitado:** ${newDueDate}\n**Motivo:** ${input.reason}`,
          });
          
          return {
            success: true,
            message: 'Solicitação enviada com sucesso! O administrador irá analisar seu pedido.',
          };
        } catch (error: any) {
          console.error('[inspectionCharges.requestDueDateChange] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao solicitar mudança: ${error.message}` 
          });
        }
      }),

    // Cliente: Estatísticas
    getStats: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user?.email) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
        }

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          const result = await db.execute(sql.raw(`
            SELECT 
              COUNT(*) as total_charges,
              SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END) as total_paid,
              SUM(CASE WHEN payment_status = 'pending' THEN amount ELSE 0 END) as total_pending,
              SUM(CASE WHEN payment_status = 'overdue' THEN amount ELSE 0 END) as total_overdue
            FROM inspection_charges
            WHERE client_email = '${ctx.user.email}'
          `)) as any;
          
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
        const db = await import('./db').then(m => m.getDb());
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

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          const { inspectionCharges } = await import('../drizzle/schema');
          
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
          const { createCharge } = await import('./_core/asaas');
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
              dueDate: dueDate,
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

        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          const ids = input.chargeIds.join(',');
          
          // Buscar cobranças
          const result = await db.execute(sql.raw(`
            SELECT * FROM inspection_charges
            WHERE id IN (${ids}) AND client_email = '${ctx.user.email}'
          `)) as any;
          
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
          const { getCharge } = await import('./_core/asaas');
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
            const { createCharge, getOrCreateCustomer, formatDateForAsaas } = await import('./_core/asaas');
            
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
            
            return {
              totalAmount,
              installments: installmentCharges,
              pixQrCode: installmentCharges[0].pixQrCode,
              pixCopyPaste: installmentCharges[0].pixCopyPaste,
            };
          }
          
          // Pagamento à vista (sem parcelamento)
          const pixData: any = {};
          
          for (const charge of charges) {
            if (charge.asaas_charge_id) {
              const asaasCharge = await getCharge(charge.asaas_charge_id);
              
              // Usar PIX da primeira cobrança
              if (!pixData.qrCode && asaasCharge.encodedImage) {
                pixData.qrCode = asaasCharge.encodedImage;
                pixData.copyPaste = asaasCharge.payload;
              }
            }
          }
          
          // Se não tem PIX, criar cobrança única no Asaas
          if (!pixData.qrCode) {
            const { createCharge, getOrCreateCustomer, formatDateForAsaas } = await import('./_core/asaas');
            
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
  }),

  // Due Date Change Requests - Solicitações de mudança de vencimento
  dueDateRequests: router({
    // Admin: Listar todas as solicitações
    list: adminProcedure
      .input(z.object({
        status: z.enum(['all', 'pending', 'approved', 'rejected']).optional(),
        monthYear: z.string().optional(), // formato: YYYY-MM
      }))
      .query(async ({ input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          
          let query = `
            SELECT 
              r.*,
              c.charge_type,
              c.vessel_name,
              c.amount,
              c.payment_status
            FROM due_date_change_requests r
            JOIN inspection_charges c ON r.charge_id = c.id
            WHERE 1=1
          `;
          
          if (input.status && input.status !== 'all') {
            query += ` AND r.status = '${input.status}'`;
          }
          
          if (input.monthYear) {
            const [year, month] = input.monthYear.split('-');
            query += ` AND YEAR(r.created_at) = ${year} AND MONTH(r.created_at) = ${month}`;
          }
          
          query += ` ORDER BY r.created_at DESC`;
          
          const result = await db.execute(sql.raw(query)) as any;
          return (Array.isArray(result[0]) ? result[0] : result);
        } catch (error: any) {
          console.error('[dueDateRequests.list] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao listar solicitações: ${error.message}` 
          });
        }
      }),

    // Admin: Aprovar solicitação
    approve: adminProcedure
      .input(z.object({
        requestId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          
          // Buscar solicitação
          const requestResult = await db.execute(sql.raw(`
            SELECT * FROM due_date_change_requests WHERE id = ${input.requestId}
          `)) as any;
          
          const requests = (Array.isArray(requestResult[0]) ? requestResult[0] : requestResult);
          if (requests.length === 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitação não encontrada' });
          }
          
          const request = requests[0];
          
          // Atualizar vencimento na cobrança
          await db.execute(sql.raw(`
            UPDATE inspection_charges
            SET due_date = '${new Date(request.new_due_date).toISOString().split('T')[0]}'
            WHERE id = ${request.charge_id}
          `));
          
          // Atualizar status da solicitação
          await db.execute(sql.raw(`
            UPDATE due_date_change_requests
            SET status = 'approved',
                processed_by = '${ctx.user?.email}',
                updated_at = NOW()
            WHERE id = ${input.requestId}
          `));
          
          // Buscar dados da cobrança para enviar email
          const chargeResult = await db.execute(sql.raw(`
            SELECT charge_type, vessel_name, client_email
            FROM inspection_charges
            WHERE id = ${request.charge_id}
          `)) as any;
          
          const charges = (Array.isArray(chargeResult[0]) ? chargeResult[0] : chargeResult);
          if (charges.length > 0) {
            const charge = charges[0];
            
            // Enviar email ao cliente confirmando
            const { notifyClientDueDateApproved } = await import('./_core/inspectionEmails');
            await notifyClientDueDateApproved({
              clientEmail: charge.client_email,
              clientName: request.client_email.split('@')[0], // Fallback: usar parte do email
              chargeType: charge.charge_type,
              vesselName: charge.vessel_name,
              newDueDate: request.new_due_date,
            }).catch(err => {
              console.error('[dueDateRequests.approve] Erro ao enviar email:', err);
              // Não falhar a operação se o email falhar
            });
          }
          
          return { success: true, message: 'Solicitação aprovada com sucesso!' };
        } catch (error: any) {
          console.error('[dueDateRequests.approve] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao aprovar solicitação: ${error.message}` 
          });
        }
      }),

    // Admin: Rejeitar solicitação
    reject: adminProcedure
      .input(z.object({
        requestId: z.number(),
        reason: z.string().min(10, 'Motivo deve ter pelo menos 10 caracteres'),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await import('./db').then(m => m.getDb());
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        try {
          const { sql } = await import('drizzle-orm');
          
          // Buscar solicitação antes de atualizar
          const requestResult = await db.execute(sql.raw(`
            SELECT * FROM due_date_change_requests WHERE id = ${input.requestId}
          `)) as any;
          
          const requests = (Array.isArray(requestResult[0]) ? requestResult[0] : requestResult);
          if (requests.length === 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitação não encontrada' });
          }
          
          const request = requests[0];
          
          // Atualizar status da solicitação
          await db.execute(sql.raw(`
            UPDATE due_date_change_requests
            SET status = 'rejected',
                admin_response = '${input.reason.replace(/'/g, "\\'")}',
                processed_by = '${ctx.user?.email}',
                updated_at = NOW()
            WHERE id = ${input.requestId}
          `));
          
          // Buscar dados da cobrança para enviar email
          const chargeResult = await db.execute(sql.raw(`
            SELECT charge_type, vessel_name, client_email
            FROM inspection_charges
            WHERE id = ${request.charge_id}
          `)) as any;
          
          const charges = (Array.isArray(chargeResult[0]) ? chargeResult[0] : chargeResult);
          if (charges.length > 0) {
            const charge = charges[0];
            
            // Enviar email ao cliente explicando
            const { notifyClientDueDateRejected } = await import('./_core/inspectionEmails');
            await notifyClientDueDateRejected({
              clientEmail: charge.client_email,
              clientName: request.client_email.split('@')[0], // Fallback: usar parte do email
              chargeType: charge.charge_type,
              vesselName: charge.vessel_name,
              reason: input.reason,
            }).catch(err => {
              console.error('[dueDateRequests.reject] Erro ao enviar email:', err);
              // Não falhar a operação se o email falhar
            });
          }
          
          return { success: true, message: 'Solicitação rejeitada com sucesso!' };
        } catch (error: any) {
          console.error('[dueDateRequests.reject] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao rejeitar solicitação: ${error.message}` 
          });
        }
      }),

    // Admin: Estatísticas
    stats: adminProcedure.query(async () => {
      const db = await import('./db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');
        
        const result = await db.execute(sql.raw(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
          FROM due_date_change_requests
        `)) as any;
        
        const stats = (Array.isArray(result[0]) ? result[0][0] : result[0]);
        
        return {
          total: Number(stats.total) || 0,
          pending: Number(stats.pending) || 0,
          approved: Number(stats.approved) || 0,
          rejected: Number(stats.rejected) || 0,
        };
      } catch (error: any) {
        console.error('[dueDateRequests.stats] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao buscar estatísticas: ${error.message}` 
          });
        }
      }),
  }),

  // System Settings (Admin only) - Workaround for Manus env injection bug
  systemSettings: router({
    get: adminProcedure
      .input(z.object({ key: z.string() }))
      .query(async ({ input }) => {
        const value = await systemSettings.getSetting(input.key);
        return { value };
      }),
    
    set: adminProcedure
      .input(z.object({
        key: z.string(),
        value: z.string(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await systemSettings.setSetting(
          input.key,
          input.value,
          input.description,
          ctx.user.email || undefined
        );
        return { success: true };
      }),
    
    list: adminProcedure.query(async () => {
      return await systemSettings.listSettings();
    }),
    
    delete: adminProcedure
      .input(z.object({ key: z.string() }))
      .mutation(async ({ input }) => {
        await systemSettings.deleteSetting(input.key);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
