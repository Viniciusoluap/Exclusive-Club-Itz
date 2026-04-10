/**
 * Script de limpeza de dados de teste do banco de dados.
 * Remove todos os registros criados pelos testes automatizados.
 */

import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

const db = drizzle(process.env.DATABASE_URL);

async function deleteWhere(table, condition) {
  try {
    const result = await db.execute(sql.raw(`DELETE FROM ${table} WHERE ${condition}`));
    const affected = result[0]?.affectedRows || 0;
    if (affected > 0) {
      console.log(`  ✓ [${table}] Removidos ${affected} registros WHERE ${condition}`);
    }
    return affected;
  } catch (err) {
    // Tabela pode não existir
    if (!err.message.includes("doesn't exist")) {
      console.warn(`  ⚠ [${table}] Erro: ${err.message}`);
    }
    return 0;
  }
}

async function cleanup() {
  console.log("🧹 Iniciando limpeza de dados de teste...\n");
  let totalDeleted = 0;

  // Padrões de email de teste
  const emailPatterns = [
    "%@example.com",
    "%@test.com",
    "teste%@hotmail.com",
    "teste%@empresa.com.br",
    "teste%@company.net",
    "teste-%@exclusiveclubitz.com",
    "test-%@%",
    "update%@test.com",
    "updatebr%@test.com",
    "updatenet%@test.com",
    "real%@test.com",
    "semtelefone%@example.com",
    "atualizado%@prospectaconstrucoes.com",
    "atualizado%@empresa.com.br",
    "atualizado%@servidor.net",
    "atendimento%@prospectaconstrucoes.com",
    "cliente.teste@example.com",
    "cliente.cobranca@example.com",
    "no-quotas-%@%",
    "stats-client%@%",
    "payment-client%@%",
  ];

  const emailConditions = emailPatterns.map(p => `email LIKE '${p}'`).join(" OR ");
  const clientEmailConditions = emailPatterns.map(p => `client_email LIKE '${p}'`).join(" OR ");

  // 1. Limpar inspection_charges de teste
  console.log("📋 Limpando inspection_charges...");
  totalDeleted += await deleteWhere("inspection_charges", clientEmailConditions);
  const testAsaasIds = ["test-charge-id", "pay_test_123", "pay_test_456", "pay_test_789", "pay_test_minimal", "pay_test_no_allocs"];
  for (const id of testAsaasIds) {
    totalDeleted += await deleteWhere("inspection_charges", `asaas_charge_id = '${id}'`);
  }

  // 2. Limpar inspections de teste
  console.log("\n🔍 Limpando inspections...");
  totalDeleted += await deleteWhere("inspections", clientEmailConditions);
  totalDeleted += await deleteWhere("inspections", `client_name LIKE 'Test%' OR client_name LIKE 'Cliente Teste%'`);

  // 3. Limpar bookings de teste
  console.log("\n📅 Limpando bookings...");
  totalDeleted += await deleteWhere("bookings", clientEmailConditions);

  // 4. Limpar subscription_charges de clientes de teste
  console.log("\n💰 Limpando subscription_charges...");
  totalDeleted += await deleteWhere("subscription_charges", `subscription_id IN (
    SELECT s.id FROM subscriptions s
    INNER JOIN allowed_clients ac ON s.client_id = ac.id
    WHERE ${emailConditions.replace(/email/g, "ac.email")}
  )`);

  // 5. Limpar subscriptions de clientes de teste
  console.log("\n📝 Limpando subscriptions...");
  totalDeleted += await deleteWhere("subscriptions", `client_id IN (
    SELECT id FROM allowed_clients WHERE ${emailConditions}
  )`);

  // 6. Limpar fuel_records de teste
  console.log("\n⛽ Limpando fuel_records...");
  totalDeleted += await deleteWhere("fuel_records", clientEmailConditions);

  // 7. Limpar asaas_payments de teste
  console.log("\n💳 Limpando asaas_payments...");
  totalDeleted += await deleteWhere("asaas_payments", clientEmailConditions);

  // 8. Limpar due_date_requests de teste
  console.log("\n📆 Limpando due_date_requests...");
  totalDeleted += await deleteWhere("due_date_requests", clientEmailConditions);

  // 9. Limpar employees de teste
  console.log("\n👷 Limpando employees...");
  totalDeleted += await deleteWhere("employees", emailConditions);

  // 10. Limpar users de teste
  console.log("\n👤 Limpando users...");
  totalDeleted += await deleteWhere("users", emailConditions);

  // 11. Limpar allowed_clients de teste
  console.log("\n🧑‍💼 Limpando allowed_clients...");
  totalDeleted += await deleteWhere("allowed_clients", emailConditions);

  // 12. Limpar vessels de teste
  console.log("\n🚤 Limpando vessels...");
  totalDeleted += await deleteWhere("vessels", `name LIKE 'Test%' OR name LIKE 'Teste%'`);

  // 13. Limpar backups de teste
  console.log("\n💾 Limpando backups...");
  totalDeleted += await deleteWhere("backups", `file_name LIKE 'test-backup%'`);

  // 14. Limpar maintenances de teste
  console.log("\n🔧 Limpando maintenances...");
  totalDeleted += await deleteWhere("maintenances", `description LIKE 'Teste vitest%' OR description LIKE 'Test maintenance%'`);

  // 15. Limpar excluded_asaas_charges de teste
  console.log("\n🚫 Limpando excluded_asaas_charges...");
  for (const id of testAsaasIds) {
    totalDeleted += await deleteWhere("excluded_asaas_charges", `asaas_charge_id = '${id}'`);
  }

  console.log(`\n✅ Limpeza concluída! Total de registros removidos: ${totalDeleted}`);
}

cleanup().catch(console.error).finally(() => process.exit(0));
