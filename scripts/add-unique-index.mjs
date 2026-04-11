/**
 * Script: Adicionar índice único (subscription_id, due_date) em subscription_charges
 * Protege contra duplicatas de forma estrutural no banco.
 *
 * Antes de adicionar o índice, remove quaisquer duplicatas residuais que
 * impediriam a criação do índice.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log("=== Adicionando índice único em subscription_charges ===\n");

// 1. Verificar se o índice já existe
const [existingIndexes] = await conn.execute(`
  SHOW INDEX FROM subscription_charges WHERE Key_name = 'uq_subscription_due_date'
`);

if (existingIndexes.length > 0) {
  console.log("✅ Índice uq_subscription_due_date já existe. Nada a fazer.");
  await conn.end();
  process.exit(0);
}

// 2. Verificar duplicatas residuais que impediriam o índice
const [dupes] = await conn.execute(`
  SELECT subscription_id, due_date, COUNT(*) as cnt
  FROM subscription_charges
  WHERE subscription_id IS NOT NULL AND due_date IS NOT NULL
  GROUP BY subscription_id, due_date
  HAVING cnt > 1
`);

if (dupes.length > 0) {
  console.log(`⚠️  Encontradas ${dupes.length} combinações duplicadas. Removendo antes de criar o índice...\n`);

  let totalRemoved = 0;
  for (const dupe of dupes) {
    // Manter o registro mais antigo (menor ID), deletar os demais
    const [rows] = await conn.execute(`
      SELECT id FROM subscription_charges
      WHERE subscription_id = ? AND due_date = ?
      ORDER BY id ASC
    `, [dupe.subscription_id, dupe.due_date]);

    const keepId = rows[0].id;
    const deleteIds = rows.slice(1).map(r => r.id);

    if (deleteIds.length > 0) {
      await conn.execute(
        `DELETE FROM subscription_charges WHERE id IN (${deleteIds.map(() => "?").join(",")})`,
        deleteIds
      );
      console.log(`  Subscription ${dupe.subscription_id} / ${dupe.due_date}: mantido ID ${keepId}, removidos ${deleteIds.join(", ")}`);
      totalRemoved += deleteIds.length;
    }
  }
  console.log(`\n✅ ${totalRemoved} duplicatas removidas.\n`);
} else {
  console.log("✅ Nenhuma duplicata residual encontrada.\n");
}

// 3. Criar o índice único
console.log("Criando índice UNIQUE KEY uq_subscription_due_date (subscription_id, due_date)...");
try {
  await conn.execute(`
    ALTER TABLE subscription_charges
    ADD CONSTRAINT uq_subscription_due_date UNIQUE KEY (subscription_id, due_date)
  `);
  console.log("✅ Índice criado com sucesso!\n");
} catch (err) {
  if (err.message.includes("Duplicate entry")) {
    console.error("❌ Ainda existem duplicatas. Execute o script de auditoria novamente.");
  } else {
    throw err;
  }
}

// 4. Confirmar
const [finalIndexes] = await conn.execute(`
  SHOW INDEX FROM subscription_charges WHERE Key_name = 'uq_subscription_due_date'
`);
console.log(`Verificação final: ${finalIndexes.length > 0 ? "✅ Índice presente" : "❌ Índice ausente"}`);

await conn.end();
console.log("\nConcluído.");
