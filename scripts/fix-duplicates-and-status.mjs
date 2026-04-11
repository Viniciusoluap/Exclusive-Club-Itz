/**
 * Script: fix-duplicates-and-status.mjs
 * 
 * Corrige dois problemas em subscription_charges:
 * 1. Remove duplicatas mantendo o registro mais relevante (paid > overdue > pending, id menor)
 * 2. Atualiza status de 'pending' para 'overdue' quando due_date < hoje
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('=== Fix: Duplicatas e Status em subscription_charges ===\n');

// ─── PASSO 1: Identificar e remover duplicatas ───────────────────────────────
// Estratégia: para cada grupo (subscription_id, due_date, type), manter apenas
// o registro com maior prioridade de status (paid > overdue > pending) e menor id.
// Registros com IDs >= 90000 (criados por autoClassify/sync) são candidatos a remoção.

const [dupGroups] = await conn.execute(`
  SELECT subscription_id, due_date, type, COUNT(*) as cnt
  FROM subscription_charges
  GROUP BY subscription_id, due_date, type
  HAVING COUNT(*) > 1
`);

console.log(`Grupos com duplicatas: ${dupGroups.length}`);

let totalRemoved = 0;

for (const group of dupGroups) {
  const { subscription_id, due_date, type } = group;
  
  // Buscar todos os registros do grupo ordenados por prioridade
  const [records] = await conn.execute(`
    SELECT id, status, asaas_payment_id, amount_paid, value
    FROM subscription_charges
    WHERE subscription_id = ?
      AND due_date = ?
      AND (type = ? OR (type IS NULL AND ? IS NULL))
    ORDER BY
      CASE status
        WHEN 'paid' THEN 0
        WHEN 'overdue' THEN 1
        WHEN 'pending' THEN 2
        WHEN 'cancelled' THEN 3
        ELSE 4
      END ASC,
      -- Preferir registros com asaas_payment_id real
      CASE WHEN asaas_payment_id IS NOT NULL AND asaas_payment_id != '' THEN 0 ELSE 1 END ASC,
      id ASC
  `, [subscription_id, due_date, type, type]);

  if (records.length <= 1) continue;

  // Manter o primeiro (melhor prioridade), remover os demais
  const toKeep = records[0];
  const toRemove = records.slice(1).map(r => r.id);

  console.log(`  Sub ${subscription_id} | ${due_date?.toISOString?.()?.split('T')[0] || due_date} | type=${type} → mantendo id=${toKeep.id} (${toKeep.status}), removendo ids=[${toRemove.join(',')}]`);

  if (toRemove.length > 0) {
    await conn.execute(
      `DELETE FROM subscription_charges WHERE id IN (${toRemove.map(() => '?').join(',')})`,
      toRemove
    );
    totalRemoved += toRemove.length;
  }
}

console.log(`\n✅ Duplicatas removidas: ${totalRemoved} registros\n`);

// ─── PASSO 2: Atualizar status pending → overdue para cobranças vencidas ─────
const [overdueResult] = await conn.execute(`
  UPDATE subscription_charges
  SET status = 'overdue'
  WHERE status = 'pending'
    AND due_date < CURDATE()
`);

console.log(`✅ Status corrigidos: ${overdueResult.affectedRows} cobranças pending → overdue\n`);

// ─── PASSO 3: Verificação final ───────────────────────────────────────────────
const [finalStatus] = await conn.execute('SELECT status, COUNT(*) as cnt FROM subscription_charges GROUP BY status');
console.log('Distribuição final de status:');
finalStatus.forEach(r => console.log(`  ${r.status}: ${r.cnt}`));

const [finalDups] = await conn.execute(`
  SELECT COUNT(*) as cnt FROM (
    SELECT subscription_id, due_date, type
    FROM subscription_charges
    GROUP BY subscription_id, due_date, type
    HAVING COUNT(*) > 1
  ) t
`);
console.log(`\nDuplicatas restantes: ${finalDups[0].cnt}`);

await conn.end();
console.log('\n=== Concluído ===');
