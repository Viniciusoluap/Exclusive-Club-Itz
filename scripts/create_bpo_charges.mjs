import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  const createSQL = `
    CREATE TABLE IF NOT EXISTS \`bpo_charges\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`asaas_charge_id\` varchar(64) UNIQUE,
      \`asaas_customer_id\` varchar(64),
      \`client_id\` int,
      \`client_name\` varchar(255),
      \`client_email\` varchar(320),
      \`value\` decimal(10,2) NOT NULL,
      \`net_value\` decimal(10,2),
      \`amount_paid\` decimal(10,2) DEFAULT 0,
      \`due_date\` varchar(10) NOT NULL,
      \`paid_date\` varchar(10),
      \`status\` enum('pending','received','confirmed','overdue','refunded','receivedInCash','awaitingChargeback','detached','partiallyPaid') NOT NULL DEFAULT 'pending',
      \`type\` enum('monthly','quota_sale','fuel','repair','other') DEFAULT 'other',
      \`billing_type\` varchar(32),
      \`description\` text,
      \`external_reference\` varchar(255),
      \`payment_link\` text,
      \`invoice_url\` text,
      \`bank_slip_url\` text,
      \`synced_at\` timestamp NULL,
      \`source\` enum('asaas_import','asaas_webhook','manual','system') DEFAULT 'system',
      \`created_at\` timestamp NOT NULL DEFAULT NOW(),
      \`updated_at\` timestamp NOT NULL DEFAULT NOW() ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`bpo_charges_id\` PRIMARY KEY(\`id\`),
      INDEX \`bpo_charges_asaas_charge_id_idx\` (\`asaas_charge_id\`),
      INDEX \`bpo_charges_client_id_idx\` (\`client_id\`),
      INDEX \`bpo_charges_due_date_idx\` (\`due_date\`),
      INDEX \`bpo_charges_status_idx\` (\`status\`)
    )
  `;
  
  await conn.execute(createSQL);
  console.log('✅ Tabela bpo_charges criada com sucesso!');
  
  const [rows] = await conn.execute('DESCRIBE bpo_charges');
  console.log('Colunas:', rows.map(r => r.Field).join(', '));
  
  await conn.end();
}

main().catch(e => { console.error('❌ Erro:', e.message); process.exit(1); });
