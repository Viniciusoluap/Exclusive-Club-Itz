/**
 * Recuperação seletiva de um backup antigo (ex.: agosto/2026) por cima do
 * banco de produção ATUAL — sem jamais sobrescrever ou apagar nada.
 *
 * POR QUE ISTO EXISTE E NÃO USA `restoreBackup` (backupRouter.ts): aquela
 * rota importa o SQL bruto do backup via `mysql ... < arquivo.sql`, e o
 * arquivo tem `DROP TABLE` para as 30 tabelas — ela troca o banco inteiro
 * pelo estado congelado do backup, perdendo tudo que existe hoje (inclusive
 * as tabelas `open_finance_*`, que não existiam quando o backup foi feito).
 * Isso é aceitável só para restaurar sobre uma base vazia, nunca sobre
 * produção ativa.
 *
 * Este módulo faz o oposto: MESCLA. Lê o backup antigo linha a linha e, para
 * cada tabela com uma chave natural confiável (email, openId, id do Asaas),
 * insere apenas as linhas que ainda não existem hoje — nunca atualiza, nunca
 * apaga. Em caso de dúvida (linha já existe com valores diferentes), a
 * produção sempre vence: a linha do backup é ignorada, não sobrescreve nada.
 *
 * Tabelas sem nenhuma chave natural confiável (ex.: `expense_records`, que
 * não tem nenhuma constraint UNIQUE além do id autoincrement) NUNCA são
 * inseridas automaticamente — mostrar quantas linhas existem no backup é
 * puramente informativo. Decisão do dono do produto: o risco de duplicar
 * despesas financeiras por engano é maior que o valor de automatizar essa
 * tabela.
 */
import { and, eq, inArray, sql, type AnyColumn, type Table } from 'drizzle-orm';
import {
  allowedClients,
  users,
  employees,
  asaasCustomers,
  bpoCharges,
  backupAttachments,
  bookings,
  clientQuotas,
  dueDateChangeRequests,
  expenseRecords,
  fuelBudget,
  fuelPurchases,
  fuelRecords,
  fuelRecordContainers,
  gallonStock,
  inspectionCharges,
  inspections,
  maintenances,
  reviews,
  vessels,
} from '../drizzle/schema';

// ─────────────────────────────────────────── parsing do dump (SQL do backup)

/**
 * Extrai os valores de uma tupla `(v1, v2, ...)` de um INSERT, respeitando
 * aspas simples e `''` escapado. Porta idêntica de
 * `scripts/prepare_backup_restore.mjs` (`parseRowValues`) — mesma lógica já
 * usada em produção para sanitizar backups, não uma reimplementação nova.
 */
function parseRowValues(tuple: string): string[] {
  const inner = tuple.slice(1, -1);
  const values: string[] = [];
  let i = 0;
  while (i < inner.length) {
    while (inner[i] === ' ') i++;
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
      while (j < inner.length && inner[j] !== ',') j++;
      values.push(inner.slice(i, j).trim());
      i = j;
    }
    while (inner[i] === ' ') i++;
    if (inner[i] === ',') i++;
  }
  return values;
}

/**
 * A partir do índice logo após `VALUES\n`, extrai cada tupla `(...)` de um
 * INSERT, respeitando aspas simples. Porta idêntica de
 * `scripts/prepare_backup_restore.mjs` (`parseValuesStatement`).
 */
function parseValuesStatement(source: string, startIndex: number): { tuples: string[]; endIndex: number } {
  let i = startIndex;
  const tuples: string[] = [];
  while (i < source.length) {
    while (/\s/.test(source[i])) i++;
    if (source[i] !== '(') break;
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
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    tuples.push(source.slice(tupleStart, i));
    while (/\s/.test(source[i])) i++;
    if (source[i] === ',') {
      i++;
      continue;
    }
    if (source[i] === ';') {
      i++;
      break;
    }
    break;
  }
  return { tuples, endIndex: i };
}

/**
 * Descreve um erro incluindo toda a cadeia de `cause`.
 *
 * POR QUE ISTO EXISTE: o driver mysql2/drizzle relata falha de INSERT como
 * `error.message = "Failed query: INSERT INTO ... params: [...]"` — é só o
 * comando que foi tentado, não o motivo pelo qual o banco recusou. O motivo
 * real (ex.: `ER_DUP_ENTRY: Duplicate entry 'x@mail.com' for key
 * 'users_email_uq'`) vem em `error.cause`, que ficava descartado: a tela
 * mostrava o SQL inteiro e nunca por que ele falhou (relatado em produção,
 * 05/09/2026 — `users`, `bpo_charges` e `fuel_purchases` "falharam" sem
 * nenhuma pista visível do motivo).
 */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const err = current as { message?: unknown; cause?: unknown };
    parts.push(typeof err.message === 'string' ? err.message : String(current));
    current = err.cause;
  }
  return parts.length > 0 ? parts.join(' | causa: ') : String(error);
}

/** Converte um literal SQL (já extraído por `parseRowValues`) para JS, só para comparação — nunca para reinserção. */
function sqlLiteralToJsForComparison(raw: string | undefined): string | null {
  if (raw === undefined || raw === 'NULL') return null;
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  return raw;
}

/**
 * Localiza todos os `INSERT INTO \`tabela\` (cols) VALUES (...), (...);` do
 * dump (o export faz lotes de 100 linhas — pode haver vários INSERTs para a
 * mesma tabela) e devolve as colunas e as tuplas BRUTAS (texto original, tal
 * como aparecem no arquivo).
 *
 * Devolver o texto original, e não uma reconstrução a partir de valores
 * JS, é proposital: reinserir exatamente os mesmos bytes que o dump trouxe
 * evita qualquer erro de conversão de tipo (datas, decimais, JSON em texto).
 */
