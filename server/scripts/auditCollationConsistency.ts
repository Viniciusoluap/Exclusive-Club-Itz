/**
 * Story 14 (Fase 1, DB-20): verifica que todas as colunas de
 * email/client_email — a base de todo o isolamento por dono
 * (Story 12/DB-03, SQLi fixes DB-02) — usam o mesmo charset/collation.
 * drizzle-orm (mysql-core) não expõe charset/collation por coluna na API
 * do schema.ts, então essa consistência não pode ser garantida em
 * compile-time; este script confirma em runtime, contra o information_schema
 * real, que não há divergência.
 *
 * Uso: pnpm tsx server/scripts/auditCollationConsistency.ts
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";

interface ColumnCollation {
  table: string;
  column: string;
  charset: string | null;
  collation: string | null;
}

export async function findEmailColumnCollations(): Promise<ColumnCollation[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = (await db.execute(sql`
    SELECT TABLE_NAME as tbl, COLUMN_NAME as col, CHARACTER_SET_NAME as charset, COLLATION_NAME as collation
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND COLUMN_NAME LIKE '%email%'
    ORDER BY TABLE_NAME, COLUMN_NAME
  `)) as any;
  const list = Array.isArray(rows[0]) ? rows[0] : rows;

  return (list as any[]).map((row) => ({
    table: row.tbl,
    column: row.col,
    charset: row.charset,
    collation: row.collation,
  }));
}

export async function auditCollationConsistency(): Promise<{ consistent: boolean; columns: ColumnCollation[] }> {
  console.log("[auditCollationConsistency] Verificando charset/collation das colunas de email...\n");

  const columns = await findEmailColumnCollations();
  if (columns.length === 0) {
    console.log("Nenhuma coluna de email encontrada.");
    return { consistent: true, columns };
  }

  const collationSet = new Set(columns.map((c) => c.collation));
  const charsetSet = new Set(columns.map((c) => c.charset));

  for (const c of columns) {
    console.log(`   ${c.table}.${c.column}: ${c.charset ?? "NULL"} / ${c.collation ?? "NULL"}`);
  }

  const consistent = collationSet.size === 1 && charsetSet.size === 1;
  if (consistent) {
    console.log(`\n✅ Todas as ${columns.length} colunas de email usam o mesmo charset/collation.`);
  } else {
    console.log(
      `\n⚠️  MISMATCH: encontrados ${charsetSet.size} charset(s) e ${collationSet.size} collation(s) ` +
      `diferentes entre colunas de email — joins/comparações por client_email entre essas colunas ` +
      `podem não casar como esperado.`
    );
  }

  return { consistent, columns };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  auditCollationConsistency()
    .then(({ consistent }) => process.exit(consistent ? 0 : 1))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
