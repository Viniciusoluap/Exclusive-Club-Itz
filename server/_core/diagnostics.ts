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

/** Variáveis que o sistema precisa para funcionar por completo. */
const REQUIRED_ENV = [
  "DATABASE_URL",
  "SMTP_PASS",
  "BACKUP_ENCRYPTION_KEY",
  "ASAAS_API_KEY",
  "ASAAS_WEBHOOK_TOKEN",
  "JWT_SECRET",
  "SETTINGS_ENCRYPTION_KEY",
] as const;

export type EnvVarStatus = {
  name: string;
  present: boolean;
  length: number;
};

export function checkEnvVars(): EnvVarStatus[] {
  return REQUIRED_ENV.map((name) => {
    const raw = process.env[name];
    const value = typeof raw === "string" ? raw.trim() : "";
    return { name, present: value.length > 0, length: value.length };
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
    missingCount: envVars.filter((v) => !v.present).length,
  };
}
