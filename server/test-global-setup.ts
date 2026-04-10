/**
 * Global setup/teardown para testes vitest.
 * 
 * REGRA: Todo dado de teste deve ser removido do banco após a execução dos testes.
 * Este arquivo garante limpeza automática após cada execução de testes.
 */

import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";

async function cleanupTestData() {
  if (!process.env.DATABASE_URL) return;

  let db: ReturnType<typeof drizzle> | null = null;
  try {
    db = drizzle(process.env.DATABASE_URL);
  } catch {
    return;
  }

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

  const emailCond = emailPatterns.map(p => `email LIKE '${p}'`).join(" OR ");
  const clientEmailCond = emailPatterns.map(p => `client_email LIKE '${p}'`).join(" OR ");

  const deleteIfExists = async (table: string, condition: string) => {
    try {
      await db!.execute(sql.raw(`DELETE FROM ${table} WHERE ${condition}`));
    } catch {
      // Ignora erros (tabela pode não existir ou FK constraint)
    }
  };

  // Ordem importa: dependentes primeiro
  await deleteIfExists("inspection_charges", clientEmailCond);
  await deleteIfExists("inspection_charges", `asaas_charge_id IN ('test-charge-id','pay_test_123','pay_test_456','pay_test_789','pay_test_minimal','pay_test_no_allocs')`);
  await deleteIfExists("inspections", clientEmailCond);
  await deleteIfExists("inspections", `client_name LIKE 'Test%' OR client_name LIKE 'Cliente Teste%'`);
  await deleteIfExists("bookings", clientEmailCond);
  await deleteIfExists("subscription_charges", `subscription_id IN (SELECT s.id FROM subscriptions s INNER JOIN allowed_clients ac ON s.client_id = ac.id WHERE ${emailCond.replace(/email/g, "ac.email")})`);
  await deleteIfExists("subscriptions", `client_id IN (SELECT id FROM allowed_clients WHERE ${emailCond})`);
  await deleteIfExists("fuel_records", clientEmailCond);
  await deleteIfExists("asaas_payments", clientEmailCond);
  await deleteIfExists("employees", emailCond);
  await deleteIfExists("users", emailCond);
  await deleteIfExists("allowed_clients", emailCond);
  await deleteIfExists("vessels", `name LIKE 'Test%' OR name LIKE 'Teste%'`);
  await deleteIfExists("maintenances", `description LIKE 'Teste vitest%' OR description LIKE 'Test maintenance%'`);
  await deleteIfExists("excluded_asaas_charges", `asaas_charge_id IN ('test-charge-id','pay_test_123','pay_test_456','pay_test_789','pay_test_minimal','pay_test_no_allocs')`);
}

export async function setup() {
  // Limpeza prévia (caso execução anterior tenha falhado)
  await cleanupTestData();
}

export async function teardown() {
  // Limpeza após todos os testes
  await cleanupTestData();
}
