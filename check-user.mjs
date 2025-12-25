import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";

async function main() {
  const db = drizzle(process.env.DATABASE_URL);
  const userEmail = 'v6h2sw5vmn@privaterelay.appleid.com';
  
  // Verificar se existe allowed_client com esse email
  const clients = await db.execute(sql`SELECT * FROM allowed_clients WHERE email = ${userEmail}`);
  console.log('=== ALLOWED CLIENT ===');
  console.log(JSON.stringify(clients[0], null, 2));
  
  // Verificar cotas do cliente
  const quotas = await db.execute(sql`
    SELECT cq.*, v.name as vessel_name 
    FROM client_quotas cq 
    JOIN vessels v ON cq.vessel_id = v.id
    JOIN allowed_clients ac ON cq.client_id = ac.id
    WHERE ac.email = ${userEmail}
  `);
  console.log('=== CLIENT QUOTAS ===');
  console.log(JSON.stringify(quotas[0], null, 2));
  
  // Verificar reparos para esse email
  const repairs = await db.execute(sql`SELECT * FROM inspection_charges WHERE client_email = ${userEmail}`);
  console.log('=== REPAIRS FOR THIS EMAIL ===');
  console.log(JSON.stringify(repairs[0], null, 2));
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
