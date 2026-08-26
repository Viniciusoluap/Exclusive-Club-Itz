#!/usr/bin/env node
/**
 * Prepara uma cópia de restauração do dump financeiro mais recente.
 *
 * Este script NÃO conecta a banco e NÃO importa nada. Ele valida a estrutura,
 * remove a view legada `financial_charges` e normaliza o único desvio de nomes
 * encontrado no snapshot de agosto: `users` veio em camelCase, enquanto a main
 * atual usa snake_case.
 *
 * Uso:
 *   node scripts/prepare_backup_restore.mjs \
 *     --input recovery/new_backup/extracted/database.sql \
 *     --output recovery/new_backup/restore.sql \
 *     --report recovery/new_backup/restore-report.json
 */
import fs from "node:fs/promises";
import path from "node:path";

function argument(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const input = argument("--input");
const output = argument("--output");
const reportPath = argument("--report", "recovery/backup-restore-report.json");

if (!input || !output) {
  throw new Error("Uso: --input database.sql --output restore.sql [--report report.json]");
}

const source = await fs.readFile(input, "utf8");
const requiredTables = [
  "allowed_clients",
  "asaas_customers",
  "bpo_charges",
  "expense_records",
  "backup_attachments",
  "backup_history",
  "users",
  "system_settings",
  "webhook_logs",
];
const tableNames = new Set(
  [...source.matchAll(/^-- Table: `?([^`\n]+?)`?\s*$/gm)].map(match => match[1].trim()),
);
const missingRequired = requiredTables.filter(table => !tableNames.has(table));
if (missingRequired.length > 0) {
  throw new Error(`Dump incompatível: tabelas obrigatórias ausentes: ${missingRequired.join(", ")}`);
}
if (!source.includes("-- Backup completed successfully")) {
  throw new Error("Dump sem marcador de conclusão; cópia possivelmente truncada.");
}
if (!source.includes("SET FOREIGN_KEY_CHECKS = 0;") || !source.includes("SET FOREIGN_KEY_CHECKS = 1;")) {
  throw new Error("Dump sem marcadores completos de FOREIGN_KEY_CHECKS.");
}

const viewStart = source.indexOf("-- View: financial_charges");
const restoreEnd = source.lastIndexOf("SET FOREIGN_KEY_CHECKS = 1;");
let sanitized = source;
let removedLegacyView = false;
if (viewStart >= 0 && restoreEnd > viewStart) {
  sanitized = `${source.slice(0, viewStart)}${source.slice(restoreEnd)}`;
  removedLegacyView = true;
}

const userColumnRenames = [
  ["openId", "open_id"],
  ["loginMethod", "login_method"],
  ["createdAt", "created_at"],
  ["updatedAt", "updated_at"],
  ["lastSignedIn", "last_signed_in"],
];
const normalizedUserColumns = [];
for (const [from, to] of userColumnRenames) {
  const marker = new RegExp("`" + from + "`", "g");
  if (marker.test(sanitized)) {
    sanitized = sanitized.replace(marker, "`" + to + "`");
    normalizedUserColumns.push(`${from} -> ${to}`);
  }
}

const header = [
  "-- Exclusive Club — restauração preparada automaticamente",
  `-- Fonte: ${path.basename(input)}`,
  "-- ATENÇÃO: importar SOMENTE em uma base NOVA/VAZIA; nunca em produção existente.",
  "-- Após o import, executar o autoMigrate atual e depois o dry-run Asaas.",
  "-- O snapshot de agosto foi normalizado apenas em uma cópia: users camelCase -> snake_case.",
  "",
].join("\n");
sanitized = header + sanitized;

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, sanitized, "utf8");
const report = {
  input,
  output,
  generatedAt: new Date().toISOString(),
  sourceBytes: Buffer.byteLength(source),
  outputBytes: Buffer.byteLength(sanitized),
  tableCount: tableNames.size,
  requiredTablesPresent: requiredTables,
  missingRequiredTables: missingRequired,
  removedLegacyView,
  normalizedUserColumns,
  hasOpenFinanceTables: [...tableNames].some(table => table.startsWith("open_finance_")),
  tableCountExpectedAfterMigrations: tableNames.size + 5,
  mode: "prepare-only",
  databaseImportPerformed: false,
};
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
console.log("Nenhuma conexão ou importação de banco foi realizada.");