function extractTableInserts(source: string, tableName: string): { columns: string[]; rows: string[][] } | null {
  const headerRegex = new RegExp(`INSERT INTO \`${tableName}\` \\(([^)]*)\\) VALUES\\s*\\n`, 'g');
  let columns: string[] | null = null;
  const rows: string[][] = [];
  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(source)) !== null) {
    const headerEnd = match.index + match[0].length;
    if (!columns) {
      columns = match[1].split(',').map(name => name.trim().replace(/^`|`$/g, ''));
    }
    const { tuples, endIndex } = parseValuesStatement(source, headerEnd);
    for (const tuple of tuples) rows.push(parseRowValues(tuple));
    headerRegex.lastIndex = endIndex;
  }
  if (!columns) return null;
  return { columns, rows };
}

/**
 * Validações mínimas de que o arquivo é mesmo um dump gerado por
 * `server/databaseBackup.ts` — as mesmas checagens estruturais de
 * `scripts/prepare_backup_restore.mjs`, para não processar um arquivo
 * qualquer como se fosse um backup válido.
 */
export function assertValidBackupDump(dump: string): void {
  if (!dump.includes('-- Backup completed successfully')) {
    throw new Error('Arquivo sem marcador de conclusão do backup; a cópia pode estar truncada ou não é um backup do sistema.');
  }
  if (!dump.includes('SET FOREIGN_KEY_CHECKS = 0;') || !dump.includes('SET FOREIGN_KEY_CHECKS = 1;')) {
    throw new Error('Arquivo sem os marcadores de início/fim esperados de um backup do sistema.');
  }
}

// ───────────────────────────────────────────── tabelas elegíveis para mesclagem

type MergeableTableBase = {
  /** Nome físico da tabela, como aparece no dump e no banco. */
  sqlTableName: string;
  /** Rótulo amigável para a tela. */
  label: string;
  /** Tabela Drizzle correspondente (para contar linhas atuais e inserir). */
  drizzleTable: Table;
};

type TableWithNaturalKey = MergeableTableBase & {
  hasNaturalKey: true;
  /** Nome físico da coluna-chave, como aparece no dump. */
  keySqlName: string;
  /** Coluna Drizzle correspondente, para consultar o que já existe. */
  keyColumn: AnyColumn;
  /**
   * Coluna `id` (PK autoincrement). Usada só para checar colisão de id antes
   * de inserir — ver `resolveIdCollisions` — nunca para decidir se a linha
   * já existe (isso é sempre pela `keyColumn`).
   */
  idColumn: AnyColumn;
};

type TableWithoutNaturalKey = MergeableTableBase & {
  hasNaturalKey: false;
  /** Coluna `id` (PK autoincrement) — usada só pela recuperação forçada (por ID), nunca pelo dry-run/apply normal. */
  idColumn: AnyColumn;
};

type MergeableTable = TableWithNaturalKey | TableWithoutNaturalKey;

/**
 * Tabelas COM chave natural confiável: seguro inserir automaticamente as
 * linhas do backup que ainda não existem hoje (comparando por essa chave).
 */
const TABLES_WITH_NATURAL_KEY: TableWithNaturalKey[] = [
  {
    sqlTableName: 'allowed_clients',
    label: 'Clientes autorizados',
    drizzleTable: allowedClients,
    hasNaturalKey: true,
    keySqlName: 'email',
    keyColumn: allowedClients.email,
    idColumn: allowedClients.id,
  },
  {
    // Nomes físicos camelCase preservados de propósito — ver AVALIACAO-BACKUP-AGOSTO.md.
    sqlTableName: 'users',
    label: 'Usuários',
    drizzleTable: users,
    hasNaturalKey: true,
    keySqlName: 'openId',
    keyColumn: users.openId,
    idColumn: users.id,
  },
  {
    sqlTableName: 'employees',
    label: 'Funcionários',
    drizzleTable: employees,
    hasNaturalKey: true,
    keySqlName: 'email',
    keyColumn: employees.email,
    idColumn: employees.id,
  },
  {
    sqlTableName: 'asaas_customers',
    label: 'Clientes Asaas',
    drizzleTable: asaasCustomers,
    hasNaturalKey: true,
    keySqlName: 'asaas_customer_id',
    keyColumn: asaasCustomers.asaasCustomerId,
    idColumn: asaasCustomers.id,
  },
  {
    sqlTableName: 'bpo_charges',
    label: 'Cobranças (BPO)',
    drizzleTable: bpoCharges,
    hasNaturalKey: true,
    keySqlName: 'asaas_charge_id',
    keyColumn: bpoCharges.asaasChargeId,
    idColumn: bpoCharges.id,
  },
  {
    sqlTableName: 'backup_attachments',
    label: 'Índice de anexos arquivados',
    drizzleTable: backupAttachments,
    hasNaturalKey: true,
    keySqlName: 'source_url',
    keyColumn: backupAttachments.sourceUrl,
    idColumn: backupAttachments.id,
  },
];

/**
 * Tabelas SEM nenhuma chave natural confiável: o dry-run só informa quantas
 * linhas existem no backup e quantas hoje em produção — o "Aplicar" nunca
 * insere nelas. Decisão confirmada (31/08/2026): risco de duplicar dado
 * financeiro/operacional é maior que o valor de automatizar.
 */
