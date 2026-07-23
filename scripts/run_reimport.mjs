/**
 * Script de reimportação completa do Asaas → bpo_charges
 * Usa scryptSync para descriptografar a API key (igual ao servidor)
 */
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import { confirmDestructive } from './_confirmDestructive.mjs';

const DB_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!DB_URL || !JWT_SECRET) {
  console.error('DATABASE_URL ou JWT_SECRET não encontrados');
  process.exit(1);
}

await confirmDestructive('run_reimport.mjs (DELETE FROM bpo_charges + reimport)');

const conn = await mysql.createConnection(DB_URL);

// Descriptografar API key usando scryptSync (igual ao systemSettings.ts do servidor)
const [rows] = await conn.execute("SELECT value FROM system_settings WHERE `key` = 'asaas_api_key' LIMIT 1");
const encryptedKey = rows[0]?.value;

if (!encryptedKey) {
  console.error('Chave Asaas não encontrada no banco');
  await conn.end();
  process.exit(1);
}

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

const asaasApiKey = decrypt(encryptedKey);
console.log('✅ API key descriptografada:', asaasApiKey.substring(0, 25) + '...');

// Verificar conexão com Asaas
const testResp = await fetch('https://api.asaas.com/v3/myAccount', {
  headers: { 'access_token': asaasApiKey }
});
const testData = await testResp.json();
if (!testResp.ok) {
  console.error('❌ Asaas API inválida:', testData);
  await conn.end();
  process.exit(1);
}
console.log('✅ Asaas conectado. Conta:', testData.name);

// Zerar bpo_charges
console.log('\n🗑️  Zerando tabela bpo_charges...');
await conn.execute('DELETE FROM bpo_charges');
const [countAfterDelete] = await conn.execute('SELECT COUNT(*) as c FROM bpo_charges');
console.log('✅ Tabela zerada. Registros restantes:', countAfterDelete[0].c);

// Classificação automática por palavras-chave
function autoClassify(description, externalRef) {
  const text = `${description || ''} ${externalRef || ''}`.toLowerCase();
  if (/mensalidade|cota|quota|parcela|contrato|assinatura|subscription/.test(text)) {
    return { type: 'monthly', classifiedBy: 'auto' };
  }
  if (/abastecimento|combustivel|gasolina|litros|fuel|tanque/.test(text)) {
    return { type: 'fuel', classifiedBy: 'auto' };
  }
  if (/vistoria|reparo|dano|avaria|reprovacao|conserto|manutencao/.test(text)) {
    return { type: 'repair', classifiedBy: 'auto' };
  }
  if (/venda|quota_sale|aquisicao|compra.*cota|cota.*compra/.test(text)) {
    return { type: 'quota_sale', classifiedBy: 'auto' };
  }
  return { type: 'other', classifiedBy: 'unclassified' };
}

// Normalizar status do Asaas para o formato interno
function normalizeStatus(asaasStatus) {
  const map = {
    'PENDING': 'pending',
    'RECEIVED': 'received',
    'CONFIRMED': 'confirmed',
    'OVERDUE': 'overdue',
    'REFUNDED': 'refunded',
    'RECEIVED_IN_CASH': 'receivedInCash',
    'AWAITING_CHARGEBACK_REVERSAL': 'awaitingChargeback',
    'DETACHED': 'detached',
    'PARTIALLY_PAID': 'partiallyPaid',
  };
  return map[asaasStatus] || 'pending';
}

function isPaid(status) {
  return ['received', 'confirmed', 'receivedInCash'].includes(status);
}

// Montar mapa de clientes: asaasCustomerId → {id, name, email}
console.log('\n📋 Montando mapa de clientes...');

// Fonte A: unclassified_charges (já tem vínculo asaasCustomerId → linkedClientId)
const [ucLinks] = await conn.execute(`
  SELECT DISTINCT asaas_customer_id, linked_client_id, asaas_customer_name, asaas_customer_email 
  FROM unclassified_charges 
  WHERE asaas_customer_id IS NOT NULL AND linked_client_id IS NOT NULL
`);

const clientMap = new Map();
for (const uc of ucLinks) {
  if (!clientMap.has(uc.asaas_customer_id)) {
    clientMap.set(uc.asaas_customer_id, {
      id: uc.linked_client_id,
      name: uc.asaas_customer_name || '',
      email: uc.asaas_customer_email || '',
    });
  }
}

