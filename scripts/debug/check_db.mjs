import { getDb } from '../../server/db.js';

const db = await getDb();
if (!db) { console.log('DB not available'); process.exit(1); }

const [rows] = await db.execute('SHOW TABLES LIKE "asaas_customers"');
console.log('asaas_customers exists:', JSON.stringify(rows));

const [cols] = await db.execute('DESCRIBE asaas_customers').catch(() => [[null]]);
console.log('columns:', JSON.stringify(cols));

// Verificar se há dados
const [count] = await db.execute('SELECT COUNT(*) as cnt FROM asaas_customers').catch(() => [[{cnt: 'error'}]]);
console.log('count:', JSON.stringify(count));