const TABLES_WITHOUT_NATURAL_KEY: TableWithoutNaturalKey[] = [
  // Embarcações e reservas primeiro: são referenciadas (por convenção de
  // aplicação, sem FK real no banco) por quase todas as outras — inserir
  // nessa ordem deixa o dado consistente mais cedo, embora não seja
  // estritamente exigido pelo schema (só `fuel_purchases.purchased_by` tem
  // uma FK de verdade, para `users`, já restaurado antes deste grupo).
  { sqlTableName: 'vessels', label: 'Embarcações', drizzleTable: vessels, hasNaturalKey: false, idColumn: vessels.id },
  { sqlTableName: 'bookings', label: 'Reservas', drizzleTable: bookings, hasNaturalKey: false, idColumn: bookings.id },
  { sqlTableName: 'client_quotas', label: 'Cotas de clientes', drizzleTable: clientQuotas, hasNaturalKey: false, idColumn: clientQuotas.id },
  { sqlTableName: 'inspections', label: 'Vistorias', drizzleTable: inspections, hasNaturalKey: false, idColumn: inspections.id },
  { sqlTableName: 'inspection_charges', label: 'Cobranças de vistoria', drizzleTable: inspectionCharges, hasNaturalKey: false, idColumn: inspectionCharges.id },
  { sqlTableName: 'maintenances', label: 'Manutenções', drizzleTable: maintenances, hasNaturalKey: false, idColumn: maintenances.id },
  { sqlTableName: 'reviews', label: 'Avaliações', drizzleTable: reviews, hasNaturalKey: false, idColumn: reviews.id },
  { sqlTableName: 'fuel_records', label: 'Abastecimentos', drizzleTable: fuelRecords, hasNaturalKey: false, idColumn: fuelRecords.id },
  { sqlTableName: 'fuel_record_containers', label: 'Galões de abastecimento', drizzleTable: fuelRecordContainers, hasNaturalKey: false, idColumn: fuelRecordContainers.id },
  { sqlTableName: 'fuel_purchases', label: 'Compras de combustível', drizzleTable: fuelPurchases, hasNaturalKey: false, idColumn: fuelPurchases.id },
  { sqlTableName: 'fuel_budget', label: 'Orçamento de combustível', drizzleTable: fuelBudget, hasNaturalKey: false, idColumn: fuelBudget.id },
  { sqlTableName: 'gallon_stock', label: 'Estoque de galões', drizzleTable: gallonStock, hasNaturalKey: false, idColumn: gallonStock.id },
  { sqlTableName: 'due_date_change_requests', label: 'Solicitações de alteração de vencimento', drizzleTable: dueDateChangeRequests, hasNaturalKey: false, idColumn: dueDateChangeRequests.id },
  { sqlTableName: 'expense_records', label: 'Despesas', drizzleTable: expenseRecords, hasNaturalKey: false, idColumn: expenseRecords.id },
];

const ALL_MERGEABLE_TABLES = [...TABLES_WITH_NATURAL_KEY, ...TABLES_WITHOUT_NATURAL_KEY];

/**
 * Nunca processadas, mesmo que presentes no arquivo — por design, não por
 * omissão. Documentado para quem ler o relatório de tabelas ignoradas.
 */
const NEVER_PROCESSED_TABLES = new Set([
  'system_settings', // pode conter credenciais (ex.: chave Asaas em uso)
  'webhook_logs', // payload bruto de webhook com dado financeiro; alto volume, baixo valor de restaurar
  'backup_history', // histórico de backups é do ambiente atual, não do backup
  '__drizzle_migrations', // journal de migrations é propriedade do destino
  'financial_charges', // view legada, nem existe mais no schema atual
]);

// ───────────────────────────────────────────────────────── contagem em lote

function countKeyMatches(raw: string[] | undefined, keySqlName: string, columns: string[]): string | null {
  if (!raw) return null;
  const idx = columns.indexOf(keySqlName);
  if (idx < 0) return null;
  return sqlLiteralToJsForComparison(raw[idx]);
}

async function currentRowCount(db: any, table: Table): Promise<number> {
  const result = (await db.execute(sql`SELECT COUNT(*) AS total FROM ${table}`)) as any;
  const row = (Array.isArray(result[0]) ? result[0] : result)[0];
  return Number(row?.total ?? 0);
}

// ────────────────────────────────── adaptação do backup ao schema de HOJE
//
// O backup é uma fotografia do schema de agosto. Desde então colunas foram
// removidas e domínios de enum mudaram. Reinserir os literais originais sem
// conferir isso faz o INSERT INTEIRO falhar — foi o que aconteceu em produção
// (05/09/2026): `bpo_charges` morreu com "Unknown column 'ignored' in 'field
// list'" e `users` com "Data too long for column 'role'" (valor fora do enum
// atual). E como `fuel_purchases.purchased_by` tem FK para `users`, a falha de
// `users` derrubava junto a recuperação das compras de combustível.

type ColumnInfo = {
  type: string;
  /** Valores aceitos, quando a coluna é um enum. `null` para os demais tipos. */
  enumValues: string[] | null;
  nullable: boolean;
  defaultValue: string | null;
};

/** Mesmo formato de `ColumnInfo`, exportado para os testes montarem um schema sem banco. */
export type ColumnInfoForTests = ColumnInfo;