// Fonte B: fuel_records como ponte asaasCustomerId → email → allowedClients
const [fuelLinks] = await conn.execute(`
  SELECT DISTINCT client_email, asaas_customer_id 
  FROM fuel_records 
  WHERE asaas_customer_id IS NOT NULL AND client_email IS NOT NULL
`);
const [clients] = await conn.execute('SELECT id, name, email FROM allowed_clients');

const emailToAsaasId = new Map();
for (const fr of fuelLinks) {
  if (!emailToAsaasId.has(fr.client_email)) {
    emailToAsaasId.set(fr.client_email, fr.asaas_customer_id);
  }
}
for (const client of clients) {
  const asaasId = emailToAsaasId.get(client.email);
  if (asaasId && !clientMap.has(asaasId)) {
    clientMap.set(asaasId, { id: client.id, name: client.name, email: client.email });
  }
}

// Fonte C: unclassified_charges como fonte adicional (asaas_payment_id → customer)
// Já coberta pela Fonte A acima - pular para não duplicar

console.log(`✅ Mapa de clientes: ${clientMap.size} vínculos encontrados`);
console.log('   Clientes mapeados:');
for (const [asaasId, info] of clientMap) {
  console.log(`   - ${asaasId.substring(0, 15)}... → ${info.name} (${info.email})`);
}

// Importar cobranças do Asaas a partir de 01/01/2025
console.log('\n📥 Importando cobranças do Asaas (01/01/2025 em diante)...');
const report = { total: 0, inserted: 0, classified: 0, unclassified: 0, errors: 0 };

let offset = 0;
const limit = 100;
let hasMore = true;
let pageCount = 0;

while (hasMore) {
  const url = `https://api.asaas.com/v3/payments?limit=${limit}&offset=${offset}&dueDateGe=2025-01-01`;
  const resp = await fetch(url, { headers: { 'access_token': asaasApiKey } });
  
  if (!resp.ok) {
    const errText = await resp.text();
    console.error('❌ Erro ao buscar cobranças:', resp.status, errText);
    break;
  }
  
  const data = await resp.json();
  const charges = data.data || [];
  hasMore = data.hasMore || false;
  pageCount++;
  offset += limit;
  
  console.log(`  Página ${pageCount} (offset=${offset - limit}): ${charges.length} cobranças | hasMore=${hasMore}`);
  
  for (const charge of charges) {
    try {
      const clientInfo = clientMap.get(charge.customer);
      const normalizedStatus = normalizeStatus(charge.status);
      const paid = isPaid(normalizedStatus);
      const { type, classifiedBy } = autoClassify(charge.description, charge.externalReference);
      
      await conn.execute(`
        INSERT INTO bpo_charges (
          asaas_charge_id, asaas_customer_id, client_id, client_name, client_email,
          value, net_value, amount_paid, due_date, paid_date, status, type, classified_by,
          billing_type, description, external_reference, payment_link, invoice_url, bank_slip_url,
          source, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        charge.id,
        charge.customer,
        clientInfo?.id ?? null,
        clientInfo?.name ?? null,
        clientInfo?.email ?? null,
        String(charge.value),
        charge.netValue != null ? String(charge.netValue) : null,
        paid ? String(charge.value) : '0',
        charge.dueDate,
        charge.paymentDate || null,
        normalizedStatus,
        type,
        classifiedBy,
        charge.billingType || null,
        charge.description || null,
        charge.externalReference || null,
        charge.invoiceUrl || null,
        charge.invoiceUrl || null,
        charge.bankSlipUrl || null,
        'asaas_import',
      ]);
      
      report.inserted++;
      report.total++;
      if (classifiedBy === 'auto') report.classified++;
      else report.unclassified++;
    } catch (err) {
      console.error('  ❌ Erro ao inserir:', charge.id, err.message);
      report.errors++;
    }
  }
  
  if (hasMore) await new Promise(r => setTimeout(r, 300));
}

await conn.end();

console.log('\n✅ Reimportação concluída!');
console.log('📊 Relatório final:');
console.log(`  Total processado:                  ${report.total}`);
console.log(`  Inseridos com sucesso:             ${report.inserted}`);
console.log(`  Classificados automaticamente:     ${report.classified}`);
console.log(`  Não classificados (revisar manual): ${report.unclassified}`);
console.log(`  Erros:                             ${report.errors}`);
