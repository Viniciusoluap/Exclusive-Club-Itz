#!/usr/bin/env node
/**
 * Prepara uma cópia de restauração do dump financeiro mais recente.
 *
 * Este script NÃO conecta a banco e NÃO importa nada. Ele valida a estrutura,
 * remove a view legada `financial_charges`, remove qualquer cláusula DEFINER
 * remanescente (defesa em profundidade — dumps novos já saem sem DEFINER, ver
 * server/databaseBackup.ts `semDefiner()`, mas o backup de agosto usado aqui é
 * anterior a essa garantia e pode não ter passado por ela), remove por
 * completo a tabela `__drizzle_migrations` (journal de migrations é
 * propriedade do DESTINO — restaurar o journal do backup sobrescreveria o
 * controle de schema já aplicado no staging/produção), e SANITIZA dados
 * sensíveis antes de a cópia ficar disponível para importação num ambiente de
 * staging: remove por completo as linhas de `system_settings` (pode conter a
 * chave Asaas em uso e outras credenciais salvas via getSetting/setSetting) e
 * de `webhook_logs` (payload bruto de webhooks Asaas, com dado financeiro de
 * cliente), e substitui por NULL o valor de `users.password_hash` linha a
 * linha (campo legado — o login é via OAuth — mas se estiver preenchido é um
 * hash real e não deve ser replicado para um ambiente de staging). A
 * estrutura das tabelas de negócio (DROP/CREATE) é preservada; só as LINHAS
 * sensíveis saem. `__drizzle_migrations` é diferente: sai por inteiro
 * (estrutura + dados), porque não é dado de negócio.
 *
 * Preserva os nomes físicos de colunas do baseline Drizzle atual. O baseline
 * da main usa camelCase em `users`, portanto a cópia de restauração não deve
 * renomear essas colunas.
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

/** Tabelas cujas LINHAS de dado nunca devem ir para um ambiente de staging. */
const SENSITIVE_TABLES_TO_STRIP = [
  {
    table: "system_settings",
    reason:
      "pode conter a chave Asaas em uso e outras credenciais salvas via getSetting/setSetting",
  },
  {
    table: "webhook_logs",
    reason: "payload bruto de webhooks Asaas, com dado financeiro de cliente",
  },
];

/** Tabela/coluna cujo VALOR (não a linha inteira) deve ser substituído por NULL. */
const SENSITIVE_COLUMNS_TO_REDACT = [{ table: "users", column: "password_hash" }];

/**
 * Tabelas cuja seção INTEIRA (DROP TABLE + CREATE TABLE + dados) deve ser
 * excluída do SQL sanitizado — não são dado de negócio do backup, são
 * propriedade do destino (o banco que vai receber a restauração).
 */
const TABLES_TO_EXCLUDE_ENTIRELY = [
  {
    table: "__drizzle_migrations",
    reason:
      "journal de migrations é propriedade do destino; o backup histórico não pode recriá-lo nem preenchê-lo, pois isso invalidaria a evolução de schema já aplicada no staging/produção",
  },
];

/**
 * Localiza o fim da seção de uma tabela/view no dump: o próximo marcador
 * `-- Table:`/`-- View:`, ou o rodapé `SET FOREIGN_KEY_CHECKS = 1;`.
 */
function findSectionEnd(source, fromIndex) {
  const candidates = [
    source.indexOf("\n-- Table: ", fromIndex),
    source.indexOf("\n-- View: ", fromIndex),
    source.indexOf("\nSET FOREIGN_KEY_CHECKS = 1;", fromIndex),
  ].filter(index => index >= 0);
  return candidates.length > 0 ? Math.min(...candidates) : source.length;
}

/**
 * Remove a seção inteira que começa em `marker` (linha completa), até o
 * próximo marcador de tabela/view ou o rodapé — usado tanto para views
 * legadas quanto para tabelas que devem sair por completo.
 */
function removeSection(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) {
    return { source, removed: false };
  }
  const end = findSectionEnd(source, start);
  return { source: source.slice(0, start) + source.slice(end), removed: true };
}

/**
 * Remove a seção de uma view específica (DROP VIEW + CREATE VIEW), com
 * escopo preciso — só até o próximo marcador de tabela/view ou o rodapé.
 *
 * CORREÇÃO: a versão anterior usava `source.lastIndexOf("SET FOREIGN_KEY_CHECKS
 * = 1;")` como fim do corte, apagando tudo entre a view legada e o rodapé —
 * o que apagaria SILENCIOSAMENTE qualquer outra view legítima que viesse
 * depois de `financial_charges` no dump, sem erro nem aviso. Com
 * `findSectionEnd`, o corte é limitado à própria seção da view removida.
 */
function removeView(source, viewName) {
  return removeSection(source, `-- View: ${viewName}`);
}

