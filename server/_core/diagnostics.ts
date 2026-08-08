/**
 * Diagnóstico de ambiente — responde "o que está realmente rodando em produção?"
 *
 * SEGURANÇA: este módulo NUNCA retorna o valor de um segredo. Só reporta
 * presença (booleano) e tamanho (número), que são suficientes para distinguir
 * "variável não configurada" de "variável configurada com valor errado", sem
 * expor a credencial em tela, em print ou em log.
 */

import nodemailer from "nodemailer";
import { BUILD_MARKER, PROCESS_STARTED_AT } from "./buildInfo";

/**
 * Variáveis do ambiente e o que a ausência de cada uma REALMENTE significa.
 *
 * POR QUE ISTO NÃO É UMA LISTA SIMPLES: a versão anterior marcava todas como
 * obrigatórias e pintava duas de vermelho sem motivo. `ASAAS_API_KEY` tem
 * fallback para a tela de Configurações, e `SETTINGS_ENCRYPTION_KEY` cai para o
 * JWT_SECRET. Nos dois casos o sistema funciona — mas o diagnóstico dizia
 * "2 faltando", mandando procurar problema onde não havia.
 *
 * Alarme falso é pior que alarme nenhum: ensina a ignorar a tela justamente
 * quando ela estiver certa.
 */
const ENV_ESPERADAS = [
  { nome: "DATABASE_URL", critica: true, nota: "Sem ela o sistema não conecta ao banco." },
  { nome: "SMTP_PASS", critica: true, nota: "Sem ela nenhum email é enviado." },
  { nome: "BACKUP_ENCRYPTION_KEY", critica: true, nota: "Sem ela o backup aborta antes de começar." },
  { nome: "JWT_SECRET", critica: true, nota: "Sem ele ninguém consegue entrar no sistema." },
  { nome: "ASAAS_WEBHOOK_TOKEN", critica: true, nota: "Sem ele os avisos de pagamento do Asaas são recusados." },
  {
    nome: "ASAAS_API_KEY",
    critica: false,
    nota: "Opcional aqui: se ausente, o sistema usa a chave salva em Configurações.",
  },
  {
    nome: "SETTINGS_ENCRYPTION_KEY",
    critica: false,
    nota: "Opcional: sem ela as configurações são cifradas com o JWT_SECRET. Definir agora exige re-salvar as configurações existentes.",
  },
] as const;

export type EnvVarStatus = {
  name: string;
  present: boolean;
  length: number;
  /** Ausência impede o sistema de funcionar? */
  critica: boolean;
  nota: string;
};

export function checkEnvVars(): EnvVarStatus[] {
  return ENV_ESPERADAS.map(({ nome, critica, nota }) => {
    const raw = process.env[nome];
    const value = typeof raw === "string" ? raw.trim() : "";
    return { name: nome, present: value.length > 0, length: value.length, critica, nota };
  });
}

/**
 * Valida a chave de criptografia de backup SEM rodar um backup.
 * Espelha exatamente a regra de server/backup.ts (>= 32 caracteres).
 */
export function checkBackupKey(): { ok: boolean; reason: string } {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) {
    return {
      ok: false,
      reason:
        "BACKUP_ENCRYPTION_KEY ausente. O backup aborta ANTES de registrar qualquer tentativa no histórico — por isso nenhuma linha nova aparece na tela de backups.",
    };
  }
  if (raw.trim().length < 32) {
    return {
      ok: false,
      reason: `BACKUP_ENCRYPTION_KEY tem apenas ${raw.trim().length} caracteres; o mínimo é 32.`,
    };
  }
  return { ok: true, reason: "Chave presente e com tamanho válido." };
}

/**
 * Testa a conexão SMTP de verdade e devolve a mensagem de erro REAL.
 * Hoje o usuário só vê "Verifique as configurações SMTP", que não diz nada
 * sobre a causa (credencial errada? host bloqueado? porta fechada?).
 */
export async function checkSmtp(): Promise<{ ok: boolean; detail: string }> {
  const pass = process.env.SMTP_PASS;
  if (!pass || pass.trim().length === 0) {
    return {
      ok: false,
      detail:
        "SMTP_PASS não está definida no processo. O envio falha na autenticação, sem sequer tentar credencial.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.titan.email",
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER || "atendimento@exclusiveclubitz.com",
      pass,
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  });

  try {
    await transporter.verify();
    return { ok: true, detail: "Conexão e autenticação SMTP OK." };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Defesa em profundidade: alguns servidores ecoam a linha de autenticação na
    // mensagem de erro. Nunca deixar a senha sair daqui, nem em tela nem em print.
    const safe = message.split(pass).join("***");
    return { ok: false, detail: safe };
  } finally {
    transporter.close();
  }
}

export async function collectDiagnostics() {
  const envVars = checkEnvVars();
  const backup = checkBackupKey();
  const smtp = await checkSmtp();

  return {
    buildMarker: BUILD_MARKER,
    processStartedAt: PROCESS_STARTED_AT,
    serverTime: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV ?? "(não definido)",
    envVars,
    backup,
    smtp,
    // Estado das migrações do banco na última subida do servidor.
    //
    // POR QUE APARECE AQUI: durante toda esta auditoria, "a migração chegou no
    // banco?" foi uma pergunta sem resposta — e cada vez que ela ficou sem
    // resposta, custou uma rodada de investigação. Agora a tela responde.
    migracoes: (globalThis as any).__ultimaMigracao ?? null,
    // Só o que de fato impede o sistema de funcionar. Contar as opcionais
    // aqui era o que produzia o "2 faltando" enganoso.
    missingCount: envVars.filter((v) => !v.present && v.critica).length,
    opcionaisAusentes: envVars.filter((v) => !v.present && !v.critica).length,
  };
}
