import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';

const db = drizzle(process.env.DATABASE_URL);

const result = await db.execute(sql`
  SELECT 
    COUNT(*) as total_records,
    SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_received,
    SUM(total_amount) as total_billed,
    SUM(CASE WHEN payment_status = 'pending' THEN total_amount ELSE 0 END) as total_pending,
    SUM(CASE WHEN payment_status = 'overdue' THEN total_amount ELSE 0 END) as total_overdue
  FROM fuel_records
  WHERE DATE_FORMAT(created_at, '%Y-%m') = '2026-02'
    AND (is_operational = 0 OR is_operational IS NULL)
`);

console.log('=== Query de totalBilled (excluindo operacionais) ===');
console.log(JSON.stringify(result[0], null, 2));

// Verificar todos os registros de fevereiro
const allRecords = await db.execute(sql`
  SELECT id, client_name, is_operational, total_amount, payment_status, created_at
  FROM fuel_records
  WHERE DATE_FORMAT(created_at, '%Y-%m') = '2026-02'
  ORDER BY created_at DESC
`);

console.log('\n=== Todos os registros de Fevereiro 2026 ===');
console.table(allRecords[0]);

process.exit(0);
