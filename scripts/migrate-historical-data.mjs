/**
 * Fase 2 — Migração de dados históricos
 * Sincroniza os 19 registros de overlap entre asaas_payments e subscription_charges
 * Garante que net_value, billing_type e status estejam consistentes no BPO
 */
import mysql from 'mysql2/promise';

function mapAsaasStatusToSC(asaasStatus) {
  switch ((asaasStatus || '').toUpperCase()) {
    case 'RECEIVED':
    case 'CONFIRMED':
      return 'paid';
    case 'OVERDUE':
      return 'overdue';
    case 'DELETED':
    case 'REFUNDED':
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'pending';
  }
}

// Mapeamento de status asaas_payments → subscription_charges
function mapCentralStatusToSC(centralStatus) {
  switch ((centralStatus || '').toLowerCase()) {
    case 'received':
    case 'confirmed':
      return 'paid';
    case 'overdue':
      return 'overdue';
    case 'refunded':
    case 'cancelled':
    case 'failed':
      return 'cancelled';
    default:
      return 'pending';
  }
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('=== Migração Histórica: asaas_payments → subscription_charges ===\n');
  
  // Busca todos os registros com overlap
  const [overlaps] = await conn.query(`
    SELECT 
      ap.id as ap_id,
      ap.asaas_payment_id,
      ap.status as ap_status,
      ap.net_value,
      ap.billing_type,
      ap.payment_date,
      ap.charge_type,
      sc.id as sc_id,
      sc.status as sc_status,
      sc.net_value as sc_net_value,
      sc.paid_date as sc_paid_date
    FROM asaas_payments ap
    INNER JOIN subscription_charges sc ON sc.asaas_payment_id = ap.asaas_payment_id
    ORDER BY ap.id
  `);
  
  console.log(`Encontrados ${overlaps.length} registros com overlap.\n`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const row of overlaps) {
    const scStatus = mapCentralStatusToSC(row.ap_status);
    const needsUpdate = 
      row.sc_status !== scStatus ||
      row.sc_net_value === null && row.net_value !== null ||
      row.sc_paid_date === null && row.payment_date !== null;
    
    if (!needsUpdate) {
      console.log(`⏭️  SC #${row.sc_id} (${row.asaas_payment_id}) — já sincronizado`);
      skipped++;
      continue;
    }
    
    // Atualiza subscription_charges com dados do asaas_payments
    const updateFields = [];
    const values = [];
    
    if (row.sc_status !== scStatus) {
      updateFields.push('status = ?');
      values.push(scStatus);
    }
    
    if (row.net_value !== null) {
      updateFields.push('net_value = ?');
      values.push(row.net_value);
    }
    
    if (row.billing_type) {
      updateFields.push('billing_type = ?');
      values.push(row.billing_type);
    }
    
    if (row.payment_date && scStatus === 'paid') {
      updateFields.push('paid_date = ?');
      values.push(row.payment_date);
      updateFields.push('amount_paid = COALESCE(amount_paid, value)');
    }
    
    if (updateFields.length > 0) {
      values.push(row.sc_id);
      await conn.query(
        `UPDATE subscription_charges SET ${updateFields.join(', ')} WHERE id = ?`,
        values
      );
      console.log(`✅ SC #${row.sc_id} atualizado: ${row.sc_status} → ${scStatus} | net_value: ${row.net_value} | billing: ${row.billing_type}`);
      updated++;
    }
  }
  
  console.log(`\n=== Resultado ===`);
  console.log(`Atualizados: ${updated}`);
  console.log(`Já sincronizados: ${skipped}`);
  console.log(`Total processados: ${overlaps.length}`);
  
  // Verificação final
  const [stats] = await conn.query(`
    SELECT 
      status,
      COUNT(*) as count,
      SUM(value) as total_value,
      SUM(COALESCE(net_value, 0)) as total_net
    FROM subscription_charges
    WHERE net_value IS NOT NULL
    GROUP BY status
  `);
  
  console.log('\n=== subscription_charges com net_value por status ===');
  stats.forEach(r => {
    console.log(`  ${r.status}: ${r.count} cobranças | valor: R$ ${Number(r.total_value).toFixed(2)} | líquido: R$ ${Number(r.total_net).toFixed(2)}`);
  });
  
  await conn.end();
  console.log('\n✅ Migração histórica concluída!');
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
