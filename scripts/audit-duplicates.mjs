/**
 * Script de auditoria: identifica cobranças duplicadas e cobranças pagas
 * que aparecem como pendentes em subscription_charges.
 * 
 * Padrão problemático identificado:
 * - Cobrança de R$22.000 já está PAGA no BPO (unclassified_charges)
 * - Mas aparece 2x como PENDENTE em subscription_charges (mesma data, mesmo tipo, mesmo valor)
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
console.log('AUDITORIA DE COBRANÇAS DUPLICADAS - BPO FINANCEIRO');
console.log('='.repeat(80));
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// 1. DUPLICATAS EXATAS em subscription_charges
//    Mesmo subscription_id + due_date + type + value → mais de 1 registro
// ─────────────────────────────────────────────────────────────────────────────
console.log('📋 1. DUPLICATAS EXATAS (mesmo cliente + vencimento + tipo + valor)');
console.log('-'.repeat(80));

const [duplicates] = await connection.execute(`
  SELECT 
    sc.subscription_id,
    MIN(ac.name) AS client_name,
    MIN(ac.email) AS client_email,
    sc.type,
    sc.due_date,
    sc.value,
    COUNT(*) AS total_registros,
    GROUP_CONCAT(sc.id ORDER BY sc.id SEPARATOR ', ') AS ids,
    GROUP_CONCAT(sc.status ORDER BY sc.id SEPARATOR ', ') AS statuses,
    GROUP_CONCAT(IFNULL(sc.asaas_payment_id, 'NULL') ORDER BY sc.id SEPARATOR ', ') AS asaas_ids
  FROM subscription_charges sc
  JOIN subscriptions s ON sc.subscription_id = s.id
  JOIN allowed_clients ac ON s.client_id = ac.id
  GROUP BY sc.subscription_id, sc.type, sc.due_date, sc.value
  HAVING COUNT(*) > 1
  ORDER BY total_registros DESC, MIN(ac.name), sc.due_date
`);

if (duplicates.length === 0) {
  console.log('✅ Nenhuma duplicata exata encontrada.\n');
} else {
  console.log(`⚠️  ${duplicates.length} grupos de duplicatas encontrados:\n`);
  
  let totalDuplicateValue = 0;
  let totalExtraRecords = 0;
  
  for (const row of duplicates) {
    const extras = row.total_registros - 1;
    totalExtraRecords += extras;
    totalDuplicateValue += parseFloat(row.value) * extras;
    
    console.log(`  Cliente: ${row.client_name} <${row.client_email}>`);
    console.log(`  Tipo: ${row.type} | Valor: R$ ${parseFloat(row.value).toFixed(2)} | Vencimento: ${row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : row.due_date}`);
    console.log(`  Registros: ${row.total_registros}x | IDs: [${row.ids}]`);
    console.log(`  Status: [${row.statuses}]`);
    console.log(`  Asaas IDs: [${row.asaas_ids}]`);
    console.log();
  }
  
  console.log(`  💰 TOTAL DE VALOR INFLADO: R$ ${totalDuplicateValue.toFixed(2)}`);
  console.log(`  📊 REGISTROS EXTRAS (a remover): ${totalExtraRecords}`);
  console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. COBRANÇAS PAGAS no BPO mas PENDENTES em subscription_charges
//    Cruzar unclassified_charges (paid) com subscription_charges (pending/overdue)
// ─────────────────────────────────────────────────────────────────────────────
console.log('📋 2. COBRANÇAS PAGAS NO ASAAS mas PENDENTES no sistema local');
console.log('-'.repeat(80));

const [paidInAsaasButPendingLocal] = await connection.execute(`
  SELECT 
    sc.id AS charge_id,
    ac.name AS client_name,
    ac.email AS client_email,
    sc.type,
    sc.due_date,
    sc.value,
    sc.status AS local_status,
    sc.asaas_payment_id,
    uc.status AS asaas_cache_status,
    uc.asaas_customer_name
  FROM subscription_charges sc
  JOIN subscriptions s ON sc.subscription_id = s.id
  JOIN allowed_clients ac ON s.client_id = ac.id
  LEFT JOIN unclassified_charges uc ON sc.asaas_payment_id = uc.asaas_payment_id
  WHERE sc.status IN ('pending', 'overdue')
    AND uc.status = 'paid'
  ORDER BY ac.name, sc.due_date DESC
`);

if (paidInAsaasButPendingLocal.length === 0) {
  console.log('✅ Nenhuma cobrança paga no Asaas aparecendo como pendente localmente.\n');
} else {
  console.log(`⚠️  ${paidInAsaasButPendingLocal.length} cobranças pagas no Asaas mas pendentes localmente:\n`);
  
  let totalMismatchValue = 0;
  
  for (const row of paidInAsaasButPendingLocal) {
    totalMismatchValue += parseFloat(row.value);
    const dueDate = row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : row.due_date;
    console.log(`  ID: ${row.charge_id} | ${row.client_name} | R$ ${parseFloat(row.value).toFixed(2)} | Venc: ${dueDate}`);
    console.log(`  Tipo: ${row.type} | Status local: ${row.local_status} | Status Asaas: ${row.asaas_cache_status}`);
    console.log(`  Asaas Payment ID: ${row.asaas_payment_id || 'NULL'}`);
    console.log();
  }
  
  console.log(`  💰 TOTAL DE VALOR INCORRETAMENTE PENDENTE: R$ ${totalMismatchValue.toFixed(2)}`);
  console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. COBRANÇAS SEM asaas_payment_id (órfãs — criadas localmente sem vínculo Asaas)
// ─────────────────────────────────────────────────────────────────────────────
console.log('📋 3. COBRANÇAS PENDENTES SEM VÍNCULO ASAAS (asaas_payment_id NULL)');
console.log('-'.repeat(80));

const [orphanCharges] = await connection.execute(`
  SELECT 
    sc.id,
    ac.name AS client_name,
    ac.email AS client_email,
    sc.type,
    sc.due_date,
    sc.value,
    sc.status
  FROM subscription_charges sc
  JOIN subscriptions s ON sc.subscription_id = s.id
  JOIN allowed_clients ac ON s.client_id = ac.id
  WHERE sc.asaas_payment_id IS NULL
    AND sc.status IN ('pending', 'overdue')
  ORDER BY ac.name, sc.due_date DESC
  LIMIT 50
`);

if (orphanCharges.length === 0) {
  console.log('✅ Nenhuma cobrança pendente sem vínculo Asaas.\n');
} else {
  console.log(`⚠️  ${orphanCharges.length} cobranças pendentes sem asaas_payment_id (primeiras 50):\n`);
  
  let totalOrphanValue = 0;
  for (const row of orphanCharges) {
    totalOrphanValue += parseFloat(row.value);
    const dueDate = row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : row.due_date;
    console.log(`  ID: ${row.id} | ${row.client_name} | R$ ${parseFloat(row.value).toFixed(2)} | Venc: ${dueDate} | Tipo: ${row.type} | Status: ${row.status}`);
  }
  console.log(`\n  💰 TOTAL: R$ ${totalOrphanValue.toFixed(2)}`);
  console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. RESUMO POR CLIENTE — cobranças pendentes com valor total
// ─────────────────────────────────────────────────────────────────────────────
console.log('📋 4. RESUMO POR CLIENTE — cobranças pendentes/vencidas');
console.log('-'.repeat(80));

const [clientSummary] = await connection.execute(`
  SELECT 
    ac.name AS client_name,
    ac.email AS client_email,
    COUNT(*) AS total_charges,
    SUM(sc.value) AS total_value,
    SUM(CASE WHEN sc.status = 'pending' THEN sc.value ELSE 0 END) AS pending_value,
    SUM(CASE WHEN sc.status = 'overdue' THEN sc.value ELSE 0 END) AS overdue_value,
    COUNT(CASE WHEN sc.status = 'pending' THEN 1 END) AS pending_count,
    COUNT(CASE WHEN sc.status = 'overdue' THEN 1 END) AS overdue_count
  FROM subscription_charges sc
  JOIN subscriptions s ON sc.subscription_id = s.id
  JOIN allowed_clients ac ON s.client_id = ac.id
  WHERE sc.status IN ('pending', 'overdue')
  GROUP BY ac.id, ac.name, ac.email
  ORDER BY total_value DESC
`);

if (clientSummary.length === 0) {
  console.log('✅ Nenhuma cobrança pendente/vencida.\n');
} else {
  let grandTotal = 0;
  console.log(`  ${'CLIENTE'.padEnd(35)} ${'PENDENTE'.padStart(12)} ${'VENCIDA'.padStart(12)} ${'TOTAL'.padStart(12)}`);
  console.log('  ' + '-'.repeat(75));
  
  for (const row of clientSummary) {
    grandTotal += parseFloat(row.total_value);
    const name = row.client_name.substring(0, 33).padEnd(35);
    const pending = `R$ ${parseFloat(row.pending_value).toFixed(2)}`.padStart(12);
    const overdue = `R$ ${parseFloat(row.overdue_value).toFixed(2)}`.padStart(12);
    const total = `R$ ${parseFloat(row.total_value).toFixed(2)}`.padStart(12);
    console.log(`  ${name} ${pending} ${overdue} ${total}`);
  }
  
  console.log('  ' + '-'.repeat(75));
  console.log(`  ${'TOTAL GERAL'.padEnd(35)} ${''.padStart(12)} ${''.padStart(12)} R$ ${grandTotal.toFixed(2).padStart(9)}`);
  console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. DUPLICATAS ESPECÍFICAS — Filippe Augusto (caso reportado)
// ─────────────────────────────────────────────────────────────────────────────
console.log('📋 5. DETALHE — Filippe Augusto V B Murta (caso reportado)');
console.log('-'.repeat(80));

const [filippeCharges] = await connection.execute(`
  SELECT 
    sc.id,
    sc.type,
    sc.due_date,
    sc.value,
    sc.status,
    sc.paid_date,
    sc.asaas_payment_id,
    sc.created_at
  FROM subscription_charges sc
  JOIN subscriptions s ON sc.subscription_id = s.id
  JOIN allowed_clients ac ON s.client_id = ac.id
  WHERE ac.email LIKE '%filippe%' OR ac.name LIKE '%Filippe%'
  ORDER BY sc.due_date DESC, sc.id
`);

if (filippeCharges.length === 0) {
  console.log('  Cliente Filippe não encontrado no banco.\n');
} else {
  console.log(`  ${filippeCharges.length} cobranças encontradas para Filippe:\n`);
  for (const row of filippeCharges) {
    const dueDate = row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : row.due_date;
    const paidDate = row.paid_date ? (row.paid_date instanceof Date ? row.paid_date.toISOString().split('T')[0] : row.paid_date) : '-';
    const createdAt = row.created_at instanceof Date ? row.created_at.toISOString().split('T')[0] : row.created_at;
    console.log(`  ID: ${String(row.id).padEnd(6)} | ${(row.type || 'NULL').padEnd(12)} | R$ ${parseFloat(row.value).toFixed(2).padStart(10)} | Venc: ${dueDate} | Status: ${row.status.padEnd(8)} | Pago: ${paidDate} | Asaas: ${row.asaas_payment_id || 'NULL'} | Criado: ${createdAt}`);
  }
  console.log();
}

console.log('='.repeat(80));
console.log('FIM DA AUDITORIA');
console.log('='.repeat(80));

await connection.end();
