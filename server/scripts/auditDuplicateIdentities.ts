/**
 * Story 13 (Fase 1, DB-09/DB-14): relatório somente-leitura de duplicatas em
 * chaves naturais (users.email/openId, allowed_clients.email,
 * employees.email) — roda ANTES da migration 0002_unique_email_openid.sql,
 * que falha com "Duplicate entry" se qualquer uma dessas tabelas tiver
 * duplicatas reais. Diferente do dedup de webhook_logs (Story 9, dado de
 * auditoria sem significado de negócio), aqui NÃO há remoção automática:
 * users/allowed_clients carregam identidade real (login, histórico de
 * cliente), e decidir qual linha "vence" exige revisão humana.
 *
 * Uso: pnpm tsx server/scripts/auditDuplicateIdentities.ts
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";

interface DuplicateGroup {
  key: string;
  count: number;
  ids: number[];
}

async function findDuplicates(
  table: string,
  column: string,
  whereNotNull = false
): Promise<DuplicateGroup[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const whereClause = whereNotNull ? sql`WHERE ${sql.raw(column)} IS NOT NULL` : sql``;
  const rows = (await db.execute(sql`
    SELECT ${sql.raw(column)} as dup_key, COUNT(*) as dup_count, GROUP_CONCAT(id) as dup_ids
    FROM ${sql.raw(table)}
    ${whereClause}
    GROUP BY ${sql.raw(column)}
    HAVING COUNT(*) > 1
  `)) as any;
  const list = Array.isArray(rows[0]) ? rows[0] : rows;

  return (list as any[]).map((row) => ({
    key: String(row.dup_key),
    count: Number(row.dup_count),
    ids: String(row.dup_ids).split(",").map(Number),
  }));
}

async function reportTable(label: string, table: string, column: string, whereNotNull = false) {
  const duplicates = await findDuplicates(table, column, whereNotNull);
  if (duplicates.length === 0) {
    console.log(`✅ ${label}: nenhuma duplicata encontrada.`);
    return;
  }
  console.log(`⚠️  ${label}: ${duplicates.length} valor(es) duplicado(s):`);
  for (const dup of duplicates) {
    console.log(`   - "${dup.key}" aparece ${dup.count}x (ids: ${dup.ids.join(", ")})`);
  }
}

export async function auditDuplicateIdentities(): Promise<void> {
  console.log("[auditDuplicateIdentities] Verificando duplicatas em chaves naturais...\n");

  await reportTable("users.open_id", "users", "openId");
  await reportTable("users.email (ignorando NULL)", "users", "email", true);
  await reportTable("allowed_clients.email", "allowed_clients", "email");
  await reportTable("employees.email", "employees", "email");

  console.log(
    "\n[auditDuplicateIdentities] Concluído. Duplicatas encontradas acima precisam de " +
    "revisão manual (qual linha manter, o que fazer com dados relacionados) antes de " +
    "aplicar drizzle/0002_unique_email_openid.sql."
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  auditDuplicateIdentities()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
