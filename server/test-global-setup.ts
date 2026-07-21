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
  // Manutenções antes de vessels: os dados de seed referenciam os vessels de teste
  // (evita órfãos e respeita "dependentes primeiro", mesmo sem FK explícita).
  await deleteIfExists("maintenances", `description LIKE 'Teste vitest%' OR description LIKE 'Test maintenance%'`);
  await deleteIfExists("vessels", `name LIKE 'Test%' OR name LIKE 'Teste%'`);
  await deleteIfExists("excluded_asaas_charges", `asaas_charge_id IN ('test-charge-id','pay_test_123','pay_test_456','pay_test_789','pay_test_minimal','pay_test_no_allocs')`);
  // fuelRecords.generatePayment.test.ts semeia uma asaas_api_key falsa em
  // system_settings (updated_by = 'sistema-teste') sem nunca limpar depois —
  // isso poluía resolveAsaasApiKey() (fallback via banco) para QUALQUER outro
  // teste que rodasse depois na mesma suíte, incluindo os que verificam o
  // comportamento de "chave não configurada". Só ficou visível depois que
  // resolveAsaasApiKey() parou de ler um ENV.asaasApiKey congelado.
  await deleteIfExists("system_settings", `updated_by = 'sistema-teste'`);
}

/**
 * Insere dados de referência que a suíte de testes assume existir num banco com
 * histórico de produção (embarcações lancha/jetski, uma manutenção agendada).
 * Num banco recém-criado do zero (CI efêmero) esses dados não existem, então
 * precisam ser semeados. Todos os registros usam prefixos ("Teste"/"Teste vitest")
 * que já são cobertos por cleanupTestData(), garantindo remoção automática.
 *
 * Usa SQL PARAMETRIZADO (sql`...`) — nunca sql.raw com concatenação — para não
 * reintroduzir o anti-pattern de SQL injection.
 */
async function seedTestData() {
  if (!process.env.DATABASE_URL) return;

  let db: ReturnType<typeof drizzle> | null = null;
  try {
    db = drizzle(process.env.DATABASE_URL);
  } catch {
    return;
  }

  try {
    // Lancha de referência — o nome contém "Focker" para bater com
    // vessels.find(v => v.name.includes("Focker")) em quotas.test.ts.
    await db.execute(
      sql`INSERT INTO vessels (name, type) VALUES (${"Teste Focker Lancha"}, ${"lancha"})`,
    );

    // Jetski de referência.
    const jetskiResult = (await db.execute(
      sql`INSERT INTO vessels (name, type) VALUES (${"Teste Jetski Seed"}, ${"jetski"})`,
    )) as any;
    const jetskiId = jetskiResult[0]?.insertId || jetskiResult.insertId;

    // Manutenção agendada 29/11/2025 → 03/12/2025 para o jetski recém-criado.
    // start_date/end_date são epoch ms (bigint), como o restante do sistema usa.
    // Cobre os dois testes de maintenances.getActive (janelas nov/2025 e dez/2025),
    // cujo filtro é de sobreposição: startDate <= queryEnd && endDate >= queryStart.
    const maintenanceStart = Date.UTC(2025, 10, 29, 0, 0, 0); // 2025-11-29
    const maintenanceEnd = Date.UTC(2025, 11, 3, 23, 59, 59); // 2025-12-03
    await db.execute(
      sql`INSERT INTO maintenances (vessel_id, vessel_name, start_date, end_date, description, status)
          VALUES (${jetskiId}, ${"Teste Jetski Seed (JETSKI)"}, ${maintenanceStart}, ${maintenanceEnd}, ${"Teste vitest - seed manutenção período nov/dez"}, ${"scheduled"})`,
    );

    // gallon_stock é uma tabela de referência operacional (galões físicos de
    // combustível), não dado "de teste" — por isso NÃO é limpa por
    // cleanupTestData(). Semeia só se estiver vazia, para não duplicar entre
    // execuções repetidas contra o mesmo banco.
    const gallonCountResult = (await db.execute(
      sql`SELECT COUNT(*) as count FROM gallon_stock`,
    )) as any;
    const gallonRow = Array.isArray(gallonCountResult[0]) ? gallonCountResult[0][0] : gallonCountResult[0];
    const gallonCount = parseInt(gallonRow?.count ?? "0");
    if (gallonCount === 0) {
      await db.execute(
        sql`INSERT INTO gallon_stock (gallon_number, stock_liters, last_price_per_liter) VALUES (1, 0, 0)`,
      );
    }
  } catch (error) {
    // Loga (não silencia) para que uma falha de seed seja visível no CI,
    // mas não interrompe a suíte caso os dados já existam por algum motivo.
    console.error("[test-global-setup] Falha ao semear dados de referência:", error);
  }
}

export async function setup() {
  // Limpeza prévia (caso execução anterior tenha falhado)
  await cleanupTestData();
  // Semeia dados de referência que a suíte assume existir (embarcações, manutenção).
  await seedTestData();
}

export async function teardown() {
  // Limpeza após todos os testes
  await cleanupTestData();
}
