import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Testa scripts/prepare_backup_restore.mjs de ponta a ponta: gera um dump
 * sintético no MESMO formato exato produzido por server/databaseBackup.ts
 * (`-- Table: X`, `-- Data for table: X`, INSERT em lotes com colunas
 * nomeadas), roda o script real como um processo filho (igual à forma como
 * é usado de verdade) e inspeciona o SQL sanitizado e o relatório.
 *
 * Cobre especificamente a correção pedida pelo Manus: __drizzle_migrations
 * é propriedade do banco de DESTINO (journal de migrations já aplicadas) —
 * restaurar a estrutura/dados dela por cima do destino invalidaria o
 * controle de schema que o destino já mantém sozinho. Por isso a tabela
 * inteira (DROP/CREATE/dados) precisa sair do SQL sanitizado, não só os
 * dados — diferente de system_settings/webhook_logs, cuja estrutura fica.
 */

const scriptPath = path.resolve(__dirname, "..", "scripts", "prepare_backup_restore.mjs");

function sqlTable(
  name: string,
  createSql: string,
  columns: string[],
  rows: Array<Record<string, string | number | null>>
): string {
  const lines: string[] = [`-- Table: ${name}`, `DROP TABLE IF EXISTS \`${name}\`;`, `${createSql};`, ""];
  if (rows.length > 0) {
    const columnNames = columns.map(col => `\`${col}\``).join(", ");
    lines.push(`-- Data for table: ${name}`);
    const values = rows.map(row => {
      const rowValues = columns.map(col => {
        const value = row[col];
        if (value === null || value === undefined) return "NULL";
        if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
        return String(value);
      });
      return `(${rowValues.join(", ")})`;
    });
    lines.push(`INSERT INTO \`${name}\` (${columnNames}) VALUES`);
    lines.push(`${values.join(",\n")};`);
    lines.push("");
  }
  return lines.join("\n");
}

function buildFixtureDump(): string {
  const parts: string[] = [
    "-- Exclusive Club - Database Backup",
    "-- Generated: 2026-08-01T00:00:00.000Z",
    "-- Database: exclusive_club",
    "",
    "SET NAMES utf8mb4;",
    "SET FOREIGN_KEY_CHECKS = 0;",
    "",
  ];

  const requiredMinimal: Array<[string, string, string[], Array<Record<string, string | number | null>>]> = [
    [
      "allowed_clients",
      "CREATE TABLE `allowed_clients` (`id` int NOT NULL AUTO_INCREMENT, `email` varchar(320) NOT NULL, PRIMARY KEY (`id`))",
      ["id", "email"],
      [{ id: 1, email: "cliente1@example.com" }],
    ],
    [
      "asaas_customers",
      "CREATE TABLE `asaas_customers` (`id` int NOT NULL AUTO_INCREMENT, `clientEmail` varchar(320) NOT NULL, PRIMARY KEY (`id`))",
      ["id", "clientEmail"],
      [{ id: 1, clientEmail: "cliente1@example.com" }],
    ],
    [
      "bpo_charges",
      "CREATE TABLE `bpo_charges` (`id` int NOT NULL AUTO_INCREMENT, `value` decimal(10,2) NOT NULL, PRIMARY KEY (`id`))",
      ["id", "value"],
      [{ id: 1, value: 100.5 }],
    ],
    [
      "expense_records",
      "CREATE TABLE `expense_records` (`id` int NOT NULL AUTO_INCREMENT, `description` text NOT NULL, PRIMARY KEY (`id`))",
      ["id", "description"],
      [{ id: 1, description: "Despesa de teste" }],
    ],
    [
      "backup_attachments",
      "CREATE TABLE `backup_attachments` (`id` int NOT NULL AUTO_INCREMENT, `fileName` varchar(255) NOT NULL, PRIMARY KEY (`id`))",
      ["id", "fileName"],
      [],
    ],
    [
      "backup_history",
      "CREATE TABLE `backup_history` (`id` int NOT NULL AUTO_INCREMENT, `status` varchar(20) NOT NULL, PRIMARY KEY (`id`))",
      ["id", "status"],
      [{ id: 1, status: "success" }],
    ],
    [
      "users",
      "CREATE TABLE `users` (`id` int NOT NULL AUTO_INCREMENT, `openId` varchar(64) NOT NULL, `role` varchar(20) NOT NULL, `password_hash` varchar(255), PRIMARY KEY (`id`))",
      ["id", "openId", "role", "password_hash"],
      [
        { id: 1, openId: "open-1", role: "admin", password_hash: "$2b$10$reallookinghash" },
        { id: 2, openId: "open-2", role: "user", password_hash: null },
      ],
    ],
    [
      "system_settings",
      "CREATE TABLE `system_settings` (`id` int NOT NULL AUTO_INCREMENT, `key` varchar(100) NOT NULL, `value` text NOT NULL, PRIMARY KEY (`id`))",
      ["id", "key", "value"],
      [{ id: 1, key: "asaas_api_key", value: "REAL_SECRET_VALUE" }],
    ],
    [
      "webhook_logs",
      "CREATE TABLE `webhook_logs` (`id` int NOT NULL AUTO_INCREMENT, `payload` text, PRIMARY KEY (`id`))",
      ["id", "payload"],
      [{ id: 1, payload: '{"real":"payload"}' }],
    ],
  ];

  for (const [name, createSql, columns, rows] of requiredMinimal) {
    parts.push(sqlTable(name, createSql, columns, rows));
  }

  // Journal de migrations do Drizzle — propriedade do DESTINO, não do backup
  // de origem. Colocado antes do rodapé (não por último) para provar que a
  // remoção não vaza para o marcador seguinte.
  parts.push(
    sqlTable(
      "__drizzle_migrations",
      "CREATE TABLE `__drizzle_migrations` (`id` int NOT NULL AUTO_INCREMENT, `hash` text NOT NULL, `created_at` bigint, PRIMARY KEY (`id`))",
      ["id", "hash", "created_at"],
      [
        { id: 1, hash: "abc123", created_at: 1690000000000 },
        { id: 2, hash: "def456", created_at: 1690000100000 },
      ]
    )
  );

  parts.push("SET FOREIGN_KEY_CHECKS = 1;", "", "-- Backup completed successfully");
  return parts.join("\n");
}

