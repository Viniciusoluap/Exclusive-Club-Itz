#!/usr/bin/env node
/**
 * analyze-duplicates.mjs
 * Analisa duplicatas em subscription_charges e unclassified_charges.
 * Também conta cobranças com customer_name começando com 'cus_0'.
 */
import { createConnection } from "mysql2/promise";
import { config } from "dotenv";
config();

const conn = await createConnection(process.env.DATABASE_URL);

console.log("=== ANÁLISE DE DUPLICATAS E COBRANÇAS cus_0 ===\n");

// 1. Total de registros em cada tabela
const [[{ total_sc }]] = await conn.execute("SELECT COUNT(*) as total_sc FROM subscription_charges");
const [[{ total_uc }]] = await conn.execute("SELECT COUNT(*) as total_uc FROM unclassified_charges");
console.log(`subscription_charges: ${total_sc} registros`);
console.log(`unclassified_charges: ${total_uc} registros\n`);

// 2. Duplicatas em subscription_charges por asaas_charge_id
const [dup_sc] = await conn.execute(`
  SELECT asaas_charge_id, COUNT(*) as cnt
  FROM subscription_charges
  WHERE asaas_charge_id IS NOT NULL
  GROUP BY asaas_charge_id
  HAVING cnt > 1
  ORDER BY cnt DESC
  LIMIT 20
`);
console.log(`Duplicatas em subscription_charges (por asaas_charge_id): ${dup_sc.length} grupos`);
if (dup_sc.length > 0) {
  console.log("Top duplicatas:", dup_sc.slice(0, 5).map(r => `${r.asaas_charge_id} (${r.cnt}x)`).join(", "));
}

// 3. Total de registros duplicados em subscription_charges
const [[{ dup_sc_total }]] = await conn.execute(`
  SELECT SUM(cnt - 1) as dup_sc_total FROM (
    SELECT COUNT(*) as cnt FROM subscription_charges
    WHERE asaas_charge_id IS NOT NULL
    GROUP BY asaas_charge_id HAVING cnt > 1
  ) t
`);
console.log(`Total de registros EXTRAS (duplicatas) em subscription_charges: ${dup_sc_total ?? 0}\n`);

// 4. Duplicatas em unclassified_charges por asaasChargeId
const [dup_uc] = await conn.execute(`
  SELECT asaasChargeId, COUNT(*) as cnt
  FROM unclassified_charges
  WHERE asaasChargeId IS NOT NULL
  GROUP BY asaasChargeId
  HAVING cnt > 1
  ORDER BY cnt DESC
  LIMIT 20
`);
console.log(`Duplicatas em unclassified_charges (por asaasChargeId): ${dup_uc.length} grupos`);
if (dup_uc.length > 0) {
  console.log("Top duplicatas:", dup_uc.slice(0, 5).map(r => `${r.asaasChargeId} (${r.cnt}x)`).join(", "));
}

const [[{ dup_uc_total }]] = await conn.execute(`
  SELECT SUM(cnt - 1) as dup_uc_total FROM (
    SELECT COUNT(*) as cnt FROM unclassified_charges
    WHERE asaasChargeId IS NOT NULL
    GROUP BY asaasChargeId HAVING cnt > 1
  ) t
`);
console.log(`Total de registros EXTRAS (duplicatas) em unclassified_charges: ${dup_uc_total ?? 0}\n`);

// 5. Cobranças com customer_name começando com 'cus_0'
const [[{ cus0_count }]] = await conn.execute(`
  SELECT COUNT(*) as cus0_count FROM unclassified_charges
  WHERE customer_name LIKE 'cus_0%' OR (customer_name IS NULL AND asaas_customer_id LIKE 'cus_0%')
`);
console.log(`Cobranças com customer_name/id começando com 'cus_0': ${cus0_count}`);

// 6. Soma dos valores das cobranças cus_0
const [[{ cus0_value }]] = await conn.execute(`
  SELECT SUM(CAST(value AS DECIMAL(10,2))) as cus0_value FROM unclassified_charges
  WHERE customer_name LIKE 'cus_0%' OR (customer_name IS NULL AND asaas_customer_id LIKE 'cus_0%')
`);
console.log(`Valor total das cobranças cus_0: R$ ${parseFloat(cus0_value || 0).toFixed(2)}\n`);

// 7. Valor total em subscription_charges (para verificar se está inflado)
const [[{ total_value_sc }]] = await conn.execute(`
  SELECT SUM(CAST(amount AS DECIMAL(10,2))) as total_value_sc FROM subscription_charges
`);
console.log(`Valor total em subscription_charges: R$ ${parseFloat(total_value_sc || 0).toFixed(2)}`);

// 8. Verificar se há cobranças em subscription_charges que também estão em unclassified_charges como classified=0
const [[{ cross_dup }]] = await conn.execute(`
  SELECT COUNT(*) as cross_dup FROM subscription_charges sc
  INNER JOIN unclassified_charges uc ON sc.asaas_charge_id = uc.asaasChargeId
  WHERE uc.classified = 0
`);
console.log(`Cobranças em subscription_charges que ainda aparecem como não-classificadas no cache: ${cross_dup}`);

await conn.end();
console.log("\n=== FIM DA ANÁLISE ===");
