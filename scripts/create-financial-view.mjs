import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

console.log('Criando VIEW financial_charges...\n');

// Dropar view se já existir
await connection.execute('DROP VIEW IF EXISTS financial_charges');

// Criar a VIEW consolidada
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
  -- Nota: fuel_records usa total_amount (int, centavos) e asaas_charge_id
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
  -- Nota: inspection_charges usa amount e asaas_charge_id, sem client_name
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
      ELSE 'pending'
    END AS status,
    CASE WHEN ic.charge_type = 'repair' THEN 'repair' ELSE 'other' END AS type,
    NULL AS client_name,
    ic.client_email AS client_email,
    NULL AS client_phone,
    ic.vessel_name AS vessel_name,
    ic.created_at AS created_at,
    COALESCE(ic.description, CONCAT(CASE WHEN ic.charge_type = 'repair' THEN 'Reparo' ELSE 'Vistoria' END, ' - ', COALESCE(ic.vessel_name, ''))) AS description
  FROM inspection_charges ic
`);

console.log('✅ VIEW financial_charges criada com sucesso!\n');

// Verificar a view
const [rows] = await connection.execute(`
  SELECT 
    source_table,
    status,
    COUNT(*) as total,
    SUM(value) as valor_total
  FROM financial_charges
  GROUP BY source_table, status
  ORDER BY source_table, status
`);

console.log('📊 Resumo da VIEW financial_charges:');
console.log('─'.repeat(70));
console.log('Fonte'.padEnd(15) + 'Status'.padEnd(12) + 'Qtd'.padEnd(8) + 'Valor Total');
console.log('─'.repeat(70));

let grandTotal = 0;
let grandCount = 0;
for (const row of rows) {
  const valor = parseFloat(row.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  console.log(
    String(row.source_table).padEnd(15) +
    String(row.status).padEnd(12) +
    String(row.total).padEnd(8) +
    valor
  );
  grandTotal += parseFloat(row.valor_total || 0);
  grandCount += parseInt(row.total);
}
console.log('─'.repeat(70));
console.log('TOTAL'.padEnd(15) + ''.padEnd(12) + String(grandCount).padEnd(8) + grandTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

await connection.end();
console.log('\n✅ Concluído!');