/**
 * Remove a seção INTEIRA de uma tabela (DROP TABLE + CREATE TABLE + dados),
 * sem deixar nem a estrutura. Usado para tabelas que são propriedade do
 * DESTINO (ex.: journal de migrations do Drizzle), nunca do backup de
 * origem — restaurar a estrutura/dado delas por cima do destino corrompe o
 * estado que o destino já mantém sozinho.
 */
function removeTableEntirely(source, tableName) {
  return removeSection(source, `-- Table: ${tableName}`);
}

/**
 * Remove as linhas de INSERT de uma tabela (mantém DROP/CREATE — só os DADOS
 * saem). Idempotente: se a tabela não tiver dados no dump (0 linhas), é um
 * no-op.
 */
function stripTableData(source, tableName, reason) {
  const marker = `-- Data for table: ${tableName}`;
  const dataStart = source.indexOf(marker);
  if (dataStart < 0) {
    return { source, removed: false };
  }
  const dataEnd = findSectionEnd(source, dataStart);
  const replacement = `-- Data for table: ${tableName} REMOVIDA na sanitização (${reason})\n`;
  return {
    source: source.slice(0, dataStart) + replacement + source.slice(dataEnd),
    removed: true,
  };
}

/**
 * Percorre o texto de uma tupla `(v1, v2, ...)` de um INSERT e devolve os
 * valores individuais (com aspas incluídas para strings), respeitando aspas
 * simples e escaping `''`. Não há parênteses aninhados em valores escalares,
 * então isto é suficiente.
 */
