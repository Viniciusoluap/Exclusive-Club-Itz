import mysql from 'mysql2/promise';
import fs from 'fs';

/**
 * Abre a conexão do backup, com SSL quando o servidor aceita.
 *
 * POR QUE NÃO É UM `createConnection` DIRETO: o backup exigia SSL de forma
 * incondicional (`ssl: { rejectUnauthorized: false }`). O TiDB Cloud de
 * produção aceita SSL, então lá funcionava — mas contra qualquer servidor sem
 * SSL o backup morria com "Server does not support secure connection", que não
 * diz nada sobre backup e manda procurar no lugar errado. Foi assim que o CI
 * quebrou: o TiDB efêmero dele não fala SSL.
 *
 * Tenta com SSL primeiro (produção depende disso e não pode mudar de
 * comportamento) e só cai para conexão simples quando o servidor recusa o
 * handshake. Qualquer outro erro sobe — credencial errada ou host inacessível
 * não podem ser confundidos com "servidor sem SSL".
 */
export async function connectForBackup(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}): Promise<mysql.Connection> {
  try {
    return await mysql.createConnection({
      ...config,
      ssl: { rejectUnauthorized: false },
    });
  } catch (error: any) {
    if (error?.code !== 'HANDSHAKE_NO_SSL_SUPPORT') throw error;
    console.warn('[backup] Servidor sem SSL — conectando sem criptografia de transporte.');
    return mysql.createConnection(config);
  }
}

/**
 * Chamado a cada tabela concluída, para a tela mostrar progresso real.
 *
 * É por tabela CONCLUÍDA, e não por tempo decorrido, de propósito: uma barra
 * cronometrada continua andando quando o processo travou, que é exatamente a
 * situação que ela deveria denunciar.
 */
export type ProgressoExportacao = (feitas: number, total: number, tabela: string) => void;

/** Um objeto do banco: tabela de dados ou view. */
type ObjetoDoBanco = { nome: string; ehView: boolean };

/**
 * Lista tabelas e views, separando uma coisa da outra.
 *
 * POR QUE `SHOW FULL TABLES` E NÃO `SHOW TABLES`: o `SHOW TABLES` devolve views
 * misturadas com tabelas, sem dizer qual é qual. O código antigo tratava tudo
 * como tabela, chamava `SHOW CREATE TABLE` numa view e recebia `undefined` —
 * que ia parar dentro do arquivo de backup como a palavra literal `undefined;`.
 *
 * O resultado era um backup que parecia bem-sucedido e não restaurava: a linha
 * `undefined;` é erro de sintaxe, e o `INSERT` seguinte apontava para uma tabela
 * que não existia. Encontrado em produção pela conferência de backup, no banco
 * real, numa view legada (`financial_charges`) que nenhum código usa mais.
 */
async function listarObjetos(connection: mysql.Connection): Promise<ObjetoDoBanco[]> {
  const [linhas] = await connection.query<any[]>('SHOW FULL TABLES');
  return linhas.map((linha: any) => {
    const valores = Object.values(linha);
    return {
      nome: String(valores[0]),
      // 'BASE TABLE' | 'VIEW' | 'SYSTEM VIEW'
      ehView: String(valores[1] ?? 'BASE TABLE').toUpperCase().includes('VIEW'),
    };
  });
}

/**
 * Remove a cláusula `DEFINER=usuario@host` do `CREATE VIEW`.
 *
 * O definer aponta para um usuário do servidor de origem. Restaurar num
 * servidor novo — que é justamente o cenário de desastre — falha com "user does
 * not exist". Sem a cláusula, o MySQL adota quem está restaurando.
 */
