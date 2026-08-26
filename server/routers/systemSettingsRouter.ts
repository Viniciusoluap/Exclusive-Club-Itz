/**
 * System Settings Router — configurações do sistema (admin)
 *
 * Extraído de server/routers.ts (Story 40, SYS-03) sem alteração de
 * comportamento: montado em appRouter sob a mesma chave de antes.
 */
import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import * as systemSettings from "../systemSettings";

// System Settings (Admin only) - Workaround for Manus env injection bug
export const systemSettingsRouter = router({
  // Compatibilidade: nunca retorna o valor descriptografado ao frontend.
  get: adminProcedure
    .input(z.object({ key: z.string().min(1).max(100) }))
    .query(async ({ input }) => ({
      value: null,
      configured: await systemSettings.hasSetting(input.key),
    })),

  getStatus: adminProcedure
    .input(z.object({ key: z.string().min(1).max(100) }))
    .query(async ({ input }) => ({
      configured: await systemSettings.hasSetting(input.key),
    })),

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

  testPluggyConnection: adminProcedure.mutation(async () => {
    const { testPluggyConnection } = await import("../openFinance");
    return await testPluggyConnection();
  }),

  testConnection: adminProcedure
    .mutation(async () => {
      const { resolveAsaasApiKey, resolveAsaasApiUrl } = await import('../_core/asaas');
      const apiKey = await resolveAsaasApiKey();
      if (!apiKey) {
        return { success: false, message: 'Chave API não configurada. Salve a chave antes de testar.' };
      }
      const isProd = apiKey.startsWith('$aact_prod_');
      const apiUrl = resolveAsaasApiUrl(apiKey);
      const env = isProd ? 'Produção' : 'Sandbox';
      try {
        const resp = await fetch(`${apiUrl}/myAccount`, {
          headers: { 'access_token': apiKey, 'Content-Type': 'application/json' },
        });
        const data = await resp.json() as any;
        if (resp.ok && data.name) {
          return {
            success: true,
            message: `Conexão OK (${env}) — Conta: ${data.name}`,
            account: data.name as string,
            environment: env,
          };
        } else {
          const errMsg = (data?.errors?.[0]?.description || data?.message || 'Chave inválida ou sem permissão') as string;
          return { success: false, message: `Erro (${env}): ${errMsg}` };
        }
      } catch (err: any) {
        return { success: false, message: `Falha de rede ao conectar ao Asaas: ${err.message}` };
      }
    }),
});
