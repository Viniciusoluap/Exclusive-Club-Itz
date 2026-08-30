import mysql from "mysql2/promise";
import { databaseConnectionConfig } from "../../scripts/asaas_rebuild.mjs";
import { stagingConnectionUrl } from "./asaasStagingDryRun";

/**
 * Rota administrativa isolada e somente leitura para conferir o schema
 * candidato de staging (contagens-marco já usadas na validação da Fase 2),
 * sem qualquer relação com a conexão principal do app — login, reservas e
 * qualquer tráfego real continuam sempre na DATABASE_URL ativa.
 *
 * Gate duplo, ambos obrigatórios:
 *   1. STAGING_VALIDATION_ENABLED === "true" — desligar a flag é o rollback
 *      completo: como nada aqui é escrito, não sobra estado nenhum.
 *   2. stagingConnectionUrl() — mesma validação já usada no dry-run do
 *      Asaas: recusa se STAGING_DATABASE_URL faltar, for igual à conexão
 *      ativa, ou o schema não tiver "staging" no nome.
 */

const MILESTONE_TABLES = [
  "allowed_clients",
  "bpo_charges",
  "expense_records",
  "client_quotas",
] as const;

export type StagingValidationReport = {
  counts: Record<(typeof MILESTONE_TABLES)[number], number>;
};

export function isStagingValidationEnabled(env = process.env): boolean {
  return env.STAGING_VALIDATION_ENABLED === "true";
}

export class StagingValidationDisabledError extends Error {
  constructor() {
    super(
      "Validação de staging desativada (STAGING_VALIDATION_ENABLED != \"true\")."
    );
    this.name = "StagingValidationDisabledError";
  }
}

export async function runStagingValidation(): Promise<StagingValidationReport> {
  if (!isStagingValidationEnabled()) {
    throw new StagingValidationDisabledError();
  }

  const databaseUrl = stagingConnectionUrl();
  const config = databaseConnectionConfig(databaseUrl);
  // mysql2 tem overloads distintos para string vs. objeto de opções — a
  // união de databaseConnectionConfig() não casa com nenhum dos dois direto,
  // então o narrowing por typeof escolhe o overload certo em cada ramo.
  const connection =
    typeof config === "string"
      ? await mysql.createConnection(config)
      : await mysql.createConnection(config);

  try {
    const counts = {} as StagingValidationReport["counts"];
    for (const table of MILESTONE_TABLES) {
      // Nomes de tabela vêm de uma lista fixa acima (nunca de input do
      // usuário), então a interpolação aqui não abre espaço para injeção.
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS n FROM \`${table}\``
      );
      counts[table] = Number(rows[0]?.n ?? 0);
    }
    return { counts };
  } finally {
    await connection.end().catch(() => undefined);
  }
}
