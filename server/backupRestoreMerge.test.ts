/**
 * A regra de negócio central desta recuperação é: NUNCA sobrescrever, NUNCA
 * apagar, e NUNCA inserir automaticamente numa tabela sem chave natural
 * confiável. Estes testes fixam essas garantias contra o banco real — a
 * lógica de "já existe?" vive numa consulta SQL de verdade, então um teste
 * com banco falso validaria a imitação, não a regra.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getDb } from './db';
import { allowedClients, employees, bookings } from '../drizzle/schema';
import { dryRunRestoreMerge, applyRestoreMerge } from './backupRestoreMerge';

const db = await getDb();

function sqlTable(
  name: string,
  createSql: string,
  columns: string[],
  rows: Array<Record<string, string | number | null>>,
): string {
  const lines: string[] = [`-- Table: ${name}`, `DROP TABLE IF EXISTS \`${name}\`;`, `${createSql};`, ''];
  if (rows.length > 0) {
    const columnNames = columns.map(col => `\`${col}\``).join(', ');
    lines.push(`-- Data for table: ${name}`);
    const values = rows.map(row => {
      const rowValues = columns.map(col => {
        const value = row[col];
        if (value === null || value === undefined) return 'NULL';
        if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
        return String(value);
      });
      return `(${rowValues.join(', ')})`;
    });
    lines.push(`INSERT INTO \`${name}\` (${columnNames}) VALUES`);
    lines.push(`${values.join(',\n')};`);
    lines.push('');
  }
  return lines.join('\n');
}

function buildDump(tables: string[]): string {
  return [
    '-- Exclusive Club - Database Backup',
    '-- Generated: 2026-08-14T02:56:35.000Z',
    '-- Database: exclusive_club',
    '',
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
    ...tables,
    'SET FOREIGN_KEY_CHECKS = 1;',
    '',
    '-- Backup completed successfully',
  ].join('\n');
}

const PREFIXO = 'merge-test-2026-08-31';
const emailJaExistente = `${PREFIXO}-existente@example.com`;
const emailNovo = `${PREFIXO}-novo@example.com`;

describe.skipIf(!db)('backupRestoreMerge — mesclagem seletiva de backup antigo', () => {
  beforeEach(async () => {
    await db!.delete(allowedClients).where(eq(allowedClients.email, emailJaExistente));
    await db!.delete(allowedClients).where(eq(allowedClients.email, emailNovo));
    await db!.insert(allowedClients).values({ email: emailJaExistente, name: 'Cliente já existente' });
  });

  afterEach(async () => {
    await db!.delete(allowedClients).where(eq(allowedClients.email, emailJaExistente));
    await db!.delete(allowedClients).where(eq(allowedClients.email, emailNovo));
  });

  it('dry-run identifica corretamente linha já existente (por email) e linha nova, sem gravar nada', async () => {
    const dump = buildDump([
      sqlTable(
        'allowed_clients',
        "CREATE TABLE `allowed_clients` (`id` int NOT NULL AUTO_INCREMENT, `email` varchar(320) NOT NULL, `name` text NOT NULL, PRIMARY KEY (`id`))",
        ['id', 'email', 'name'],
        [
          { id: 9001, email: emailJaExistente, name: 'Cliente já existente (do backup)' },
          { id: 9002, email: emailNovo, name: 'Cliente novo (do backup)' },
        ],
      ),
    ]);

    const relatorio = await dryRunRestoreMerge(db, dump);
    const linha = relatorio.tables.find(t => t.table === 'allowed_clients')!;

    expect(linha.hasNaturalKey).toBe(true);
    expect(linha.rowsInBackup).toBe(2);
    expect(linha.rowsAlreadyExisting).toBe(1);
    expect(linha.rowsToInsert).toBe(1);

    // Dry-run é só leitura: o cliente novo não pode ter sido criado.
    const aindaNaoExiste = await db!.select().from(allowedClients).where(eq(allowedClients.email, emailNovo));
    expect(aindaNaoExiste.length).toBe(0);
  });

  it('apply insere só a linha nova e nunca sobrescreve a existente (produção sempre vence)', async () => {
    const dump = buildDump([
      sqlTable(
        'allowed_clients',
        "CREATE TABLE `allowed_clients` (`id` int NOT NULL AUTO_INCREMENT, `email` varchar(320) NOT NULL, `name` text NOT NULL, PRIMARY KEY (`id`))",
        ['id', 'email', 'name'],
        [
          // Nome DIFERENTE do que está em produção — não deve substituir.
          { id: 9001, email: emailJaExistente, name: 'NOME DIFERENTE DO BACKUP — NÃO DEVE PREVALECER' },
          { id: 9002, email: emailNovo, name: 'Cliente novo (do backup)' },
        ],
      ),
    ]);

    const resultado = await applyRestoreMerge(db, dump);
    const linha = resultado.tables.find(t => t.table === 'allowed_clients')!;
    expect(linha.rowsInserted).toBe(1);
    // Auto-verificação: não basta o INSERT não ter lançado erro — relê o
    // banco e confirma que a linha está mesmo lá.
    expect(linha.rowsVerified).toBe(1);
    expect(linha.success).toBe(true);
    expect(linha.error).toBeUndefined();
    expect(resultado.allSucceeded).toBe(true);

    const existente = await db!.select().from(allowedClients).where(eq(allowedClients.email, emailJaExistente));
    expect(existente[0]!.name).toBe('Cliente já existente'); // valor de produção preservado

    const novo = await db!.select().from(allowedClients).where(eq(allowedClients.email, emailNovo));
    expect(novo.length).toBe(1);
    expect(novo[0]!.name).toBe('Cliente novo (do backup)');
  });

  it('apply é idempotente: rodar duas vezes com o mesmo arquivo não duplica nem falha', async () => {
    const dump = buildDump([
      sqlTable(
        'allowed_clients',
        "CREATE TABLE `allowed_clients` (`id` int NOT NULL AUTO_INCREMENT, `email` varchar(320) NOT NULL, `name` text NOT NULL, PRIMARY KEY (`id`))",
        ['id', 'email', 'name'],
        [{ id: 9002, email: emailNovo, name: 'Cliente novo (do backup)' }],
      ),
    ]);

    const primeira = await applyRestoreMerge(db, dump);
    expect(primeira.tables.find(t => t.table === 'allowed_clients')!.rowsInserted).toBe(1);

    const segunda = await applyRestoreMerge(db, dump);
    expect(segunda.tables.find(t => t.table === 'allowed_clients')!.rowsInserted).toBe(0);

    const linhas = await db!.select().from(allowedClients).where(eq(allowedClients.email, emailNovo));
    expect(linhas.length).toBe(1);
  });

  it('bpo_charges: linha sem asaas_charge_id (cobrança manual) nunca é inserida automaticamente', async () => {
    const dump = buildDump([
      sqlTable(
        'bpo_charges',
        "CREATE TABLE `bpo_charges` (`id` int NOT NULL AUTO_INCREMENT, `asaas_charge_id` varchar(64), `value` decimal(10,2) NOT NULL, `due_date` varchar(10) NOT NULL, PRIMARY KEY (`id`))",
        ['id', 'asaas_charge_id', 'value', 'due_date'],
        [{ id: 9101, asaas_charge_id: null, value: 100.5, due_date: '2026-08-01' }],
      ),
    ]);

    const relatorio = await dryRunRestoreMerge(db, dump);
    const linha = relatorio.tables.find(t => t.table === 'bpo_charges')!;
    expect(linha.rowsWithoutKeyValue).toBe(1);
    expect(linha.rowsToInsert).toBe(0);

    const resultado = await applyRestoreMerge(db, dump);
    expect(resultado.tables.find(t => t.table === 'bpo_charges')!.rowsInserted).toBe(0);
  });

  it('tabelas sem chave natural (ex.: bookings): dry-run só conta, apply nunca insere', async () => {
    const dump = buildDump([
      sqlTable(
        'bookings',
        "CREATE TABLE `bookings` (`id` int NOT NULL AUTO_INCREMENT, `client_email` varchar(320) NOT NULL, `client_name` text NOT NULL, `vessel_id` int NOT NULL, `vessel_name` text NOT NULL, `booking_date` bigint NOT NULL, PRIMARY KEY (`id`))",
        ['id', 'client_email', 'client_name', 'vessel_id', 'vessel_name', 'booking_date'],
        [{ id: 9201, client_email: 'x@example.com', client_name: 'X', vessel_id: 1, vessel_name: 'V', booking_date: 1723000000000 }],
      ),
    ]);

    const relatorio = await dryRunRestoreMerge(db, dump);
    const linha = relatorio.tables.find(t => t.table === 'bookings')!;
    expect(linha.hasNaturalKey).toBe(false);
    expect(linha.rowsInBackup).toBe(1);
    expect(linha.rowsToInsert).toBe(0);
    expect(relatorio.totalRowsToInsert).toBe(0);

    const resultado = await applyRestoreMerge(db, dump);
    expect(resultado.tables.some(t => t.table === 'bookings')).toBe(false); // nem tentado
    expect(resultado.tablesNeverAutoInserted).toContain('bookings');

    const contagem = (await db!.execute(sql`SELECT COUNT(*) AS total FROM ${bookings} WHERE id = 9201`)) as any;
    const linhaContagem = (Array.isArray(contagem[0]) ? contagem[0] : contagem)[0];
    expect(Number(linhaContagem?.total ?? 0)).toBe(0);
  });

  it('tabelas nunca processadas (ex.: system_settings) não aparecem nem como "não reconhecidas"', async () => {
    const dump = buildDump([
      sqlTable(
        'system_settings',
        "CREATE TABLE `system_settings` (`id` int NOT NULL AUTO_INCREMENT, `key` varchar(100) NOT NULL, `value` text NOT NULL, PRIMARY KEY (`id`))",
        ['id', 'key', 'value'],
        [{ id: 1, key: 'asaas_api_key', value: 'SEGREDO' }],
      ),
    ]);

    const relatorio = await dryRunRestoreMerge(db, dump);
    expect(relatorio.tablesInBackupNotRecognized).not.toContain('system_settings');
    expect(relatorio.tables.some(t => t.table === 'system_settings')).toBe(false);
  });

  it('uma tabela com erro no INSERT não impede as demais, e o erro fica visível no relatório', async () => {
    const emailFuncionario = `${PREFIXO}-funcionario@example.com`;
    await db!.delete(employees).where(eq(employees.email, emailFuncionario));

    const dump = buildDump([
      sqlTable(
        // Coluna inexistente na tabela real (`employees` não tem `coluna_inexistente`)
        // força o INSERT a lançar — simula uma falha real de gravação numa
        // tabela específica, sem depender de derrubar o banco de teste.
        'employees',
        "CREATE TABLE `employees` (`id` int NOT NULL AUTO_INCREMENT, `email` varchar(320) NOT NULL, PRIMARY KEY (`id`))",
        ['id', 'email', 'coluna_inexistente'],
        [{ id: 9301, email: emailFuncionario, coluna_inexistente: 'x' }],
      ),
      sqlTable(
        'allowed_clients',
        "CREATE TABLE `allowed_clients` (`id` int NOT NULL AUTO_INCREMENT, `email` varchar(320) NOT NULL, `name` text NOT NULL, PRIMARY KEY (`id`))",
        ['id', 'email', 'name'],
        [{ id: 9002, email: emailNovo, name: 'Cliente novo (do backup)' }],
      ),
    ]);

    const resultado = await applyRestoreMerge(db, dump);

    const linhaFuncionarios = resultado.tables.find(t => t.table === 'employees')!;
    expect(linhaFuncionarios.success).toBe(false);
    expect(linhaFuncionarios.rowsInserted).toBe(0);
    expect(linhaFuncionarios.error).toBeTruthy();

    // A falha em `employees` (que vem antes na ordem de processamento) não
    // pode impedir `allowed_clients` de ser processada.
    const linhaClientes = resultado.tables.find(t => t.table === 'allowed_clients')!;
    expect(linhaClientes.success).toBe(true);
    expect(linhaClientes.rowsInserted).toBe(1);

    expect(resultado.allSucceeded).toBe(false);

    const novo = await db!.select().from(allowedClients).where(eq(allowedClients.email, emailNovo));
    expect(novo.length).toBe(1);

    await db!.delete(employees).where(eq(employees.email, emailFuncionario));
  });

  it('rejeita um arquivo que não é um backup válido (sem marcador de conclusão)', async () => {
    await expect(dryRunRestoreMerge(db, 'SELECT 1;')).rejects.toThrow(/marcador de conclusão/);
  });
});
