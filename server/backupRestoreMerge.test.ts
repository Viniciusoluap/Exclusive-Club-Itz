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
import { allowedClients, employees, bookings, vessels } from '../drizzle/schema';
import { dryRunRestoreMerge, applyRestoreMerge, forceRestoreTablesWithoutNaturalKey } from './backupRestoreMerge';

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

  it('tabelas sem chave natural (ex.: bookings): dry-run prevê por id, apply nunca insere sozinho', async () => {
    const idBooking = 9201;
    await db!.execute(sql`DELETE FROM bookings WHERE id = ${idBooking}`);

    try {
      const dump = buildDump([
        sqlTable(
          'bookings',
          "CREATE TABLE `bookings` (`id` int NOT NULL AUTO_INCREMENT, `client_email` varchar(320) NOT NULL, `client_name` text NOT NULL, `vessel_id` int NOT NULL, `vessel_name` text NOT NULL, `booking_date` bigint NOT NULL, PRIMARY KEY (`id`))",
          ['id', 'client_email', 'client_name', 'vessel_id', 'vessel_name', 'booking_date'],
          [{ id: idBooking, client_email: 'x@example.com', client_name: 'X', vessel_id: 1, vessel_name: 'V', booking_date: 1723000000000 }],
        ),
      ]);

      const relatorio = await dryRunRestoreMerge(db, dump);
      const linha = relatorio.tables.find(t => t.table === 'bookings')!;
      expect(linha.hasNaturalKey).toBe(false);
      expect(linha.rowsInBackup).toBe(1);
      expect(linha.rowsToInsert).toBe(0);
      expect(relatorio.totalRowsToInsert).toBe(0);
      // Novo: o dry-run agora prevê quantos SERIAM inseridos por id pelo
      // "Recuperar mesmo assim" — sem isso a seção "sem chave" não mostrava
      // nenhum número (a lacuna reportada em 01-02/09/2026).
      expect(linha.rowsInsertableById).toBe(1);

      const resultado = await applyRestoreMerge(db, dump);
      expect(resultado.tables.some(t => t.table === 'bookings')).toBe(false); // nem tentado
      expect(resultado.tablesNeverAutoInserted).toContain('bookings');

      const contagem = (await db!.execute(sql`SELECT COUNT(*) AS total FROM ${bookings} WHERE id = ${idBooking}`)) as any;
      const linhaContagem = (Array.isArray(contagem[0]) ? contagem[0] : contagem)[0];
      expect(Number(linhaContagem?.total ?? 0)).toBe(0);
    } finally {
      await db!.execute(sql`DELETE FROM bookings WHERE id = ${idBooking}`);
    }
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

  it('apply nunca falha por colisão de id com uma linha DIFERENTE — insere com id novo (reproduz o bug de produção de 01-02/09/2026)', async () => {
    const idOcupado = 9501001;
    const emailOcupante = `${PREFIXO}-ocupante-do-id@example.com`;
    await db!.delete(allowedClients).where(eq(allowedClients.email, emailOcupante));
    await db!.delete(allowedClients).where(eq(allowedClients.email, emailNovo));
    // Simula: depois do backup, o autoincrement reaproveitou este id para um
    // cliente TOTALMENTE diferente (ex.: tabela zerada/reconstruída).
    await db!.insert(allowedClients).values({ id: idOcupado, email: emailOcupante, name: 'Cliente que hoje ocupa este id' });

    try {
      const dump = buildDump([
        sqlTable(
          'allowed_clients',
          "CREATE TABLE `allowed_clients` (`id` int NOT NULL AUTO_INCREMENT, `email` varchar(320) NOT NULL, `name` text NOT NULL, PRIMARY KEY (`id`))",
          ['id', 'email', 'name'],
          // Mesmo id do backup, mas é OUTRA pessoa (email diferente) — exatamente
          // o cenário que antes derrubava o INSERT inteiro com "Failed query".
          [{ id: idOcupado, email: emailNovo, name: 'Cliente novo (do backup, id colide)' }],
        ),
      ]);

      const resultado = await applyRestoreMerge(db, dump);
      const linha = resultado.tables.find(t => t.table === 'allowed_clients')!;

      expect(linha.error).toBeUndefined();
      expect(linha.success).toBe(true);
      expect(linha.rowsInserted).toBe(1);
      expect(linha.rowsVerified).toBe(1);

      const novo = await db!.select().from(allowedClients).where(eq(allowedClients.email, emailNovo));
      expect(novo.length).toBe(1);
      expect(novo[0]!.name).toBe('Cliente novo (do backup, id colide)');

      // A linha que já ocupava o id não pode ter sido tocada.
      const ocupante = await db!.select().from(allowedClients).where(eq(allowedClients.email, emailOcupante));
      expect(ocupante.length).toBe(1);
      expect(ocupante[0]!.id).toBe(idOcupado);
    } finally {
      await db!.delete(allowedClients).where(eq(allowedClients.email, emailOcupante));
      await db!.delete(allowedClients).where(eq(allowedClients.email, emailNovo));
    }
  });

  it('recuperação forçada (sem chave): insere por id, pula id já existente, nunca sobrescreve', async () => {
    const idNovo = 9401001;
    const idJaExistente = 9401002;
    await db!.delete(vessels).where(eq(vessels.id, idNovo));
    await db!.delete(vessels).where(eq(vessels.id, idJaExistente));
    await db!.insert(vessels).values({ id: idJaExistente, name: 'Embarcação já existente', type: 'lancha' });

    try {
      const dump = buildDump([
        sqlTable(
          'vessels',
          "CREATE TABLE `vessels` (`id` int NOT NULL AUTO_INCREMENT, `name` text NOT NULL, `type` varchar(20) NOT NULL, PRIMARY KEY (`id`))",
          ['id', 'name', 'type'],
          [
            { id: idNovo, name: 'Embarcação nova (do backup)', type: 'lancha' },
            // Mesmo id de uma linha que já existe hoje, com nome DIFERENTE — não deve substituir.
            { id: idJaExistente, name: 'NOME DIFERENTE DO BACKUP — NÃO DEVE PREVALECER', type: 'jetski' },
          ],
        ),
      ]);

      const resultado = await forceRestoreTablesWithoutNaturalKey(db, dump, ['vessels']);
      const linha = resultado.tables.find(t => t.table === 'vessels')!;

      expect(linha.rowsInBackup).toBe(2);
      expect(linha.rowsSkippedExistingId).toBe(1);
      expect(linha.rowsAttempted).toBe(1);
      expect(linha.rowsInserted).toBe(1);
      expect(linha.rowsVerified).toBe(1);
      expect(linha.success).toBe(true);
      expect(resultado.allSucceeded).toBe(true);

      const nova = await db!.select().from(vessels).where(eq(vessels.id, idNovo));
      expect(nova.length).toBe(1);
      expect(nova[0]!.name).toBe('Embarcação nova (do backup)');

      const existente = await db!.select().from(vessels).where(eq(vessels.id, idJaExistente));
      expect(existente[0]!.name).toBe('Embarcação já existente'); // preservada, nunca sobrescrita
      expect(existente[0]!.type).toBe('lancha');
    } finally {
      await db!.delete(vessels).where(eq(vessels.id, idNovo));
      await db!.delete(vessels).where(eq(vessels.id, idJaExistente));
    }
  });

  it('recuperação forçada: aceita o parâmetro onlyTables para restringir o escopo', async () => {
    const idBooking = 9402001;
    await db!.execute(sql`DELETE FROM bookings WHERE id = ${idBooking}`);

    try {
      const dump = buildDump([
        sqlTable(
          'bookings',
          "CREATE TABLE `bookings` (`id` int NOT NULL AUTO_INCREMENT, `client_email` varchar(320) NOT NULL, `client_name` text NOT NULL, `vessel_id` int NOT NULL, `vessel_name` text NOT NULL, `booking_date` bigint NOT NULL, PRIMARY KEY (`id`))",
          ['id', 'client_email', 'client_name', 'vessel_id', 'vessel_name', 'booking_date'],
          [{ id: idBooking, client_email: 'x@example.com', client_name: 'X', vessel_id: 1, vessel_name: 'V', booking_date: 1723000000000 }],
        ),
      ]);

      const resultado = await forceRestoreTablesWithoutNaturalKey(db, dump, ['bookings']);
      expect(resultado.tables.length).toBe(1);
      expect(resultado.tables[0]!.table).toBe('bookings');
      expect(resultado.tables[0]!.rowsInserted).toBe(1);

      const linhas = (await db!.execute(sql`SELECT id FROM bookings WHERE id = ${idBooking}`)) as any;
      const rows = Array.isArray(linhas[0]) ? linhas[0] : linhas;
      expect(rows.length).toBe(1);
    } finally {
      await db!.execute(sql`DELETE FROM bookings WHERE id = ${idBooking}`);
    }
  });

  it('rejeita um arquivo que não é um backup válido (sem marcador de conclusão)', async () => {
    await expect(dryRunRestoreMerge(db, 'SELECT 1;')).rejects.toThrow(/marcador de conclusão/);
  });

  /**
   * Relatado em produção (05/09/2026): `users` é comparado por `openId`, mas a
   * tabela também tem UNIQUE em `email`. Uma linha do backup com openId novo e
   * e-mail que já pertencia a outra conta ativa derrubava as 37 linhas de uma
   * vez com "Duplicate entry for key 'users.users_email_uq'".
   */
  it('pula a linha que violaria OUTRA restrição UNIQUE, sem derrubar o lote', async () => {
    const emailDisputado = `${PREFIXO}-disputado@example.com`;
    const openIdProducao = `${PREFIXO}-openid-producao`;
    const openIdBackup = `${PREFIXO}-openid-backup`;

    const limpar = async () => {
      await db!.execute(sql`DELETE FROM users WHERE email = ${emailDisputado}`);
      await db!.execute(sql`DELETE FROM users WHERE openId = ${openIdBackup}`);
    };
    await limpar();

    try {
      await db!.execute(sql`
        INSERT INTO users (openId, name, email, loginMethod, role)
        VALUES (${openIdProducao}, 'Conta ativa em produção', ${emailDisputado}, 'email', 'user')
      `);

      const dump = buildDump([
        sqlTable(
          'users',
          "CREATE TABLE `users` (`id` int NOT NULL AUTO_INCREMENT, `openId` varchar(255) NOT NULL, `name` text, `email` varchar(320), `loginMethod` varchar(50), `role` enum('user','admin','employee') NOT NULL DEFAULT 'user', PRIMARY KEY (`id`))",
          ['openId', 'name', 'email', 'loginMethod', 'role'],
          // openId novo (passaria pela chave natural), mas e-mail já ocupado.
          [{ openId: openIdBackup, name: 'Conta do backup', email: emailDisputado, loginMethod: 'email', role: 'user' }],
        ),
      ]);

      const resultado = await applyRestoreMerge(db, dump);
      const usuarios = resultado.tables.find(t => t.table === 'users')!;

      // O lote não pode falhar por causa dessa linha.
      expect(usuarios.error).toBeUndefined();
      expect(usuarios.success).toBe(true);
      // E o motivo do descarte precisa estar visível, não silencioso.
      expect(usuarios.adjustments?.join(' ')).toContain('email');

      // A conta de produção continua intacta e sozinha com aquele e-mail.
      const raw = (await db!.execute(sql`SELECT openId FROM users WHERE email = ${emailDisputado}`)) as any;
      const linhas = Array.isArray(raw[0]) ? raw[0] : raw;
      expect(linhas.length).toBe(1);
      expect(String(linhas[0].openId)).toBe(openIdProducao);
    } finally {
      await limpar();
    }
  });

  /**
   * A vinculação de quem fez o quê precisa sobreviver à recuperação.
   *
   * POR QUE ISTO É CRÍTICO: os ids de usuário foram reatribuídos quando as
   * tabelas foram reconstruídas, e quem voltou a entrar por outro provedor
   * ganhou id novo. Reinserir a compra com o id do backup ou perde o vínculo
   * ou — muito pior — credita a compra a OUTRA pessoa, sem nenhum aviso. A
   * identidade estável é o e-mail.
   */
  it('re-vincula a compra ao id que o usuário tem hoje, identificando pelo e-mail', async () => {
    const idCompra = 9404001;
    const idAntigo = 987654322; // id que o usuário tinha no backup
    const email = `${PREFIXO}-revinculo@example.com`;
    const openIdAntigo = `${PREFIXO}-openid-antigo`;
    const openIdAtual = `${PREFIXO}-openid-atual`;

    const limpar = async () => {
      await db!.execute(sql`DELETE FROM fuel_purchases WHERE id = ${idCompra}`);
      await db!.execute(sql`DELETE FROM users WHERE email = ${email}`);
    };
    await limpar();

    try {
      // A pessoa existe hoje, com OUTRO id e OUTRO openId — só o e-mail é o mesmo.
      await db!.execute(sql`
        INSERT INTO users (openId, name, email, loginMethod, role)
        VALUES (${openIdAtual}, 'Mesma pessoa, id novo', ${email}, 'google', 'user')
      `);
      const rawUser = (await db!.execute(sql`SELECT id FROM users WHERE email = ${email}`)) as any;
      const idAtual = Number((Array.isArray(rawUser[0]) ? rawUser[0] : rawUser)[0].id);

      const dump = buildDump([
        sqlTable(
          'users',
          "CREATE TABLE `users` (`id` int NOT NULL AUTO_INCREMENT, `openId` varchar(255) NOT NULL, `name` text, `email` varchar(320), `loginMethod` varchar(50), `role` enum('user','admin','employee') NOT NULL DEFAULT 'user', PRIMARY KEY (`id`))",
          ['id', 'openId', 'name', 'email', 'loginMethod', 'role'],
          [{ id: idAntigo, openId: openIdAntigo, name: 'Mesma pessoa, id antigo', email, loginMethod: 'apple', role: 'user' }],
        ),
        sqlTable(
          'fuel_purchases',
          "CREATE TABLE `fuel_purchases` (`id` int NOT NULL AUTO_INCREMENT, `month_year` varchar(7) NOT NULL, `liters_purchased` int NOT NULL, `amount_paid` int NOT NULL, `price_per_liter` int NOT NULL, `purchased_by` int, `gallon_number` int NOT NULL DEFAULT 1, PRIMARY KEY (`id`))",
          ['id', 'month_year', 'liters_purchased', 'amount_paid', 'price_per_liter', 'purchased_by', 'gallon_number'],
          [{ id: idCompra, month_year: '2026-02', liters_purchased: 5000, amount_paid: 31450, price_per_liter: 629, purchased_by: idAntigo, gallon_number: 1 }],
        ),
      ]);

      const resultado = await forceRestoreTablesWithoutNaturalKey(db, dump, ['fuel_purchases']);
      expect(resultado.tables[0]!.rowsInserted).toBe(1);

      const raw = (await db!.execute(sql`SELECT purchased_by FROM fuel_purchases WHERE id = ${idCompra}`)) as any;
      const linhas = Array.isArray(raw[0]) ? raw[0] : raw;

      // O essencial: a compra ficou ligada à pessoa certa, não ao id de agosto
      // (que hoje pode ser de outra pessoa) nem em branco.
      expect(Number(linhas[0].purchased_by)).toBe(idAtual);
      expect(Number(linhas[0].purchased_by)).not.toBe(idAntigo);
    } finally {
      await limpar();
    }
  });

  /**
   * `fuel_purchases.purchased_by` → `users.id` é a única FK real do schema.
   * Quando o usuário referenciado não voltou, o banco recusava a compra
   * inteira — e é justamente o histórico de compras que fecha a conta do
   * abastecimento. Preservar a compra sem o comprador é a escolha certa.
   */
  it('preserva a compra de combustível anulando a referência a um usuário inexistente', async () => {
    const idCompra = 9403001;
    const idUsuarioInexistente = 987654321;

    const limpar = async () => {
      await db!.execute(sql`DELETE FROM fuel_purchases WHERE id = ${idCompra}`);
    };
    await limpar();

    try {
      const dump = buildDump([
        sqlTable(
          'fuel_purchases',
          "CREATE TABLE `fuel_purchases` (`id` int NOT NULL AUTO_INCREMENT, `month_year` varchar(7) NOT NULL, `liters_purchased` int NOT NULL, `amount_paid` int NOT NULL, `price_per_liter` int NOT NULL, `purchased_by` int, `gallon_number` int NOT NULL DEFAULT 1, PRIMARY KEY (`id`))",
          ['id', 'month_year', 'liters_purchased', 'amount_paid', 'price_per_liter', 'purchased_by', 'gallon_number'],
          [{ id: idCompra, month_year: '2026-01', liters_purchased: 5000, amount_paid: 31450, price_per_liter: 629, purchased_by: idUsuarioInexistente, gallon_number: 1 }],
        ),
      ]);

      const resultado = await forceRestoreTablesWithoutNaturalKey(db, dump, ['fuel_purchases']);
      const compras = resultado.tables[0]!;

      expect(compras.error).toBeUndefined();
      expect(compras.rowsInserted).toBe(1);
      expect(compras.adjustments?.join(' ')).toContain('purchased_by');

      const raw = (await db!.execute(
        sql`SELECT purchased_by, liters_purchased FROM fuel_purchases WHERE id = ${idCompra}`,
      )) as any;
      const linhas = Array.isArray(raw[0]) ? raw[0] : raw;
      expect(linhas.length).toBe(1);
      // A compra existe — é ela que fecha a conta — mas sem comprador atribuído.
      expect(linhas[0].purchased_by).toBeNull();
      expect(Number(linhas[0].liters_purchased)).toBe(5000);
    } finally {
      await limpar();
    }
  });
});
