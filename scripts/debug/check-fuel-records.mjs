import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';

const db = drizzle(process.env.DATABASE_URL);

const result = await db.execute(sql`
  SELECT COUNT(*) as total, 
         SUM(CASE WHEN is_operational = 1 THEN 1 ELSE 0 END) as operacionais,
         SUM(CASE WHEN is_operational = 0 OR is_operational IS NULL THEN 1 ELSE 0 END) as clientes,
         SUM(CASE WHEN is_operational = 1 THEN total_amount ELSE 0 END) as valor_operacional,
         SUM(CASE WHEN is_operational = 0 OR is_operational IS NULL THEN total_amount ELSE 0 END) as valor_clientes
  FROM fuel_records 
  WHERE DATE_FORMAT(created_at, '%Y-%m') = '2026-02'
`);

console.log('=== Estatísticas de Abastecimentos (Fevereiro 2026) ===');
console.log(JSON.stringify(result[0], null, 2));

const details = await db.execute(sql`
  SELECT id, client_name, is_operational, total_amount, created_at 
  FROM fuel_records 
  WHERE DATE_FORMAT(created_at, '%Y-%m') = '2026-02'
  ORDER BY created_at DESC
  LIMIT 10
`);

console.log('\n=== Últimos 10 Registros ===');
console.table(details[0]);

process.exit(0);
