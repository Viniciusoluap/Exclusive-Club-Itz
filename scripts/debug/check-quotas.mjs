import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";

async function main() {
  const db = drizzle(process.env.DATABASE_URL);
  
  // Verificar cotas do usuário
  const quotas = await db.execute(sql`
    SELECT cq.*, v.name as vessel_name, ac.email
    FROM client_quotas cq 
    JOIN vessels v ON cq.vessel_id = v.id
    JOIN allowed_clients ac ON cq.client_id = ac.id
    WHERE ac.email = 'v6h2sw5vmn@privaterelay.appleid.com'
  `);
  console.log('=== COTAS DO USUÁRIO ===');
  console.log(JSON.stringify(quotas[0], null, 2));
  
  // Verificar se existe vessel_id 1140001
  const vessel = await db.execute(sql`SELECT * FROM vessels WHERE id = 1140001`);
  console.log('=== VESSEL 1140001 ===');
  console.log(JSON.stringify(vessel[0], null, 2));
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