function parseEnumValues(type: string): string[] | null {
  const match = /^enum\((.*)\)$/i.exec(type.trim());
  if (!match) return null;
  return match[1]
    .split(',')
    .map(v => v.trim().replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'"));
}

/** Colunas que a tabela REALMENTE tem hoje, com tipo/enum/default. */
async function describeTable(db: any, sqlTableName: string): Promise<Map<string, ColumnInfo>> {
  const raw = (await db.execute(sql.raw(`SHOW COLUMNS FROM \`${sqlTableName}\``))) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  const schema = new Map<string, ColumnInfo>();
  for (const r of Array.isArray(rows) ? rows : []) {
    const name = String(r?.Field ?? r?.field ?? '');
    if (!name) continue;
    const type = String(r?.Type ?? r?.type ?? '');
    schema.set(name, {
      type,
      enumValues: parseEnumValues(type),
      nullable: String(r?.Null ?? r?.null ?? 'YES').toUpperCase() === 'YES',
      defaultValue: r?.Default == null ? null : String(r.Default),
    });
  }
  return schema;
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Ajusta colunas e valores do backup ao schema atual, preservando tudo que
 * ainda cabe:
 *   - coluna que não existe mais hoje → descartada (o dado dela não tem para
 *     onde ir; insistir derruba a tabela inteira);
 *   - valor de enum fora do domínio atual → trocado pelo DEFAULT da coluna
 *     (ou NULL, quando permitido). Nunca inventa um valor: usa o que o próprio
 *     banco declara como padrão.
 *
 * Todo ajuste é relatado, para nada ser alterado silenciosamente.
 */
export function adaptToCurrentSchema(
  columns: string[],
  rows: string[][],
  schema: Map<string, ColumnInfo>,
): { columns: string[]; rows: string[][]; adjustments: string[] } {
  const adjustments: string[] = [];

  const keepIdx: number[] = [];
  const dropped: string[] = [];
  columns.forEach((name, i) => {
    if (schema.has(name)) keepIdx.push(i);
    else dropped.push(name);
  });
  if (dropped.length > 0) {
    adjustments.push(`Coluna(s) que não existem mais no banco, ignoradas: ${dropped.join(', ')}`);
  }

  const newColumns = keepIdx.map(i => columns[i]);
  let newRows = keepIdx.length === columns.length ? rows : rows.map(row => keepIdx.map(i => row[i]));

  newColumns.forEach((name, ci) => {
    const info = schema.get(name);
    if (!info?.enumValues) return;
    const allowed = new Set(info.enumValues);
    const contagem = new Map<string, number>();

    newRows = newRows.map(row => {
      const valor = sqlLiteralToJsForComparison(row[ci]);
      if (valor === null || allowed.has(valor)) return row;

      const substituto =
        info.defaultValue !== null
          ? quoteSqlLiteral(info.defaultValue)
          : info.nullable
            ? 'NULL'
            : quoteSqlLiteral(info.enumValues![0]);

      const copia = row.slice();
      copia[ci] = substituto;
      const chave = `${name}: "${valor}" → ${substituto}`;
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
      return copia;
    });

    contagem.forEach((total, chave) => {
      adjustments.push(`Valor fora do domínio atual, ajustado — ${chave} (${total} linha(s))`);
    });
  });

  return { columns: newColumns, rows: newRows, adjustments };
}

// ─────────────────────── integridade: unicidade e chaves estrangeiras
//
// POR QUE ISTO EXISTE: a dedução por chave natural olha UMA coluna (email,
// openId, asaas_charge_id). Mas a tabela pode ter OUTRAS restrições UNIQUE, e
// basta uma delas para o INSERT inteiro morrer. Em produção (05/09/2026) foi
// exatamente isso: `users` era comparado por `openId`, mas o e-mail de uma
// linha do backup já pertencia a outra conta ativa — "Duplicate entry for key
// 'users.users_email_uq'" derrubava as 37 linhas de uma vez.
//
// Em vez de tratar mais um caso específico, a verificação passa a ser genérica:
// o banco é perguntado quais restrições ele realmente tem, e as linhas que
// violariam qualquer uma delas são puladas — produção sempre vence.

/** Índices UNIQUE da tabela, exceto a PK (que tem tratamento próprio: id novo em vez de descarte). */
async function describeUniqueIndexes(db: any, sqlTableName: string): Promise<Array<{ name: string; columns: string[] }>> {
  const raw = (await db.execute(sql.raw(`SHOW INDEX FROM \`${sqlTableName}\``))) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  const porNome = new Map<string, string[]>();

  for (const r of Array.isArray(rows) ? rows : []) {
    if (Number(r?.Non_unique ?? r?.non_unique ?? 1) !== 0) continue;
    const nome = String(r?.Key_name ?? r?.key_name ?? '');
    if (!nome || nome.toUpperCase() === 'PRIMARY') continue;
    const coluna = String(r?.Column_name ?? r?.column_name ?? '');
    if (!coluna) continue;
    porNome.set(nome, [...(porNome.get(nome) ?? []), coluna]);
  }

  return Array.from(porNome, ([name, columns]) => ({ name, columns }));
}

/** Chaves estrangeiras reais da tabela (o schema tem só uma: fuel_purchases.purchased_by → users.id). */
async function describeForeignKeys(
  db: any,
  sqlTableName: string,
): Promise<Array<{ column: string; refTable: string; refColumn: string }>> {
  const raw = (await db.execute(sql`
    SELECT COLUMN_NAME AS col, REFERENCED_TABLE_NAME AS refTable, REFERENCED_COLUMN_NAME AS refColumn
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${sqlTableName}
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `)) as any;
  const rows = Array.isArray(raw[0]) ? raw[0] : raw;
  return (Array.isArray(rows) ? rows : [])
    .map((r: any) => ({
      column: String(r?.col ?? ''),
      refTable: String(r?.refTable ?? ''),
      refColumn: String(r?.refColumn ?? ''),
    }))
    .filter(fk => fk.column && fk.refTable && fk.refColumn);
}

function chaveComposta(valores: Array<string | null>): string | null {
  // UNIQUE no MySQL não se aplica quando há NULL: várias linhas podem repetir.
  if (valores.some(v => v === null)) return null;
  return valores.map(v => `${v!.length}:${v}`).join('|');
}

/**
 * Remove as linhas que violariam alguma restrição UNIQUE — seja contra o que
 * já existe em produção, seja contra outra linha do próprio backup.
 *
 * Produção sempre vence: a linha do backup é descartada, nunca sobrescreve.
 */
async function removerColisoesDeUnicidade(
  db: any,
  sqlTableName: string,
  columns: string[],
  rows: string[][],
): Promise<{ rows: string[][]; adjustments: string[] }> {
  const indices = await describeUniqueIndexes(db, sqlTableName);
  const adjustments: string[] = [];
  let restantes = rows;

  for (const indice of indices) {
    const posicoes = indice.columns.map(c => columns.indexOf(c));
    if (posicoes.some(p => p < 0)) continue; // o backup não traz essa coluna

    const existentes = new Set<string>();
    const listaColunas = indice.columns.map(c => `\`${c}\``).join(', ');
    const raw = (await db.execute(sql.raw(`SELECT ${listaColunas} FROM \`${sqlTableName}\``))) as any;
    const atuais = Array.isArray(raw[0]) ? raw[0] : raw;
    for (const r of Array.isArray(atuais) ? atuais : []) {
      const chave = chaveComposta(indice.columns.map(c => (r?.[c] == null ? null : String(r[c]))));
      if (chave !== null) existentes.add(chave);
    }

    const vistasNoLote = new Set<string>();
    let descartadas = 0;

    restantes = restantes.filter(row => {
      const chave = chaveComposta(posicoes.map(p => sqlLiteralToJsForComparison(row[p])));
      if (chave === null) return true; // NULL não colide
      if (existentes.has(chave) || vistasNoLote.has(chave)) {
        descartadas++;
        return false;
      }
      vistasNoLote.add(chave);
      return true;
    });

    if (descartadas > 0) {
      adjustments.push(
        `${descartadas} linha(s) puladas por já existir registro com o mesmo ${indice.columns.join(' + ')} ` +
          `(restrição ${indice.name}) — o registro de produção foi mantido.`,
      );
    }
  }

  return { rows: restantes, adjustments };
}

/**
 * Anula referências que apontam para linhas inexistentes.
 *
 * POR QUE: `fuel_purchases.purchased_by` referencia `users.id`. Quando a
 * restauração de `users` falha (ou aquele usuário não voltou), o banco recusa
 * a compra inteira com "foreign key constraint fails" — e o histórico de
 * compras de combustível, que é o que fecha a conta do abastecimento, se perde
 * por causa da atribuição de quem comprou.
 *
 * A coluna é anulável, então a escolha é preservar a compra sem o comprador em
 * vez de descartar a compra. Sempre relatado — a informação perdida fica
 * visível, não sumida.
 */
async function anularReferenciasQuebradas(
  db: any,
  sqlTableName: string,
  columns: string[],
  rows: string[][],
  schema: Map<string, ColumnInfo>,
): Promise<{ rows: string[][]; adjustments: string[] }> {
  const fks = await describeForeignKeys(db, sqlTableName);
  const adjustments: string[] = [];
  let resultado = rows;

  for (const fk of fks) {
    const idx = columns.indexOf(fk.column);
    if (idx < 0) continue;

    const info = schema.get(fk.column);
    if (!info?.nullable) continue; // não dá para anular; deixa o banco decidir

    const valores = Array.from(
      new Set(
        resultado
          .map(row => sqlLiteralToJsForComparison(row[idx]))
          .filter((v): v is string => v !== null),
      ),
    );
    if (valores.length === 0) continue;

    const existentes = new Set<string>();
    const raw = (await db.execute(
      sql.raw(`SELECT \`${fk.refColumn}\` AS v FROM \`${fk.refTable}\``),
    )) as any;
    const atuais = Array.isArray(raw[0]) ? raw[0] : raw;
    for (const r of Array.isArray(atuais) ? atuais : []) {
      if (r?.v != null) existentes.add(String(r.v));
    }

    let anuladas = 0;
    resultado = resultado.map(row => {
      const valor = sqlLiteralToJsForComparison(row[idx]);
      if (valor === null || existentes.has(valor)) return row;
      const copia = row.slice();
      copia[idx] = 'NULL';
      anuladas++;
      return copia;
    });

    if (anuladas > 0) {
      adjustments.push(
        `${anuladas} linha(s) com ${fk.column} apontando para ${fk.refTable} inexistente — ` +
          `o registro foi mantido e a referência ficou em branco.`,
      );
    }
  }

  return { rows: resultado, adjustments };
}

/** Quais destes valores já existem hoje na coluna informada — em lotes, para não estourar o `IN (...)`. */
async function findExistingValues(db: any, table: Table, column: AnyColumn, values: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  const BATCH = 500;
  for (let i = 0; i < values.length; i += BATCH) {
    const batch = values.slice(i, i + BATCH);
    if (batch.length === 0) continue;
    const found = await db.select({ v: column }).from(table).where(inArray(column, batch));
    for (const r of found) existing.add(String(r.v));
  }
  return existing;
}

// ──────────────────────────────────────────────────────────────── dry-run

export type MergeTableReport = {
  table: string;
  label: string;
  hasNaturalKey: boolean;
  rowsInBackup: number;
  rowsCurrentlyInProduction: number;
  /** Só relevante para tabelas com chave natural. */
  rowsAlreadyExisting: number;
  rowsToInsert: number;
  /** Linhas cuja chave natural está NULL no backup (ex.: cobrança manual sem asaas_charge_id) — nunca inseridas automaticamente. */
  rowsWithoutKeyValue: number;
  /**
   * Só para tabelas SEM chave natural: quantas linhas teriam um id ainda
   * livre hoje (candidatas à recuperação forçada por id). É uma PREVISÃO —
   * o número real pode ser um pouco menor se outra operação inserir/gravar
   * entre o dry-run e o "Recuperar mesmo assim".
   */
  rowsInsertableById?: number;
  /** Presente só se a análise desta tabela falhou — as demais tabelas continuam com resultado normal. */
  error?: string;
};

export type MergeDryRunResult = {
  generatedAt: string;
  tables: MergeTableReport[];
  tablesInBackupNotRecognized: string[];
  totalRowsToInsert: number;
};

async function analyzeTable(
  db: any,
  dump: string,
  cfg: MergeableTable,
): Promise<MergeTableReport> {
  const extracted = extractTableInserts(dump, cfg.sqlTableName);
  const rowsInBackup = extracted?.rows.length ?? 0;
  const rowsCurrentlyInProduction = await currentRowCount(db, cfg.drizzleTable);

  if (!cfg.hasNaturalKey) {
    let rowsInsertableById: number | undefined;
    if (extracted) {
      const idIdx = extracted.columns.indexOf('id');
      if (idIdx >= 0) {
        const ids = extracted.rows.map(row => sqlLiteralToJsForComparison(row[idIdx])).filter((v): v is string => v !== null);
        const existingIds = await findExistingValues(db, cfg.drizzleTable, cfg.idColumn, ids);
        rowsInsertableById = ids.filter(id => !existingIds.has(id)).length;
      }
    }
    return {
      table: cfg.sqlTableName,
      label: cfg.label,
      hasNaturalKey: cfg.hasNaturalKey,
      rowsInBackup,
      rowsCurrentlyInProduction,
      rowsAlreadyExisting: 0,
      rowsToInsert: 0,
      rowsWithoutKeyValue: 0,
      rowsInsertableById,
    };
  }

  if (!extracted) {
    return {
      table: cfg.sqlTableName,
      label: cfg.label,
      hasNaturalKey: true,
      rowsInBackup: 0,
      rowsCurrentlyInProduction,
      rowsAlreadyExisting: 0,
      rowsToInsert: 0,
      rowsWithoutKeyValue: 0,
    };
  }

  const { columns, rows } = extracted;
  const keyValues: string[] = [];
  let rowsWithoutKeyValue = 0;
  for (const row of rows) {
    const value = countKeyMatches(row, cfg.keySqlName, columns);
    if (value === null) rowsWithoutKeyValue++;
    else keyValues.push(value);
  }

  const existingKeys = new Set<string>();
  const BATCH = 500;
  for (let i = 0; i < keyValues.length; i += BATCH) {
    const batch = keyValues.slice(i, i + BATCH);
    if (batch.length === 0) continue;
    const found = await db.select({ key: cfg.keyColumn }).from(cfg.drizzleTable).where(inArray(cfg.keyColumn, batch));
    for (const r of found) existingKeys.add(String(r.key));
  }

  const toInsert = keyValues.filter(k => !existingKeys.has(k));

  return {
    table: cfg.sqlTableName,
    label: cfg.label,
    hasNaturalKey: true,
    rowsInBackup,
    rowsCurrentlyInProduction,
    rowsAlreadyExisting: keyValues.length - toInsert.length,
    rowsToInsert: toInsert.length,
    rowsWithoutKeyValue,
  };
}

function listUnrecognizedTables(dump: string): string[] {
  const found = new Set(
    Array.from(dump.matchAll(/^-- Table: `?([^`\n]+?)`?\s*$/gm)).map(m => m[1].trim()),
  );
  const known = new Set(ALL_MERGEABLE_TABLES.map(t => t.sqlTableName));
  return Array.from(found).filter(t => !known.has(t) && !NEVER_PROCESSED_TABLES.has(t) && !t.startsWith('open_finance_'));
}

export async function dryRunRestoreMerge(db: any, dump: string): Promise<MergeDryRunResult> {
  assertValidBackupDump(dump);

  const tables: MergeTableReport[] = [];
  for (const cfg of ALL_MERGEABLE_TABLES) {
    // Isolado por tabela: uma falha ao analisar uma tabela (ex.: coluna
    // inesperada) não pode apagar o relatório das outras 19 — sem isso, um
    // erro único vira "não sei o que aconteceu com nada".
    try {
      tables.push(await analyzeTable(db, dump, cfg));
    } catch (error: any) {
      tables.push({
        table: cfg.sqlTableName,
        label: cfg.label,
        hasNaturalKey: cfg.hasNaturalKey,
        rowsInBackup: 0,
        rowsCurrentlyInProduction: 0,
        rowsAlreadyExisting: 0,
        rowsToInsert: 0,
        rowsWithoutKeyValue: 0,
        error: describeError(error),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    tables,
    tablesInBackupNotRecognized: listUnrecognizedTables(dump),
    totalRowsToInsert: tables.reduce((sum, t) => sum + t.rowsToInsert, 0),
  };
}

// ──────────────────────────────────────────────────────────────────── apply

export type MergeApplyTableResult = {
  table: string;
  label: string;
  /** Quantas linhas o dry-run/apply identificou como candidatas a inserir. */
  rowsAttempted: number;
  /** Quantas o INSERT reportou como inseridas (pode divergir de `rowsVerified` se algo deu errado silenciosamente). */
  rowsInserted: number;
  /**
   * Confirmação real: depois do INSERT, relê no banco quantas das chaves que
   * tentamos inserir agora existem. É essa contagem — não a resposta do
   * INSERT — que decide se a tabela "deu certo" no relatório. Sem isso, um
   * INSERT que roda sem erro mas não persiste (ex.: driver engolindo uma
   * falha) seria reportado como sucesso sem nunca ter acontecido de verdade.
   */
  rowsVerified: number;
  /** true só quando rowsVerified === rowsAttempted e nenhum erro ocorreu. */
  success: boolean;
  /** Presente quando o INSERT desta tabela lançou uma exceção — as demais tabelas continuam sendo tentadas. */
  error?: string;
  /**
   * O que precisou ser ajustado para o backup de agosto caber no schema de
   * hoje (coluna removida do banco, valor de enum fora do domínio atual).
   * Fica visível para nenhuma alteração acontecer em silêncio.
   */
  adjustments?: string[];
};

export type MergeApplyResult = {
  appliedAt: string;
  tables: MergeApplyTableResult[];
  totalRowsInserted: number;
  /** true só se TODAS as tabelas tentadas confirmaram sucesso (rowsVerified === rowsAttempted, sem erro). */
  allSucceeded: boolean;
  /** Tabelas que o Aplicar NUNCA toca, para deixar isso explícito na resposta. */
  tablesNeverAutoInserted: string[];
};

/**
 * Insere SOMENTE as linhas novas (por chave natural) das tabelas elegíveis.
 * Nunca faz UPDATE, nunca faz DELETE, nunca toca em tabela sem chave natural.
 * Em caso de conflito de chave, a linha do backup é descartada silenciosamente
 * — produção sempre vence (decisão confirmada em 31/08/2026).
 *
 * Cada tabela é isolada (uma falha não impede as demais) e AUTO-VERIFICADA
 * (relê o banco depois do INSERT em vez de só confiar na resposta dele) —
 * corrige o relato de 31/08/2026 em que o resultado não deixava claro se uma
 * tabela específica (funcionários) realmente persistiu.
 */
export async function applyRestoreMerge(db: any, dump: string): Promise<MergeApplyResult> {
  assertValidBackupDump(dump);

  const results: MergeApplyTableResult[] = [];

  for (const cfg of TABLES_WITH_NATURAL_KEY) {
    try {
      const extracted = extractTableInserts(dump, cfg.sqlTableName);
      if (!extracted || extracted.rows.length === 0) {
        results.push({ table: cfg.sqlTableName, label: cfg.label, rowsAttempted: 0, rowsInserted: 0, rowsVerified: 0, success: true });
        continue;
      }
      // O backup é de agosto; o schema mudou desde então. Adapta antes de
      // qualquer indexOf, para que todo o resto trabalhe já sobre as colunas
      // que existem hoje.
      const schemaAtual = await describeTable(db, cfg.sqlTableName);
      const adaptado = adaptToCurrentSchema(extracted.columns, extracted.rows, schemaAtual);
      const { columns, rows } = adaptado;
      const adjustments = [...adaptado.adjustments];
      const keyIdx = columns.indexOf(cfg.keySqlName);

      const keyValues: string[] = [];
      for (const row of rows) {
        const value = keyIdx >= 0 ? sqlLiteralToJsForComparison(row[keyIdx]) : null;
        if (value !== null) keyValues.push(value);
      }

      const existingKeys = new Set<string>();
      const BATCH = 500;
      for (let i = 0; i < keyValues.length; i += BATCH) {
        const batch = keyValues.slice(i, i + BATCH);
        if (batch.length === 0) continue;
        const found = await db.select({ key: cfg.keyColumn }).from(cfg.drizzleTable).where(inArray(cfg.keyColumn, batch));
        for (const r of found) existingKeys.add(String(r.key));
      }

      let rowsToInsert = rows.filter(row => {
        if (keyIdx < 0) return false;
        const value = sqlLiteralToJsForComparison(row[keyIdx]);
        return value !== null && !existingKeys.has(value);
      });
      // A chave natural olha uma coluna só. A tabela pode ter outras
      // restrições UNIQUE, e basta uma para derrubar o lote inteiro — foi o
      // caso de `users.users_email_uq` em 05/09/2026.
      const semColisao = await removerColisoesDeUnicidade(db, cfg.sqlTableName, columns, rowsToInsert);
      const semReferenciaQuebrada = await anularReferenciasQuebradas(
        db,
        cfg.sqlTableName,
        columns,
        semColisao.rows,
        schemaAtual,
      );
      rowsToInsert = semReferenciaQuebrada.rows;
      adjustments.push(...semColisao.adjustments, ...semReferenciaQuebrada.adjustments);

      const keysAttempted = rowsToInsert
        .map(row => sqlLiteralToJsForComparison(row[keyIdx]))
        .filter((v): v is string => v !== null);

      // O `id` do backup pode já pertencer HOJE a uma linha totalmente
      // diferente — ex.: a tabela foi zerada/reconstruída em algum momento e
      // o autoincrement reaproveitou ids baixos para contas/cobranças novas.
      // A chave natural não detecta esse caso (é outra linha, com outra
      // chave). Sem isto, o INSERT inteiro falhava por violação de PK — foi
      // exatamente o que aconteceu em produção com `users`/`bpo_charges` em
      // 01-02/09/2026. Em vez de falhar, deixa o autoincrement escolher um id
      // novo só para as linhas que colidem; as demais mantêm o id original.
      const idIdx = columns.indexOf('id');
      let preparedRows = rowsToInsert;
      if (idIdx >= 0) {
        const idsToInsert = rowsToInsert
          .map(row => sqlLiteralToJsForComparison(row[idIdx]))
          .filter((v): v is string => v !== null);
        const collidingIds = await findExistingValues(db, cfg.drizzleTable, cfg.idColumn, idsToInsert);
        if (collidingIds.size > 0) {
          preparedRows = rowsToInsert.map(row => {
            const idVal = sqlLiteralToJsForComparison(row[idIdx]);
            if (idVal !== null && collidingIds.has(idVal)) {
              const copy = row.slice();
              copy[idIdx] = 'NULL';
              return copy;
            }
            return row;
          });
        }
      }

      let inserted = 0;
      const INSERT_BATCH = 200;
      const columnList = columns.map(c => `\`${c}\``).join(', ');
      for (let i = 0; i < preparedRows.length; i += INSERT_BATCH) {
        const batch = preparedRows.slice(i, i + INSERT_BATCH);
        if (batch.length === 0) continue;
        // Reconstrói exatamente os literais originais do dump — não há
        // reserialização de valores JS, então não há risco de perda de
        // precisão em datas/decimais/JSON (exceto o `id`, deliberadamente
        // trocado por NULL acima quando colide).
        const valuesSql = batch.map(row => `(${row.join(', ')})`).join(',\n');
        await db.execute(sql.raw(`INSERT INTO \`${cfg.sqlTableName}\` (${columnList}) VALUES\n${valuesSql};`));
        inserted += batch.length;
      }

      // Verificação real: relê o banco em vez de confiar na ausência de
      // exceção do INSERT.
      let verified = 0;
      for (let i = 0; i < keysAttempted.length; i += BATCH) {
        const batch = keysAttempted.slice(i, i + BATCH);
        if (batch.length === 0) continue;
        const found = await db.select({ key: cfg.keyColumn }).from(cfg.drizzleTable).where(inArray(cfg.keyColumn, batch));
        verified += found.length;
      }

      results.push({
        table: cfg.sqlTableName,
        label: cfg.label,
        rowsAttempted: rowsToInsert.length,
        rowsInserted: inserted,
        rowsVerified: verified,
        success: verified === rowsToInsert.length,
        adjustments: adjustments.length > 0 ? adjustments : undefined,
      });
    } catch (error: any) {
      results.push({
        table: cfg.sqlTableName,
        label: cfg.label,
        rowsAttempted: 0,
        rowsInserted: 0,
        rowsVerified: 0,
        success: false,
        error: describeError(error),
      });
    }
  }

  return {
    appliedAt: new Date().toISOString(),
    tables: results,
    totalRowsInserted: results.reduce((sum, t) => sum + t.rowsInserted, 0),
    allSucceeded: results.every(t => t.success),
    tablesNeverAutoInserted: TABLES_WITHOUT_NATURAL_KEY.map(t => t.sqlTableName),
  };
}

