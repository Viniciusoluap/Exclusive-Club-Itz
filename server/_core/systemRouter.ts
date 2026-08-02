import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { collectDiagnostics } from "./diagnostics";

export const systemRouter = router({
  /**
   * Diagnóstico de ambiente (admin). Responde qual versão do código está no ar
   * e quais variáveis de ambiente o processo realmente enxerga.
   *
   * Nunca devolve o valor de um segredo — apenas presença e tamanho.
   */
  diagnostics: adminProcedure.query(async () => collectDiagnostics()),

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
