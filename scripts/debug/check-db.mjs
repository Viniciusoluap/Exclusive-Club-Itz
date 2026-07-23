import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";

async function main() {
  const db = drizzle(process.env.DATABASE_URL);
  
  // Verificar allowed_clients
  const clients = await db.execute(sql`SELECT id, email, name, is_active FROM allowed_clients`);
  console.log('=== ALLOWED CLIENTS ===');
  console.log(JSON.stringify(clients[0], null, 2));
  
  // Verificar inspection_charges do tipo repair
  const repairs = await db.execute(sql`SELECT id, client_email, vessel_name, description, amount, payment_status FROM inspection_charges WHERE charge_type = 'repair'`);
  console.log('\n=== REPAIRS ===');
  console.log(JSON.stringify(repairs[0], null, 2));
  
  // Verificar client_quotas
  const quotas = await db.execute(sql`SELECT cq.*, ac.email FROM client_quotas cq JOIN allowed_clients ac ON cq.client_id = ac.id`);
  console.log('\n=== CLIENT QUOTAS ===');
  console.log(JSON.stringify(quotas[0], null, 2));
}

main().catch(console.error);