export function semDefiner(ddl: string): string {
  return ddl.replace(/\sDEFINER\s*=\s*(`[^`]*`|'[^']*'|\S+)@(`[^`]*`|'[^']*'|\S+)/i, '');
}

/**
 * Exporta banco de dados MySQL/TiDB para arquivo SQL usando Node.js puro
 * Não depende de mysqldump ou ferramentas externas
 */
export async function exportDatabaseToSQL(
  dbBackupPath: string,
  onProgress?: ProgressoExportacao,
): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL não configurada');
  }

  // Parse da URL de conexão.
  //
  // A senha usa `[^@]*` e não `[^@]+`: senha vazia (`mysql://root:@host/db`) é
  // uma URL válida e acontece em ambientes locais e de teste. Com `+`, o
  // backup morria com "Formato de DATABASE_URL inválido" — mensagem que
  // aponta para o lugar errado, porque a URL está correta.
  const urlMatch = databaseUrl.match(/mysql:\/\/([^:]+):([^@]*)@([^:]+):(\d+)\/(.+)/);
  
  if (!urlMatch) {
    throw new Error('Formato de DATABASE_URL inválido');
  }

  const [, user, password, host, port, database] = urlMatch;
  const dbName = database.split('?')[0];

  console.log(`📊 Conectando ao banco: ${dbName}@${host}:${port}`);

  const connection = await connectForBackup({
    host,
    port: parseInt(port),
    user,
    password,
    database: dbName,
  });

  try {
    const sqlStatements: string[] = [];

    // Header do arquivo SQL
    sqlStatements.push('-- Exclusive Club - Database Backup');
    sqlStatements.push(`-- Generated: ${new Date().toISOString()}`);
    sqlStatements.push(`-- Database: ${dbName}`);
    sqlStatements.push('');
    sqlStatements.push('SET NAMES utf8mb4;');
    sqlStatements.push('SET FOREIGN_KEY_CHECKS = 0;');
    sqlStatements.push('');

    // Tabelas e views são coisas diferentes e precisam de tratamento diferente.
    const objetos = await listarObjetos(connection);
    const tabelas = objetos.filter((o) => !o.ehView);
    const views = objetos.filter((o) => o.ehView);
    const total = objetos.length;

    console.log(`📋 Exportando ${tabelas.length} tabelas e ${views.length} views...`);

    let feitas = 0;
    for (const { nome: tableName } of tabelas) {
      console.log(`  → ${tableName}`);

      // Obtém estrutura da tabela
      const [createTableResult] = await connection.query<any[]>(`SHOW CREATE TABLE \`${tableName}\``);
      const createTableSQL = createTableResult[0]?.['Create Table'];

      // Nunca escrever no arquivo algo que não seja DDL. Um backup que falha
      // alto é recuperável; um que grava lixo e diz "sucesso" não é.
      if (typeof createTableSQL !== 'string' || !createTableSQL.trim()) {
        throw new Error(
          `Não foi possível obter a estrutura da tabela \`${tableName}\`. ` +
            'O backup foi interrompido para não gerar um arquivo inválido.',
        );
      }

      sqlStatements.push(`-- Table: ${tableName}`);
      sqlStatements.push(`DROP TABLE IF EXISTS \`${tableName}\`;`);
      sqlStatements.push(createTableSQL + ';');
      sqlStatements.push('');

      // Obtém dados da tabela
      const [rows] = await connection.query<any[]>(`SELECT * FROM \`${tableName}\``);

      if (rows.length > 0) {
        // Obtém nomes das colunas
        const columns = Object.keys(rows[0]);
        const columnNames = columns.map(col => `\`${col}\``).join(', ');

        sqlStatements.push(`-- Data for table: ${tableName}`);
        
        // Insere dados em lotes de 100 registros
        const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const values = batch.map(row => {
            const rowValues = columns.map(col => {
              const value = row[col];
              if (value === null) return 'NULL';
              if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
              if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
              if (typeof value === 'boolean') return value ? '1' : '0';
              return value;
            });
            return `(${rowValues.join(', ')})`;
          });

          sqlStatements.push(`INSERT INTO \`${tableName}\` (${columnNames}) VALUES`);
          sqlStatements.push(values.join(',\n') + ';');
        }
        
        sqlStatements.push('');
      }

      // Avisa DEPOIS de gravar a tabela: o progresso reflete trabalho
      // concluído, nunca trabalho iniciado.
      feitas++;
      onProgress?.(feitas, total, tableName);
    }

    // As views vêm DEPOIS de todas as tabelas: uma view é uma consulta salva, e
    // criá-la antes das tabelas que ela lê falha na restauração.
    //
    // View não tem dado próprio — o dado mora nas tabelas de origem. Exportar
    // as linhas de uma view duplicaria o que já está no arquivo e, na
    // restauração, tentaria inserir num objeto que não aceita INSERT.
    for (const { nome: viewName } of views) {
      console.log(`  → (view) ${viewName}`);

      const [criacao] = await connection.query<any[]>(`SHOW CREATE VIEW \`${viewName}\``);
      const createViewSQL = criacao[0]?.['Create View'];

      if (typeof createViewSQL !== 'string' || !createViewSQL.trim()) {
        throw new Error(
          `Não foi possível obter a definição da view \`${viewName}\`. ` +
            'O backup foi interrompido para não gerar um arquivo inválido.',
        );
      }

      sqlStatements.push(`-- View: ${viewName}`);
      sqlStatements.push(`DROP VIEW IF EXISTS \`${viewName}\`;`);
      sqlStatements.push(semDefiner(createViewSQL) + ';');
      sqlStatements.push('');

      feitas++;
      onProgress?.(feitas, total, viewName);
    }

    // Footer
    sqlStatements.push('SET FOREIGN_KEY_CHECKS = 1;');
    sqlStatements.push('');
    sqlStatements.push('-- Backup completed successfully');

    // Salva arquivo
    fs.writeFileSync(dbBackupPath, sqlStatements.join('\n'), 'utf8');
    
    console.log(`✅ Banco exportado: ${dbBackupPath}`);
    console.log(`📦 Tamanho: ${(fs.statSync(dbBackupPath).size / 1024 / 1024).toFixed(2)} MB`);

  } finally {
    await connection.end();
  }
}