// ──────────────────────────────────── recuperação forçada (tabelas sem chave)

export type ForceRestoreTableResult = {
  table: string;
  label: string;
  rowsInBackup: number;
  /** Linhas cujo id já existe hoje — nunca sobrepostas, sempre puladas. */
  rowsSkippedExistingId: number;
  rowsAttempted: number;
  rowsInserted: number;
  rowsVerified: number;
  success: boolean;
  error?: string;
  /** Ajustes feitos para o backup caber no schema atual — ver `adaptToCurrentSchema`. */
  adjustments?: string[];
};

export type ForceRestoreResult = {
  appliedAt: string;
  tables: ForceRestoreTableResult[];
  totalRowsInserted: number;
  allSucceeded: boolean;
};

/**
 * Última linha de defesa contra duplicata nas tabelas SEM chave natural:
 * insere pelo próprio `id` (a PK autoincrement do backup), só quando aquele
 * id ainda não existe hoje. NUNCA sobrescreve uma linha existente.
 *
 * ISTO NÃO É EQUIVALENTE à dedup por chave natural do `applyRestoreMerge`:
 * comparar por id só evita colidir com uma linha que já tem o MESMO id —
 * não detecta "o mesmo evento operacional foi recadastrado depois com outro
 * id". Por isso só roda quando o dono do produto aceita explicitamente esse
 * risco residual de duplicata para priorizar recuperar o dado (decisão de
 * 31/08 a 01/09/2026, depois de confirmado que os anexos — fotos e
 * documentos — só voltam a ser arquiváveis quando as tabelas que referenciam
 * suas URLs, como `inspections`/`fuel_records`, tiverem os registros de
 * volta).
 *
 * IDs originais são preservados de propósito: `bookings.vessel_id`,
 * `inspections.booking_id` etc. apontam para outras linhas do MESMO backup
 * por id — trocar os ids quebraria esses vínculos. `fuel_purchases.
 * purchased_by` é a única FK de banco real do schema, e aponta para `users`,
 * já restaurado antes deste grupo.
 */
