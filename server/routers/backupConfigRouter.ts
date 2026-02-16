import { router, adminProcedure } from '../_core/trpc';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const CREDENTIALS_PATH = path.join(process.cwd(), 'google-drive-credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'google-drive-token.json');

export const backupConfigRouter = router({
  /**
   * Verifica se as credenciais do Google Drive estão configuradas
   */
  getStatus: adminProcedure.query(async () => {
    const hasCredentials = fs.existsSync(CREDENTIALS_PATH);
    const hasToken = fs.existsSync(TOKEN_PATH);

    return {
      hasCredentials,
      hasToken,
      isConfigured: hasCredentials && hasToken,
    };
  }),

  /**
   * Salva as credenciais do Google Drive (credentials.json)
   */
  saveCredentials: adminProcedure
    .input(z.object({
      credentials: z.string(), // JSON string do arquivo credentials.json
    }))
    .mutation(async ({ input }) => {
      try {
        // Valida se é um JSON válido
        const parsed = JSON.parse(input.credentials);
        
        // Verifica se tem a estrutura esperada
        if (!parsed.installed && !parsed.web) {
          throw new Error('Arquivo de credenciais inválido. Certifique-se de baixar o arquivo correto do Google Cloud Console.');
        }

        // Salva o arquivo
        fs.writeFileSync(CREDENTIALS_PATH, input.credentials, 'utf-8');

        return {
          success: true,
          message: 'Credenciais salvas com sucesso! Agora você precisa autenticar com o Google Drive.',
        };
      } catch (error: any) {
        throw new Error(`Erro ao salvar credenciais: ${error.message}`);
      }
    }),

  /**
   * Remove as credenciais e token (reset)
   */
  resetConfig: adminProcedure.mutation(async () => {
    try {
      if (fs.existsSync(CREDENTIALS_PATH)) {
        fs.unlinkSync(CREDENTIALS_PATH);
      }
      if (fs.existsSync(TOKEN_PATH)) {
        fs.unlinkSync(TOKEN_PATH);
      }

      return {
        success: true,
        message: 'Configuração removida com sucesso.',
      };
    } catch (error: any) {
      throw new Error(`Erro ao remover configuração: ${error.message}`);
    }
  }),
});
