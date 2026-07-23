import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";

async function main() {
  const db = drizzle(process.env.DATABASE_URL);
  
  // Verificar TODOS os reparos das embarcações 3 e 4 (jetski e focker)
  const repairs = await db.execute(sql`SELECT * FROM inspection_charges WHERE charge_type = 'repair' AND vessel_id IN (3, 4)`);
  console.log('=== REPAIRS FOR VESSELS 3 AND 4 ===');
  console.log(JSON.stringify(repairs[0], null, 2));
  
  // Verificar todos os reparos
  const allRepairs = await db.execute(sql`SELECT id, vessel_id, vessel_name, client_email, amount, payment_status FROM inspection_charges WHERE charge_type = 'repair'`);
  console.log('=== ALL REPAIRS ===');
  console.log(JSON.stringify(allRepairs[0], null, 2));
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
