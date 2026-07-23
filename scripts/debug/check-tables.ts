import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL!);
const [rows] = await conn.query('SHOW TABLES') as any;
const existing = rows.map((r: any) => Object.values(r)[0] as string);

const needed = ['subscription_charges', 'subscriptions', 'pix_allocations', 'excluded_asaas_charges', 'unclassified_charges', 'asaas_payments', 'webhook_logs', 'payment_audit_logs'];
console.log('=== Tabelas necessárias para saasRouter ===');
needed.forEach(t => {
  const status = existing.includes(t) ? '✅ OK' : '❌ MISSING';
  console.log(status + ': ' + t);
});

console.log('\n=== Contagem de registros nas tabelas existentes ===');
for (const t of existing) {
  try {
    const [r] = await conn.query('SELECT COUNT(*) as cnt FROM `' + t + '`') as any;
    console.log(t + ': ' + r[0].cnt);
  } catch (e: any) {
    console.log(t + ': ERROR - ' + e.message);
  }
}

await conn.end();
