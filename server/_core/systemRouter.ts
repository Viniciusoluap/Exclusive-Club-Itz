import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { collectDiagnostics } from "./diagnostics";
import { sdk } from "./sdk";
import {
  AsaasStagingDryRunAlreadyRunningError,
  getAsaasStagingDryRunStatus,
  startAsaasStagingDryRun,
} from "./asaasStagingDryRun";

export const systemRouter = router({
  /**
   * Diagnóstico de ambiente (admin). Responde qual versão do código está no ar
   * e quais variáveis de ambiente o processo realmente enxerga.
   *
   * Nunca devolve o valor de um segredo — apenas presença e tamanho.
   */
  diagnostics: adminProcedure.query(async () => collectDiagnostics()),

  asaasStagingDryRun: adminProcedure.mutation(() => {
    try {
      return startAsaasStagingDryRun();
    } catch (error) {
      if (error instanceof AsaasStagingDryRunAlreadyRunningError) {
        throw new TRPCError({ code: "CONFLICT", message: error.message });
      }
      throw error;
    }
  }),

  asaasStagingDryRunStatus: adminProcedure.query(() =>
    getAsaasStagingDryRunStatus()
  ),

  /**
   * Diagnóstico público do cookie de sessão da requisição atual. Existe para
   * o caso em que o login falha justamente para quem chamaria: se a sessão
   * está quebrada, adminProcedure (acima) é inacessível para essa pessoa, e
   * o retorno de auth.me (null) não diferencia "sem cookie" de "cookie
   * inválido". Nunca expõe o valor do cookie nem do segredo — só presença e
   * a categoria da falha, o suficiente para diagnosticar sem log do servidor.
   */
  sessionDebug: publicProcedure.query(({ ctx }) => sdk.debugSessionCookie(ctx.req)),

  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
