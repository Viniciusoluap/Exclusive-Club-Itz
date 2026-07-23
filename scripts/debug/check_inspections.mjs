import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';

const db = drizzle(process.env.DATABASE_URL);

console.log('\n=== Verificando vistorias reprovadas ===\n');

// Buscar vistorias com status rejected
const inspections = await db.execute(sql.raw(`
  SELECT 
    i.id,
    i.vessel_id,
    i.status,
    i.client_name,
    i.vessel_name,
    i.created_at
  FROM inspections i
  WHERE i.status = 'rejected'
  ORDER BY i.created_at DESC
  LIMIT 5
`));

console.log('Vistorias com status "rejected":');
console.log(JSON.stringify(inspections[0], null, 2));

// Buscar cobranças do tipo inspection
const charges = await db.execute(sql.raw(`
  SELECT 
    ic.*,
    i.status as inspection_status,
    i.created_at as inspection_date
  FROM inspection_charges ic
  JOIN inspections i ON ic.inspection_id = i.id
  WHERE ic.charge_type = 'inspection'
  ORDER BY ic.created_at DESC
  LIMIT 5
`));

console.log('\n\nCobranças do tipo "inspection":');
console.log(JSON.stringify(charges[0], null, 2));

process.exit(0);