function parseRowValues(tuple) {
  const inner = tuple.slice(1, -1); // remove ( e )
  const values = [];
  let i = 0;
  while (i < inner.length) {
    while (inner[i] === " ") i++;
    if (inner[i] === "'") {
      let j = i + 1;
      while (j < inner.length) {
        if (inner[j] === "'" && inner[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (inner[j] === "'") {
          j += 1;
          break;
        }
        j += 1;
      }
      values.push(inner.slice(i, j));
      i = j;
    } else {
      let j = i;
      while (j < inner.length && inner[j] !== ",") j++;
      values.push(inner.slice(i, j).trim());
      i = j;
    }
    while (inner[i] === " ") i++;
    if (inner[i] === ",") i++;
  }
  return values;
}

/**
 * A partir do índice logo após `VALUES\n` de um INSERT, extrai cada tupla
 * `(...)`, respeitando aspas simples (parênteses/vírgulas dentro de texto
 * entre aspas não terminam a tupla). Devolve as tuplas e o índice logo após
 * o `;` que fecha a instrução.
 */
function parseValuesStatement(source, startIndex) {
  let i = startIndex;
  const tuples = [];
  while (i < source.length) {
    while (/\s/.test(source[i])) i++;
    if (source[i] !== "(") break;
    const tupleStart = i;
    let depth = 0;
    let inString = false;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (inString) {
        if (ch === "'") {
          if (source[i + 1] === "'") {
            i++;
            continue;
          }
          inString = false;
        }
        continue;
      }
      if (ch === "'") {
        inString = true;
        continue;
      }
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    tuples.push(source.slice(tupleStart, i));
    while (/\s/.test(source[i])) i++;
    if (source[i] === ",") {
      i++;
      continue;
    }
    if (source[i] === ";") {
      i++;
      break;
    }
    break;
  }
  return { tuples, endIndex: i };
}

/**
 * Substitui por NULL o valor de uma coluna específica, linha a linha, em
 * TODOS os INSERTs de uma tabela (o export faz lotes de 100 linhas — pode
 * haver vários INSERTs seguidos para a mesma tabela).
 */
function redactColumn(source, tableName, columnName, replacement = "NULL") {
  const headerRegex = new RegExp(`INSERT INTO \`${tableName}\` \\(([^)]*)\\) VALUES\\s*\\n`, "g");
  let result = "";
  let lastIndex = 0;
  let redactedCount = 0;
  let match;
  while ((match = headerRegex.exec(source)) !== null) {
    const headerEnd = match.index + match[0].length;
    const columns = match[1].split(",").map(name => name.trim().replace(/^`|`$/g, ""));
    const columnIndex = columns.indexOf(columnName);
    const { tuples, endIndex } = parseValuesStatement(source, headerEnd);

    let rebuilt;
    if (columnIndex === -1) {
      rebuilt = source.slice(match.index, endIndex);
    } else {
      const newTuples = tuples.map(tuple => {
        const values = parseRowValues(tuple);
        if (values[columnIndex] !== "NULL") {
          values[columnIndex] = replacement;
          redactedCount++;
        }
        return `(${values.join(", ")})`;
      });
      rebuilt = `${match[0]}${newTuples.join(",\n")};`;
    }

    result += source.slice(lastIndex, match.index) + rebuilt;
    lastIndex = endIndex;
    headerRegex.lastIndex = endIndex;
  }
  result += source.slice(lastIndex);
  return { source: result, redactedCount };
}

/**
 * Remove `DEFINER=usuario@host` de qualquer CREATE VIEW/PROCEDURE/TRIGGER/
 * FUNCTION remanescente no dump. Defesa em profundidade: dumps gerados pela
 * versão atual de server/databaseBackup.ts já saem sem DEFINER (função
 * semDefiner() lá), mas o backup de agosto usado aqui é anterior a essa
 * garantia e pode não ter passado por ela.
 */
function stripDefiners(source) {
  const definerPattern = /\sDEFINER\s*=\s*(`[^`]*`|'[^']*'|\S+)@(`[^`]*`|'[^']*'|\S+)/gi;
  const matches = source.match(definerPattern);
  return {
    source: source.replace(definerPattern, ""),
    removedCount: matches ? matches.length : 0,
  };
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
  [...source.matchAll(/^-- Table: `?([^`\n]+?)`?\s*$/gm)].map(match => match[1].trim())
);
const missingRequired = requiredTables.filter(table => !tableNames.has(table));
if (missingRequired.length > 0) {
  throw new Error(`Dump incompatível: tabelas obrigatórias ausentes: ${missingRequired.join(", ")}`);
}
if (!source.includes("-- Backup completed successfully")) {
  throw new Error("Dump sem marcador de conclusão; cópia possivelmente truncada.");
}
if (
  !source.includes("SET FOREIGN_KEY_CHECKS = 0;") ||
  !source.includes("SET FOREIGN_KEY_CHECKS = 1;")
) {
  throw new Error("Dump sem marcadores completos de FOREIGN_KEY_CHECKS.");
}

let sanitized = source;
const legacyViewResult = removeView(sanitized, "financial_charges");
sanitized = legacyViewResult.source;
const removedLegacyView = legacyViewResult.removed;

// Tabelas que são propriedade do DESTINO, não do backup de origem: saem por
// inteiro (estrutura + dados), nunca só os dados. O journal de migrations do
// Drizzle é o caso — ver TABLES_TO_EXCLUDE_ENTIRELY acima.
const excludedTables = [];
for (const { table, reason } of TABLES_TO_EXCLUDE_ENTIRELY) {
  const result = removeTableEntirely(sanitized, table);
  sanitized = result.source;
  excludedTables.push({ table, removed: result.removed, reason });
}

// Sanitização de segurança: remove linhas sensíveis antes de a cópia ficar
// disponível para importação em staging. Estrutura das tabelas é preservada.
const sanitizedTables = [];
for (const { table, reason } of SENSITIVE_TABLES_TO_STRIP) {
  const result = stripTableData(sanitized, table, reason);
  sanitized = result.source;
  sanitizedTables.push({ table, dataRemoved: result.removed, reason });
}

const redactedColumns = [];
for (const { table, column } of SENSITIVE_COLUMNS_TO_REDACT) {
  const result = redactColumn(sanitized, table, column);
  sanitized = result.source;
  redactedColumns.push({ table, column, rowsRedacted: result.redactedCount });
}

const definerResult = stripDefiners(sanitized);
sanitized = definerResult.source;

// O baseline Drizzle atual preserva estes nomes físicos camelCase em `users`.
// Não há normalização de colunas: a cópia deve permanecer compatível com
// drizzle/0000_initial_baseline.sql e com drizzle/schema.ts.
const normalizedUserColumns = [];

const header = [
  "-- Exclusive Club — restauração preparada automaticamente",
  `-- Fonte: ${path.basename(input)}`,
  "-- ATENÇÃO: importar SOMENTE em uma base NOVA/VAZIA; nunca em produção existente.",
  "-- Após o import, executar o autoMigrate atual e depois o dry-run Asaas.",
  "-- Os nomes físicos do snapshot foram preservados para compatibilidade com o baseline atual.",
  "-- Dados de system_settings e webhook_logs foram removidos, users.password_hash",
  "-- foi substituído por NULL, e o journal de migrations do destino foi",
  "-- preservado (tabelas exclusivas do destino saíram por inteiro) —",
  "-- ver restore-report.json para a lista completa e os detalhes.",
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
  excludedTables,
  sanitizedTables,
  redactedColumns,
  definerClausesRemoved: definerResult.removedCount,
  hasOpenFinanceTables: [...tableNames].some(table => table.startsWith("open_finance_")),
  tableCountExpectedAfterMigrations: tableNames.size + 5,
  mode: "prepare-only",
  databaseImportPerformed: false,
};
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
console.log("Nenhuma conexão ou importação de banco foi realizada.");
