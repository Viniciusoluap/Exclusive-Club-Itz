/**
 * Migração segura: adiciona colunas novas à tabela unclassified_charges
 * sem deletar tabelas existentes nem causar perda de dados.
 */

import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import dotenv from "dotenv";
dotenv.config();

const db = drizzle(process.env.DATABASE_URL);

async function runSQL(query) {
  try {
    await db.execute(sql.raw(query));
    console.log(`  ✓ ${query.substring(0, 80)}...`);
    return true;
  } catch (err) {
    if (err.message.includes("Duplicate column name") || err.message.includes("already exists")) {
      console.log(`  ⚠ Já existe: ${query.substring(0, 80)}`);
      return true;
    }
    console.error(`  ✗ Erro: ${err.message}`);
    return false;
  }
}

async function migrate() {
  console.log("🔧 Aplicando migração na tabela unclassified_charges...\n");

  // 1. Adicionar coluna asaas_status (status original do Asaas, ex: RECEIVED, PENDING)
  await runSQL(`ALTER TABLE unclassified_charges ADD COLUMN asaas_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' AFTER status`);

  // 2. Adicionar coluna last_synced_at (controle de sincronização)
  await runSQL(`ALTER TABLE unclassified_charges ADD COLUMN last_synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_at`);

  // 3. Adicionar índices para performance
  await runSQL(`ALTER TABLE unclassified_charges ADD INDEX uc_asaas_customer_id (asaas_customer_id)`);
  await runSQL(`ALTER TABLE unclassified_charges ADD INDEX uc_status_idx (status)`);
  await runSQL(`ALTER TABLE unclassified_charges ADD INDEX uc_classified_idx (classified)`);

  // 4. Verificar estrutura final
  console.log("\n📋 Estrutura atual da tabela:");
  const cols = await db.execute(sql.raw("DESCRIBE unclassified_charges"));
  for (const col of cols[0]) {
    console.log(`  - ${col.Field} (${col.Type}) ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'} DEFAULT: ${col.Default}`);
  }

  console.log("\n✅ Migração concluída com sucesso!");
}

migrate().catch(console.error).finally(() => process.exit(0));
