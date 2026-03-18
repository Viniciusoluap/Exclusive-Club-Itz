/**
 * Script para gerar cobranças de março a dezembro de 2026 para Lucas Santos Miranda
 * Subscription ID: 210001
 * Valor: R$ 700,00
 * Dia de vencimento: 15
 * Período: março/2026 a dezembro/2026
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const ASAAS_API_URL = 'https://api.asaas.com/v3';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL não encontrada');
  process.exit(1);
}

// Descriptografar valor do system_settings
function decrypt(encryptedText) {
  const ENCRYPTION_KEY = process.env.JWT_SECRET || 'default-encryption-key-change-me';
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Buscar chave Asaas do banco
async function getAsaasApiKey(connection) {
  const [rows] = await connection.execute('SELECT value FROM system_settings WHERE `key` = ?', ['asaas_api_key']);
  if (rows.length === 0 || !rows[0].value) {
    throw new Error('Chave Asaas não encontrada no banco');
  }
  return decrypt(rows[0].value);
}

// Dados da subscription de Lucas
const SUBSCRIPTION_ID = 210001;
const CLIENT_NAME = 'LUCAS SANTOS MIRANDA';
const CLIENT_EMAIL = 'lucassantosm.adv@gmail.com'; // Precisamos buscar do banco
const VALUE = 700.00;
const DUE_DAY = 15;
const START_YEAR = 2026;
const START_MONTH = 3; // março (1-indexed)
const END_MONTH = 12;  // dezembro

async function getAsaasCustomerId(email, name, apiKey) {
  // Buscar cliente existente no Asaas
  const searchUrl = `${ASAAS_API_URL}/customers?email=${encodeURIComponent(email)}`;
  const response = await fetch(searchUrl, {
    headers: { 'access_token': apiKey }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro ao buscar cliente no Asaas: ${error}`);
  }
  
  const data = await response.json();
  if (data.data && data.data.length > 0) {
    console.log(`Cliente encontrado no Asaas: ${data.data[0].id}`);
    return data.data[0].id;
  }
  
  // Criar cliente se não existir
  console.log('Cliente não encontrado, criando...');
  const createResponse = await fetch(`${ASAAS_API_URL}/customers`, {
    method: 'POST',
    headers: {
      'access_token': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, email }),
  });
  
  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Erro ao criar cliente no Asaas: ${error}`);
  }
  
  const newCustomer = await createResponse.json();
  console.log(`Cliente criado no Asaas: ${newCustomer.id}`);
  return newCustomer.id;
}

async function createPixCharge(customerId, value, dueDate, description, apiKey) {
  const response = await fetch(`${ASAAS_API_URL}/payments`, {
    method: 'POST',
    headers: {
      'access_token': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer: customerId,
      billingType: 'PIX',
      value,
      dueDate,
      description,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro ao criar cobrança no Asaas: ${error}`);
  }
  
  return await response.json();
}

async function main() {
  const connection = await mysql.createConnection(DATABASE_URL);
  
  try {
    // Buscar dados do cliente
    const [rows] = await connection.execute(
      'SELECT ac.email, ac.name FROM subscriptions s JOIN allowed_clients ac ON s.client_id = ac.id WHERE s.id = ?',
      [SUBSCRIPTION_ID]
    );
    
    if (rows.length === 0) {
      console.error('Subscription não encontrada');
      process.exit(1);
    }
    
    const clientEmail = rows[0].email;
    const clientName = rows[0].name;
    console.log(`Cliente: ${clientName} (${clientEmail})`);
    
    // Verificar se já existem cobranças
    const [existingCharges] = await connection.execute(
      'SELECT COUNT(*) as count FROM subscription_charges WHERE subscription_id = ?',
      [SUBSCRIPTION_ID]
    );
    
    if (existingCharges[0].count > 0) {
      console.log(`AVISO: Já existem ${existingCharges[0].count} cobranças para esta subscription. Abortando.`);
      process.exit(1);
    }
    
    // Buscar chave Asaas
    const apiKey = await getAsaasApiKey(connection);
    console.log('Chave Asaas obtida do banco');
    
    // Buscar ou criar cliente no Asaas
    const asaasCustomerId = await getAsaasCustomerId(clientEmail, clientName, apiKey);
    
    console.log(`\nGerando cobranças de ${START_MONTH}/2026 a ${END_MONTH}/2026...`);
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    for (let month = START_MONTH; month <= END_MONTH; month++) {
      // Meses em JavaScript são 0-indexed, então mês 3 = março = índice 2
      const dueDate = new Date(START_YEAR, month - 1, DUE_DAY);
      const dueDateStr = dueDate.toISOString().split('T')[0];
      const description = `Mensalidade ${String(month).padStart(2, '0')}/${START_YEAR} - ${clientName}`;
      
      // Se a data de vencimento já passou, usar data de hoje para o Asaas
      // mas registrar a data correta no banco local
      const asaasDueDateStr = dueDate < today ? todayStr : dueDateStr;
      
      console.log(`  Criando cobrança para ${dueDateStr} (Asaas: ${asaasDueDateStr}): ${description}`);
      
      // Criar cobrança no Asaas
      const asaasCharge = await createPixCharge(asaasCustomerId, VALUE, asaasDueDateStr, description, apiKey);
      console.log(`    Asaas ID: ${asaasCharge.id}`);
      
      // Inserir no banco local com a data correta
      await connection.execute(
        'INSERT INTO subscription_charges (subscription_id, asaas_payment_id, value, due_date, status, type) VALUES (?, ?, ?, ?, ?, ?)',
        [SUBSCRIPTION_ID, asaasCharge.id, VALUE.toFixed(2), dueDateStr, 'pending', 'monthly']
      );
      console.log(`    Inserido no banco local`);
    }
    
    console.log(`\n✅ Cobranças geradas com sucesso! Total: ${END_MONTH - START_MONTH + 1} cobranças`);
    
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
