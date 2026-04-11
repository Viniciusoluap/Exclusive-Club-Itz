/**
 * Script de importação histórica: Asaas → bpo_charges
 * Usa a mesma lógica de descriptografia do servidor para obter a API key.
 */
import mysql from 'mysql2/promise';
import crypto from 'crypto';

// Carregar variáveis de ambiente do processo (injetadas pelo sistema)
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'default-encryption-key-change-me';
const ASAAS_API_URL = 'https://api.asaas.com/v3';

// Descriptografia AES-256-CBC (mesma lógica do systemSettings.ts)
function decrypt(encryptedText) {
  const key = crypto.scryptSync(JWT_SECRET, 'salt', 32);
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function normalizeBpoStatus(asaasStatus) {
  switch ((asaasStatus || '').toUpperCase()) {
    case 'RECEIVED':
    case 'DUNNING_RECEIVED':
      return 'received';
    case 'CONFIRMED':
      return 'confirmed';
    case 'RECEIVED_IN_CASH':
      return 'receivedInCash';
    case 'OVERDUE':
    case 'DUNNING_REQUESTED':
      return 'overdue';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
      return 'refunded';
    case 'AWAITING_CHARGEBACK_REVERSAL':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
      return 'awaitingChargeback';
    case 'DETACHED':
      return 'detached';
    case 'PARTIALLY_PAID':
      return 'partiallyPaid';
    case 'PENDING':
    case 'AWAITING_PAYMENT':
    case 'AWAITING_RISK_ANALYSIS':
    default:
      return 'pending';
  }
}

function isPaid(status) {
  return ['received', 'confirmed', 'receivedInCash'].includes(status);
}

async function fetchCharges(apiKey, offset, limit) {
  const url = `${ASAAS_API_URL}/payments?limit=${limit}&offset=${offset}`;
  const resp = await fetch(url, {
    headers: { 'access_token': apiKey }
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Asaas API error: ${resp.status} ${text.substring(0, 200)}`);
  }
  return resp.json();
}

async function main() {
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL não encontrada');
    process.exit(1);
  }

  const conn = await mysql.createConnection(DATABASE_URL);
  console.log('✅ Conectado ao banco de dados');

  // Buscar e descriptografar a API key do Asaas
  const [keyRows] = await conn.execute(
    "SELECT value FROM system_settings WHERE `key` = 'asaas_api_key' LIMIT 1"
  );
  if (!keyRows.length || !keyRows[0].value) {
    console.error('❌ asaas_api_key não encontrada em system_settings');
    await conn.end();
    process.exit(1);
  }
  
  let apiKey;
  try {
    apiKey = decrypt(keyRows[0].value);
    console.log(`✅ API key descriptografada: ${apiKey.substring(0, 10)}...`);
  } catch (e) {
    console.error('❌ Erro ao descriptografar API key:', e.message);
    await conn.end();
    process.exit(1);
  }

  // Testar a API key
  const testResp = await fetch(`${ASAAS_API_URL}/payments?limit=1`, {
    headers: { 'access_token': apiKey }
  });
  if (!testResp.ok) {
    console.error(`❌ API key inválida: ${testResp.status}`);
    await conn.end();
    process.exit(1);
  }
  const testData = await testResp.json();
  console.log(`✅ API key válida. Total de cobranças no Asaas: ${testData.totalCount || 'N/A'}`);

  // Buscar mapa de clientes locais via unclassified_charges (que tem asaas_customer_id)
  const [subs] = await conn.execute(`
    SELECT DISTINCT uc.asaas_customer_id, uc.linked_client_id, uc.asaas_customer_name, uc.asaas_customer_email
    FROM unclassified_charges uc
    WHERE uc.asaas_customer_id IS NOT NULL AND uc.linked_client_id IS NOT NULL
  `);
  
  const clientMap = new Map();
  for (const sub of subs) {
    if (sub.asaas_customer_id && !clientMap.has(sub.asaas_customer_id)) {
      clientMap.set(sub.asaas_customer_id, {
        id: sub.linked_client_id,
        name: sub.asaas_customer_name || null,
        email: sub.asaas_customer_email || '',
      });
    }
  }
  console.log(`📋 ${clientMap.size} clientes mapeados do banco local`);

  const report = { total: 0, inserted: 0, updated: 0, errors: 0, pages: 0 };
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    try {
      const data = await fetchCharges(apiKey, offset, limit);
      const charges = data.data || [];
      hasMore = data.hasMore ?? false;
      offset += limit;
      report.pages++;

      process.stdout.write(`\r📄 Página ${report.pages}: ${report.total + charges.length} cobranças processadas...`);

      for (const charge of charges) {
        try {
          const clientInfo = clientMap.get(charge.customer);
          const normalizedStatus = normalizeBpoStatus(charge.status);
          const paid = isPaid(normalizedStatus);
          const amountPaid = paid ? (charge.value || 0) : 0;

          // Verificar se já existe
          const [existing] = await conn.execute(
            'SELECT id FROM bpo_charges WHERE asaas_charge_id = ?',
            [charge.id]
          );

          if (existing.length > 0) {
            await conn.execute(
              `UPDATE bpo_charges SET 
                status = ?, paid_date = ?, amount_paid = ?, net_value = ?,
                synced_at = NOW(), source = 'asaas_import'
               WHERE asaas_charge_id = ?`,
              [normalizedStatus, charge.paymentDate || null, amountPaid, charge.netValue || null, charge.id]
            );
            report.updated++;
          } else {
            await conn.execute(
              `INSERT INTO bpo_charges 
                (asaas_charge_id, asaas_customer_id, client_id, client_name, client_email,
                 value, net_value, amount_paid, due_date, paid_date, status,
                 billing_type, description, external_reference, payment_link, invoice_url, bank_slip_url,
                 source, synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'asaas_import', NOW())`,
              [
                charge.id,
                charge.customer || null,
                clientInfo?.id || null,
                clientInfo?.name || null,
                clientInfo?.email || null,
                charge.value || 0,
                charge.netValue || null,
                amountPaid,
                charge.dueDate,
                charge.paymentDate || null,
                normalizedStatus,
                charge.billingType || null,
                charge.description || null,
                charge.externalReference || null,
                charge.invoiceUrl || null,
                charge.invoiceUrl || null,
                charge.bankSlipUrl || null,
              ]
            );
            report.inserted++;
          }
          report.total++;
        } catch (err) {
          console.error(`\n  ❌ Erro na cobrança ${charge.id}:`, err.message);
          report.errors++;
        }
      }

      // Rate limiting
      if (hasMore) await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`\n❌ Erro na página ${report.pages}:`, err.message);
      hasMore = false;
    }
  }

  // Verificar totais finais
  console.log('\n');
  const [stats] = await conn.execute(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('received','confirmed','receivedInCash') THEN value ELSE 0 END) as totalPaid,
      SUM(CASE WHEN status = 'pending' AND due_date >= CURDATE() THEN value ELSE 0 END) as totalPending,
      SUM(CASE WHEN status = 'overdue' OR (status = 'pending' AND due_date < CURDATE()) THEN value ELSE 0 END) as totalOverdue
    FROM bpo_charges
  `);

  const s = stats[0];
  const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  
  console.log('✅ Importação concluída!');
  console.log('📊 Relatório de importação:');
  console.log(`   Total processado: ${report.total}`);
  console.log(`   Inseridas:        ${report.inserted}`);
  console.log(`   Atualizadas:      ${report.updated}`);
  console.log(`   Erros:            ${report.errors}`);
  console.log('\n💰 Totais no banco (bpo_charges):');
  console.log(`   Total de cobranças: ${s.total}`);
  console.log(`   Recebido:  R$ ${fmt(s.totalPaid)}`);
  console.log(`   Pendente:  R$ ${fmt(s.totalPending)}`);
  console.log(`   Vencido:   R$ ${fmt(s.totalOverdue)}`);

  await conn.end();
}

main().catch(e => { console.error('\n❌ Erro fatal:', e.message); process.exit(1); });
