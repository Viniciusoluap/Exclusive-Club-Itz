import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { backupRouter } from "./routers/backupRouter";
import { reportsRouter } from "./routers/reportsRouter";
import { expensesRouter } from "./routers/expensesRouter";
import { bpoRouter } from "./routers/bpoRouter";
import { contractRouter } from "./routers/contractRouter";
import { notificationRouter } from "./routers/notificationRouter";
import { fuelRecordsRouter, fuelBudgetRouter, fuelPurchasesRouter } from "./routers/fuelRouter";
import { inspectionsRouter, inspectionChargesRouter } from "./routers/inspectionsRouter";
import { bookingsRouter } from "./routers/bookingsRouter";
import { maintenancesRouter } from "./routers/maintenancesRouter";
import { dueDateRequestsRouter } from "./routers/dueDateRequestsRouter";
import { clientPaymentsRouter } from "./routers/clientPaymentsRouter";
import { systemSettingsRouter } from "./routers/systemSettingsRouter";
import { openFinanceRouter } from "./routers/openFinanceRouter";
import { allowedClientsRouter } from "./routers/allowedClientsRouter";
import { vesselsRouter } from "./routers/vesselsRouter";
import { reviewsRouter } from "./routers/reviewsRouter";
import { employeeRouter, employeesRouter } from "./routers/employeesRouter";
import { publicProcedure, protectedProcedure, adminProcedure, employeeProcedure, allowedClientProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { notifyNewBooking, notifyBookingCancellation, notifyBookingUsed, notifyClientMaintenanceCancellation, notifyAdminMaintenanceCancellations, notifyClientBookingConfirmation, notifyClientBookingCancellation, notifyAdminMaintenanceStatusChange, notifyClientsMaintenanceStatusChange } from "./_core/emailNotification";
import { notifyOwner } from "./_core/notification";
import { sendWelcomeEmail } from "./_core/welcomeEmail";
import * as db from "./db";
import * as stats from "./stats";
import * as weather from "./weather";
import * as systemSettings from "./systemSettings";
import { sql } from "drizzle-orm";

export const appRouter = router({
  system: systemRouter,
  backup: backupRouter,
  reports: reportsRouter,
  expenses: expensesRouter,
  bpo: bpoRouter,
  contract: contractRouter,
  notification: notificationRouter,
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
    updateEmail: protectedProcedure
      .input(z.object({ email: z.string().email("Email inválido") }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserEmail(ctx.user.id, input.email);
        return { success: true };
      }),
  }),

  // Extraídos para server/routers/ (Story 40, SYS-03)
  allowedClients: allowedClientsRouter,
  vessels: vesselsRouter,

  // Bookings & Maintenances — extraídos para server/routers/ (Story 40, SYS-03)
  bookings: bookingsRouter,
  maintenances: maintenancesRouter,

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

  reviews: reviewsRouter,
  employee: employeeRouter,
  employees: employeesRouter,

  // Fuel domain — extraído para server/routers/fuelRouter.ts (Story 40, SYS-03)
  fuelRecords: fuelRecordsRouter,
  fuelBudget: fuelBudgetRouter,
  fuelPurchases: fuelPurchasesRouter,

  // Inspections domain — extraído para server/routers/inspectionsRouter.ts (Story 40, SYS-03)
  inspections: inspectionsRouter,
  inspectionCharges: inspectionChargesRouter,

  // Extraídos para server/routers/ (Story 40, SYS-03)
  dueDateRequests: dueDateRequestsRouter,
  clientPayments: clientPaymentsRouter,
  systemSettings: systemSettingsRouter,
  openFinance: openFinanceRouter,
});
export type AppRouter = typeof appRouter;
