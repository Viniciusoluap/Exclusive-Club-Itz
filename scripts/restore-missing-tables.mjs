/**
 * Script para recriar as tabelas faltantes no banco de dados.
 * Tabelas a criar: subscriptions, subscription_charges, pix_allocations,
 *                  excluded_asaas_charges, unclassified_charges
 * 
 * Também recria a VIEW financial_charges e as tabelas asaas_payments + webhook_logs
 * que são usadas pelos módulos de Webhooks e Reconciliação.
 */
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
console.log('✅ Conectado ao banco de dados\n');

const tables = [
  {
    name: 'subscriptions',
    sql: `CREATE TABLE IF NOT EXISTS \`subscriptions\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`client_id\` int NOT NULL,
      \`type\` enum('monthly','quota_sale','fuel','repair','other') NOT NULL,
      \`value\` decimal(10,2) NOT NULL,
      \`due_day\` int NOT NULL,
      \`start_date\` timestamp NOT NULL,
      \`end_date\` timestamp NULL,
      \`status\` enum('active','paused','cancelled') NOT NULL DEFAULT 'active',
      \`yearly_adjustment\` enum('manual','ipca','igpm') NOT NULL DEFAULT 'manual',
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'subscription_charges',
    sql: `CREATE TABLE IF NOT EXISTS \`subscription_charges\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`subscription_id\` int NOT NULL,
      \`asaas_payment_id\` varchar(64) NULL,
      \`value\` decimal(10,2) NOT NULL,
      \`due_date\` timestamp NOT NULL,
      \`paid_date\` timestamp NULL,
      \`status\` enum('pending','paid','overdue','cancelled','partial') NOT NULL DEFAULT 'pending',
      \`type\` enum('monthly','quota_sale','fuel','repair','other') NULL,
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`amount_paid\` decimal(10,2) NOT NULL DEFAULT 0.00,
      \`payment_links\` text NULL,
      \`net_value\` decimal(10,2) NULL,
      \`external_reference\` varchar(255) NULL,
      \`billing_type\` varchar(20) NULL,
      PRIMARY KEY (\`id\`),
      KEY \`sc_subscription_id\` (\`subscription_id\`),
      KEY \`sc_status\` (\`status\`),
      KEY \`sc_due_date\` (\`due_date\`),
      KEY \`sc_asaas_payment_id\` (\`asaas_payment_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'pix_allocations',
    sql: `CREATE TABLE IF NOT EXISTS \`pix_allocations\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`asaas_charge_id\` varchar(255) NOT NULL,
      \`subscription_charge_id\` int NOT NULL,
      \`amount\` decimal(10,2) NOT NULL,
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`pix_alloc_asaas_idx\` (\`asaas_charge_id\`),
      KEY \`pix_alloc_charge_idx\` (\`subscription_charge_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'excluded_asaas_charges',
    sql: `CREATE TABLE IF NOT EXISTS \`excluded_asaas_charges\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`asaas_charge_id\` varchar(255) NOT NULL UNIQUE,
      \`excluded_by\` varchar(320) NOT NULL,
      \`excluded_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`reason\` text NULL,
      PRIMARY KEY (\`id\`),
      KEY \`asaas_charge_id\` (\`asaas_charge_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'unclassified_charges',
    sql: `CREATE TABLE IF NOT EXISTS \`unclassified_charges\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`asaas_payment_id\` varchar(255) NOT NULL UNIQUE,
      \`asaas_customer_id\` varchar(255) NOT NULL,
      \`asaas_customer_name\` varchar(255) NULL,
      \`asaas_customer_email\` varchar(320) NULL,
      \`asaas_customer_cpf_cnpj\` varchar(20) NULL,
      \`description\` text NULL,
      \`value\` decimal(10,2) NOT NULL,
      \`due_date\` varchar(10) NOT NULL,
      \`paid_date\` varchar(10) NULL,
      \`asaas_status\` varchar(50) NOT NULL DEFAULT 'PENDING',
      \`status\` enum('pending','paid','overdue','cancelled') NOT NULL DEFAULT 'pending',
      \`classified\` tinyint NOT NULL DEFAULT 0,
      \`classified_at\` timestamp NULL,
      \`classified_by\` int NULL,
      \`linked_client_id\` int NULL,
      \`linked_subscription_id\` int NULL,
      \`linked_charge_id\` int NULL,
      \`last_synced_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`uc_asaas_payment_id\` (\`asaas_payment_id\`),
      KEY \`uc_classified\` (\`classified\`),
      KEY \`uc_asaas_customer_id\` (\`asaas_customer_id\`),
      KEY \`uc_status\` (\`status\`),
      KEY \`uc_due_date\` (\`due_date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'asaas_payments',
    sql: `CREATE TABLE IF NOT EXISTS \`asaas_payments\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`asaas_payment_id\` varchar(255) NOT NULL UNIQUE,
      \`charge_type\` varchar(50) NULL,
      \`charge_id\` int NULL,
      \`asaas_customer_id\` varchar(255) NULL,
      \`value\` decimal(10,2) NOT NULL DEFAULT 0.00,
      \`net_value\` decimal(10,2) NULL,
      \`amount_paid\` decimal(10,2) NULL,
      \`billing_type\` varchar(20) NULL,
      \`status\` varchar(50) NOT NULL DEFAULT 'pending',
      \`due_date\` date NULL,
      \`payment_date\` date NULL,
      \`description\` text NULL,
      \`external_reference\` varchar(255) NULL,
      \`invoice_url\` text NULL,
      \`bank_slip_url\` text NULL,
      \`pix_qr_code\` text NULL,
      \`pix_copy_paste\` text NULL,
      \`pix_expiration_date\` datetime NULL,
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`ap_asaas_payment_id\` (\`asaas_payment_id\`),
      KEY \`ap_status\` (\`status\`),
      KEY \`ap_charge_type\` (\`charge_type\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  },
  {
    name: 'webhook_logs',
    sql: `CREATE TABLE IF NOT EXISTS \`webhook_logs\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`event\` varchar(100) NOT NULL,
      \`asaas_payment_id\` varchar(255) NULL,
      \`payload\` text NULL,
      \`processed\` tinyint NOT NULL DEFAULT 0,
      \`error\` text NULL,
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`wl_event\` (\`event\`),
      KEY \`wl_asaas_payment_id\` (\`asaas_payment_id\`),
      KEY \`wl_created_at\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  }
];

// Criar tabelas
for (const table of tables) {
  try {
    await connection.execute(table.sql);
    console.log(`✅ Tabela '${table.name}' criada (ou já existia)`);
  } catch (err) {
    console.error(`❌ Erro ao criar '${table.name}':`, err.message);
  }
}

// Recriar VIEW financial_charges
console.log('\n📊 Recriando VIEW financial_charges...');
try {
  await connection.execute('DROP VIEW IF EXISTS financial_charges');
  await connection.execute(`
    CREATE VIEW financial_charges AS
    -- 1. Cobranças de mensalidades e cotas (subscription_charges)
    SELECT
      CONCAT('sc_', sc.id) AS uid,
      'subscription' AS source_table,
      sc.id AS source_id,
      sc.subscription_id AS subscription_id,
      sc.asaas_payment_id AS asaas_payment_id,
      CAST(sc.value AS DECIMAL(10,2)) AS value,
      CAST(COALESCE(sc.amount_paid, sc.value) AS DECIMAL(10,2)) AS amount_paid,
      CAST(COALESCE(sc.net_value, 0) AS DECIMAL(10,2)) AS net_value,
      sc.due_date AS due_date,
      sc.paid_date AS paid_date,
      sc.status AS status,
      COALESCE(sc.type, 'other') AS type,
      ac.name AS client_name,
      ac.email AS client_email,
      ac.phone AS client_phone,
      NULL AS vessel_name,
      sc.created_at AS created_at,
      sc.external_reference AS description
    FROM subscription_charges sc
    LEFT JOIN subscriptions s ON sc.subscription_id = s.id
    LEFT JOIN allowed_clients ac ON s.client_id = ac.id
    UNION ALL
    -- 2. Cobranças de combustível (fuel_records)
    SELECT
      CONCAT('fr_', fr.id) AS uid,
      'fuel' AS source_table,
      fr.id AS source_id,
      NULL AS subscription_id,
      fr.asaas_charge_id AS asaas_payment_id,
      CAST(fr.total_amount / 100.0 AS DECIMAL(10,2)) AS value,
      CAST(CASE WHEN fr.payment_status IN ('paid') THEN fr.total_amount / 100.0 ELSE 0 END AS DECIMAL(10,2)) AS amount_paid,
      CAST(0 AS DECIMAL(10,2)) AS net_value,
      fr.due_date AS due_date,
      fr.paid_at AS paid_date,
      CASE
        WHEN fr.payment_status = 'paid' THEN 'paid'
        WHEN fr.payment_status = 'overdue' THEN 'overdue'
        WHEN fr.payment_status = 'cancelled' THEN 'cancelled'
        ELSE 'pending'
      END AS status,
      'fuel' AS type,
      fr.client_name AS client_name,
      fr.client_email AS client_email,
      NULL AS client_phone,
      fr.vessel_name AS vessel_name,
      fr.created_at AS created_at,
      CONCAT('Abastecimento ', COALESCE(fr.liters, 0), 'L - ', COALESCE(fr.vessel_name, '')) AS description
    FROM fuel_records fr
    UNION ALL
    -- 3. Cobranças de vistorias/reparos (inspection_charges)
    SELECT
      CONCAT('ic_', ic.id) AS uid,
      'inspection' AS source_table,
      ic.id AS source_id,
      NULL AS subscription_id,
      ic.asaas_charge_id AS asaas_payment_id,
      CAST(ic.amount AS DECIMAL(10,2)) AS value,
      CAST(CASE WHEN ic.payment_status = 'paid' THEN ic.amount ELSE 0 END AS DECIMAL(10,2)) AS amount_paid,
      CAST(0 AS DECIMAL(10,2)) AS net_value,
      ic.due_date AS due_date,
      NULL AS paid_date,
      CASE
        WHEN ic.payment_status = 'paid' THEN 'paid'
        WHEN ic.payment_status = 'overdue' THEN 'overdue'
        WHEN ic.payment_status = 'cancelled' THEN 'cancelled'
        ELSE 'pending'
      END AS status,
      COALESCE(ic.charge_type, 'repair') AS type,
      NULL AS client_name,
      NULL AS client_email,
      NULL AS client_phone,
      v.name AS vessel_name,
      ic.created_at AS created_at,
      ic.description AS description
    FROM inspection_charges ic
    LEFT JOIN inspections ins ON ic.inspection_id = ins.id
    LEFT JOIN vessels v ON ins.vessel_id = v.id
  `);
  console.log('✅ VIEW financial_charges recriada com sucesso');
} catch (err) {
  console.error('❌ Erro ao criar VIEW financial_charges:', err.message);
}

// Verificar resultado final
console.log('\n📋 Verificando tabelas no banco...');
const [rows] = await connection.query('SHOW TABLES');
const tableNames = rows.map(x => Object.values(x)[0]).sort();
console.log('Tabelas presentes:', tableNames.join(', '));

await connection.end();
console.log('\n✅ Restauração concluída!');
