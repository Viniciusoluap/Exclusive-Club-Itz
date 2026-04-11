/**
 * Script de correção de cobranças duplicadas no BPO Financeiro.
 * 
 * AÇÃO 1: Remove duplicatas exatas (mesmo subscription_id + due_date + type + value)
 *   - Mantém o registro mais antigo (menor ID) que tenha asaas_payment_id, ou o menor ID
 *   - Deleta os registros mais novos (IDs 150xxx e 270xxx criados por autoClassifyAll)
 * 
 * AÇÃO 2: Atualiza status de cobranças pagas no Asaas mas pendentes localmente
 *   - Cruza unclassified_charges (paid) com subscription_charges (pending/overdue)
 *   - Atualiza status para 'paid'
 * 
 * AÇÃO 3: Corrige o bug no autoClassifyAll (feito via código, não SQL)
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL não configurada');
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);

console.log('='.repeat(80));
console.log('CORREÇÃO DE COBRANÇAS DUPLICADAS - BPO FINANCEIRO');
console.log('='.repeat(80));
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// AÇÃO 1: Remover duplicatas exatas
// Estratégia: para cada grupo duplicado, manter o registro com asaas_payment_id
// (se houver) ou o de menor ID. Deletar os demais.
// ─────────────────────────────────────────────────────────────────────────────
console.log('🔧 AÇÃO 1: Removendo duplicatas exatas...');
console.log('-'.repeat(80));

// Buscar todos os grupos duplicados
const [duplicateGroups] = await connection.execute(`
  SELECT 
    sc.subscription_id,
    sc.type,
    sc.due_date,
    sc.value,
    COUNT(*) AS total,
    GROUP_CONCAT(sc.id ORDER BY 
      CASE WHEN sc.asaas_payment_id IS NOT NULL THEN 0 ELSE 1 END,
      sc.id ASC
      SEPARATOR ','
    ) AS ids_ordered
  FROM subscription_charges sc
  GROUP BY sc.subscription_id, sc.type, sc.due_date, sc.value
  HAVING COUNT(*) > 1
`);

console.log(`  Encontrados ${duplicateGroups.length} grupos de duplicatas.`);

let totalDeleted = 0;
let totalKept = 0;
const deletedIds = [];

for (const group of duplicateGroups) {
  const ids = group.ids_ordered.split(',').map(Number);
  const keepId = ids[0]; // Manter o primeiro (tem asaas_payment_id ou é o mais antigo)
  const toDelete = ids.slice(1); // Deletar os demais
  
  deletedIds.push(...toDelete);
  totalKept++;
  totalDeleted += toDelete.length;
  
  console.log(`  Grupo: sub=${group.subscription_id} | due=${group.due_date instanceof Date ? group.due_date.toISOString().split('T')[0] : group.due_date} | R$${parseFloat(group.value).toFixed(2)}`);
  console.log(`    ✅ Mantendo ID: ${keepId}`);
  console.log(`    🗑️  Deletando IDs: [${toDelete.join(', ')}]`);
}

if (deletedIds.length > 0) {
  // Deletar em lotes para evitar query muito longa
  const batchSize = 100;
  for (let i = 0; i < deletedIds.length; i += batchSize) {
    const batch = deletedIds.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');
    await connection.execute(
      `DELETE FROM subscription_charges WHERE id IN (${placeholders})`,
      batch
    );
  }
  console.log(`\n  ✅ AÇÃO 1 concluída: ${totalDeleted} registros duplicados removidos, ${totalKept} grupos mantidos.`);
} else {
  console.log('\n  ✅ Nenhuma duplicata para remover.');
}
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// AÇÃO 2: Atualizar status de cobranças pagas no Asaas mas pendentes localmente
// ─────────────────────────────────────────────────────────────────────────────
console.log('🔧 AÇÃO 2: Atualizando cobranças pagas no Asaas mas pendentes localmente...');
console.log('-'.repeat(80));

const [paidInAsaas] = await connection.execute(`
  SELECT sc.id, sc.asaas_payment_id, uc.paid_date
  FROM subscription_charges sc
  JOIN unclassified_charges uc ON sc.asaas_payment_id = uc.asaas_payment_id
  WHERE sc.status IN ('pending', 'overdue')
    AND uc.status = 'paid'
`);

console.log(`  Encontradas ${paidInAsaas.length} cobranças para atualizar.`);

if (paidInAsaas.length > 0) {
  for (const row of paidInAsaas) {
    const paidDate = row.paid_date 
      ? (row.paid_date instanceof Date ? row.paid_date.toISOString().split('T')[0] : row.paid_date)
      : new Date().toISOString().split('T')[0];
    
    await connection.execute(
      `UPDATE subscription_charges SET status = 'paid', paid_date = ? WHERE id = ?`,
      [paidDate, row.id]
    );
    console.log(`  ✅ ID ${row.id} (${row.asaas_payment_id}) → status: paid | data: ${paidDate}`);
  }
  console.log(`\n  ✅ AÇÃO 2 concluída: ${paidInAsaas.length} cobranças atualizadas para 'paid'.`);
} else {
  console.log('  ✅ Nenhuma cobrança para atualizar.');
}
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICAÇÃO FINAL: contar registros após correção
// ─────────────────────────────────────────────────────────────────────────────
console.log('📊 VERIFICAÇÃO FINAL:');
console.log('-'.repeat(80));

const [remainingDuplicates] = await connection.execute(`
  SELECT COUNT(*) AS total
  FROM (
    SELECT subscription_id, type, due_date, value, COUNT(*) AS cnt
    FROM subscription_charges
    GROUP BY subscription_id, type, due_date, value
    HAVING COUNT(*) > 1
  ) t
`);

const [pendingCounts] = await connection.execute(`
  SELECT 
    status,
    COUNT(*) AS total,
    SUM(value) AS total_value
  FROM subscription_charges
  WHERE status IN ('pending', 'overdue', 'paid')
  GROUP BY status
`);

console.log(`  Grupos duplicados restantes: ${remainingDuplicates[0].total}`);
console.log();
console.log('  Status das cobranças após correção:');
for (const row of pendingCounts) {
  console.log(`    ${row.status.padEnd(10)}: ${String(row.total).padStart(5)} registros | R$ ${parseFloat(row.total_value).toFixed(2)}`);
}

// Total pendente/vencido real
const [realTotal] = await connection.execute(`
  SELECT SUM(value) AS total
  FROM subscription_charges
  WHERE status IN ('pending', 'overdue')
`);

console.log();
console.log(`  💰 TOTAL REAL PENDENTE/VENCIDO: R$ ${parseFloat(realTotal[0].total || 0).toFixed(2)}`);

console.log();
console.log('='.repeat(80));
console.log('CORREÇÃO CONCLUÍDA');
console.log('='.repeat(80));

await connection.end();