export async function forceRestoreTablesWithoutNaturalKey(
  db: any,
  dump: string,
  onlyTables?: string[],
): Promise<ForceRestoreResult> {
  assertValidBackupDump(dump);

  const targets = onlyTables
    ? TABLES_WITHOUT_NATURAL_KEY.filter(t => onlyTables.includes(t.sqlTableName))
    : TABLES_WITHOUT_NATURAL_KEY;

  const results: ForceRestoreTableResult[] = [];

  for (const cfg of targets) {
    try {
      const extracted = extractTableInserts(dump, cfg.sqlTableName);
      if (!extracted || extracted.rows.length === 0) {
        results.push({
          table: cfg.sqlTableName,
          label: cfg.label,
          rowsInBackup: 0,
          rowsSkippedExistingId: 0,
          rowsAttempted: 0,
          rowsInserted: 0,
          rowsVerified: 0,
          success: true,
        });
        continue;
      }

      const schemaAtual = await describeTable(db, cfg.sqlTableName);
      const adaptado = adaptToCurrentSchema(extracted.columns, extracted.rows, schemaAtual);
      const { columns, rows } = adaptado;
      const adjustments = [...adaptado.adjustments];
      const idIdx = columns.indexOf('id');
      if (idIdx < 0) {
        throw new Error('Backup sem coluna `id` reconhecível para esta tabela — recuperação por id não é possível.');
      }

      const BATCH = 500;
      const idOf = (row: string[]) => sqlLiteralToJsForComparison(row[idIdx]);

      const idValues = rows.map(idOf).filter((v): v is string => v !== null);
      const existingIds = new Set<string>();
      for (let i = 0; i < idValues.length; i += BATCH) {
        const batch = idValues.slice(i, i + BATCH);
        if (batch.length === 0) continue;
        const found = await db.select({ id: cfg.idColumn }).from(cfg.drizzleTable).where(inArray(cfg.idColumn, batch));
        for (const r of found) existingIds.add(String(r.id));
      }

      let rowsToInsert = rows.filter(row => {
        const idVal = idOf(row);
        return idVal !== null && !existingIds.has(idVal);
      });
      const skipped = rows.length - rowsToInsert.length;

      // `fuel_purchases.purchased_by` → `users.id` é a única FK real do
      // schema, e derrubava as 51 compras de combustível sempre que o usuário
      // referenciado não voltava. Preservar a compra sem o comprador é melhor
      // do que perder a compra: é ela que fecha a conta do abastecimento.
      const semColisao = await removerColisoesDeUnicidade(db, cfg.sqlTableName, columns, rowsToInsert);
      const semReferenciaQuebrada = await anularReferenciasQuebradas(
        db,
        cfg.sqlTableName,
        columns,
        semColisao.rows,
        schemaAtual,
      );
      rowsToInsert = semReferenciaQuebrada.rows;
      adjustments.push(...semColisao.adjustments, ...semReferenciaQuebrada.adjustments);

      let inserted = 0;
      const INSERT_BATCH = 200;
      const columnList = columns.map(c => `\`${c}\``).join(', ');
      for (let i = 0; i < rowsToInsert.length; i += INSERT_BATCH) {
        const batch = rowsToInsert.slice(i, i + INSERT_BATCH);
        if (batch.length === 0) continue;
        const valuesSql = batch.map(row => `(${row.join(', ')})`).join(',\n');
        await db.execute(sql.raw(`INSERT INTO \`${cfg.sqlTableName}\` (${columnList}) VALUES\n${valuesSql};`));
        inserted += batch.length;
      }

      const attemptedIds = rowsToInsert.map(idOf).filter((v): v is string => v !== null);
      let verified = 0;
      for (let i = 0; i < attemptedIds.length; i += BATCH) {
        const batch = attemptedIds.slice(i, i + BATCH);
        if (batch.length === 0) continue;
        const found = await db.select({ id: cfg.idColumn }).from(cfg.drizzleTable).where(inArray(cfg.idColumn, batch));
        verified += found.length;
      }

      results.push({
        table: cfg.sqlTableName,
        label: cfg.label,
        rowsInBackup: rows.length,
        rowsSkippedExistingId: skipped,
        rowsAttempted: rowsToInsert.length,
        rowsInserted: inserted,
        rowsVerified: verified,
        success: verified === rowsToInsert.length,
        adjustments: adjustments.length > 0 ? adjustments : undefined,
      });
    } catch (error: any) {
      results.push({
        table: cfg.sqlTableName,
        label: cfg.label,
        rowsInBackup: 0,
        rowsSkippedExistingId: 0,
        rowsAttempted: 0,
        rowsInserted: 0,
        rowsVerified: 0,
        success: false,
        error: describeError(error),
      });
    }
  }

  return {
    appliedAt: new Date().toISOString(),
    tables: results,
    totalRowsInserted: results.reduce((sum, t) => sum + t.rowsInserted, 0),
    allSucceeded: results.every(t => t.success),
  };
}
