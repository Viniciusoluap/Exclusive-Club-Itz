import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import dotenv from "dotenv";
dotenv.config();
const db = drizzle(process.env.DATABASE_URL);

const cond = "email LIKE '%@example.com' OR email LIKE '%@test.com' OR email LIKE 'test-%@%' OR email LIKE 'teste%@%'";

const tables = ["allowed_clients", "employees", "users"];
for (const table of tables) {
  const r = await db.execute(sql.raw("SELECT COUNT(*) as cnt FROM " + table + " WHERE " + cond));
  const cnt = r[0][0]?.cnt || 0;
  console.log("[" + table + "] registros de teste restantes: " + cnt);
}
process.exit(0);
