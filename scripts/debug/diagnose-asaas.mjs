/**
 * Script de diagnóstico para verificar cobranças no Asaas
 * Uso: node diagnose-asaas.mjs
 */

import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";

async function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada");
  }
  return drizzle(process.env.DATABASE_URL);
}

async function getSetting(key) {
  const db = await getDb();
  const result = await db.execute(sql`
    SELECT setting_value FROM system_settings WHERE setting_key = ${key}
  `);
  const row = Array.isArray(result[0]) ? result[0][0] : result[0];
  return row?.setting_value || null;
}

async function getAsaasApiKey() {
  const keyFromDb = await getSetting("asaas_api_key");
  if (keyFromDb) {
    console.log("✅ API Key encontrada no banco de dados");
    return keyFromDb;
  }

  const keyFromEnv = process.env.ASAAS_API_KEY;
  if (keyFromEnv) {
    console.log("✅ API Key encontrada no .env");
    return keyFromEnv;
  }

  throw new Error("❌ ASAAS_API_KEY não configurada");
}

async function getAsaasApiUrl(apiKey) {
  return apiKey.startsWith("$aact_prod_")
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

async function checkCharge(chargeId, apiKey, apiUrl) {
  try {
    const response = await fetch(`${apiUrl}/payments/${chargeId}`, {
      method: 'GET',
      headers: {
        'access_token': apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return { exists: false, error };
    }

    const data = await response.json();
    return { exists: true, data };
  } catch (error) {
    return { exists: false, error: error.message };
  }
}

async function main() {
  console.log("🔍 Diagnóstico de Integração Asaas\n");
  
  try {
    // 1. Verificar API Key
    console.log("1️⃣ Verificando configuração da API Key...");
    const apiKey = await getAsaasApiKey();
    const apiUrl = await getAsaasApiUrl(apiKey);
    console.log(`   Ambiente: ${apiUrl.includes('sandbox') ? '🧪 SANDBOX' : '🚀 PRODUÇÃO'}`);
    console.log(`   URL: ${apiUrl}\n`);

    // 2. Buscar últimos abastecimentos
    console.log("2️⃣ Buscando últimos abastecimentos...");
    const db = await getDb();
    const records = await db.execute(sql`
      SELECT 
        id,
        client_name,
        client_email,
        total_amount,
        asaas_charge_id,
        payment_status,
        sync_status,
        recorded_at
      FROM fuel_records 
      WHERE asaas_charge_id IS NOT NULL
      ORDER BY recorded_at DESC 
      LIMIT 5
    `);
    
    const rows = Array.isArray(records[0]) ? records[0] : [records[0]];
    console.log(`   Encontrados ${rows.length} registros com asaas_charge_id\n`);

    // 3. Verificar cada cobrança no Asaas
    console.log("3️⃣ Verificando cobranças no Asaas...\n");
    
    for (const record of rows) {
      console.log(`📋 Registro #${record.id}`);
      console.log(`   Cliente: ${record.client_name} (${record.client_email})`);
      console.log(`   Valor: R$ ${(record.total_amount / 100).toFixed(2)}`);
      console.log(`   Charge ID: ${record.asaas_charge_id}`);
      console.log(`   Status DB: ${record.sync_status} / ${record.payment_status}`);
      console.log(`   Data: ${new Date(record.recorded_at).toLocaleString('pt-BR')}`);
      
      const result = await checkCharge(record.asaas_charge_id, apiKey, apiUrl);
      
      if (result.exists) {
        console.log(`   ✅ COBRANÇA EXISTE NO ASAAS`);
        console.log(`      Status Asaas: ${result.data.status}`);
        console.log(`      Valor Asaas: R$ ${result.data.value}`);
        console.log(`      Vencimento: ${result.data.dueDate}`);
        if (result.data.invoiceUrl) {
          console.log(`      URL Pagamento: ${result.data.invoiceUrl}`);
        }
      } else {
        console.log(`   ❌ COBRANÇA NÃO ENCONTRADA NO ASAAS`);
        console.log(`      Erro: ${result.error}`);
      }
      console.log("");
    }

    // 4. Resumo
    console.log("📊 RESUMO DO DIAGNÓSTICO\n");
    const existingCharges = [];
    const missingCharges = [];
    
    for (const record of rows) {
      const result = await checkCharge(record.asaas_charge_id, apiKey, apiUrl);
      if (result.exists) {
        existingCharges.push(record);
      } else {
        missingCharges.push(record);
      }
    }
    
    console.log(`✅ Cobranças encontradas no Asaas: ${existingCharges.length}`);
    console.log(`❌ Cobranças NÃO encontradas no Asaas: ${missingCharges.length}`);
    
    if (missingCharges.length > 0) {
      console.log("\n⚠️  PROBLEMA IDENTIFICADO:");
      console.log("   Algumas cobranças estão marcadas como 'synced' no banco,");
      console.log("   mas NÃO existem no Asaas. Isso indica falha na integração.");
    } else {
      console.log("\n✅ INTEGRAÇÃO OK:");
      console.log("   Todas as cobranças do banco existem no Asaas.");
    }

  } catch (error) {
    console.error("\n❌ ERRO:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