describe("scripts/prepare_backup_restore.mjs — sanitização", () => {
  function runScript() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-sanitization-"));
    const inputPath = path.join(dir, "database.sql");
    const outputPath = path.join(dir, "restore.sql");
    const reportPath = path.join(dir, "restore-report.json");

    fs.writeFileSync(inputPath, buildFixtureDump(), "utf8");
    execFileSync(
      "node",
      [scriptPath, "--input", inputPath, "--output", outputPath, "--report", reportPath],
      { encoding: "utf8" }
    );

    const sanitizedSql = fs.readFileSync(outputPath, "utf8");
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    return { sanitizedSql, report };
  }

  it("remove __drizzle_migrations por inteiro (DDL e DML) do SQL sanitizado", () => {
    const { sanitizedSql } = runScript();

    expect(sanitizedSql).not.toContain("__drizzle_migrations");
    expect(sanitizedSql).not.toMatch(/drizzle/i);
  });

  it("registra a remoção de __drizzle_migrations como evidência estrutural no relatório", () => {
    const { report } = runScript();

    const entry = report.excludedTables?.find((item: { table: string }) => item.table === "__drizzle_migrations");
    expect(entry).toBeDefined();
    expect(entry.removed).toBe(true);
    expect(typeof entry.reason).toBe("string");
    expect(entry.reason.length).toBeGreaterThan(0);
  });

  it("não vaza a remoção para tabelas vizinhas (webhook_logs continua com estrutura própria)", () => {
    const { sanitizedSql } = runScript();

    expect(sanitizedSql).toContain("-- Table: webhook_logs");
    expect(sanitizedSql).toContain("DROP TABLE IF EXISTS `webhook_logs`;");
  });

  it("continua removendo dados de system_settings/webhook_logs e redigindo users.password_hash", () => {
    const { sanitizedSql, report } = runScript();

    expect(sanitizedSql).not.toContain("REAL_SECRET_VALUE");
    expect(sanitizedSql).not.toContain('{"real":"payload"}');
    expect(sanitizedSql).not.toContain("$2b$10$reallookinghash");

    const settings = report.sanitizedTables.find((item: { table: string }) => item.table === "system_settings");
    const webhooks = report.sanitizedTables.find((item: { table: string }) => item.table === "webhook_logs");
    expect(settings.dataRemoved).toBe(true);
    expect(webhooks.dataRemoved).toBe(true);

    const passwordHash = report.redactedColumns.find(
      (item: { table: string; column: string }) => item.table === "users" && item.column === "password_hash"
    );
    expect(passwordHash.rowsRedacted).toBe(1);
  });

  it("nunca inclui hash/valor/credencial reais no relatório — só metadados estruturais", () => {
    const { report } = runScript();
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain("REAL_SECRET_VALUE");
    expect(serialized).not.toContain("$2b$10$reallookinghash");
    expect(serialized).not.toContain("abc123");
    expect(serialized).not.toContain("def456");
  });
});
