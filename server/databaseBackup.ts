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

    // Lista todas as tabelas
    const [tables] = await connection.query<any[]>('SHOW TABLES');
    
    console.log(`📋 Exportando ${tables.length} tabelas...`);

    let feitas = 0;
    for (const tableRow of tables) {
      const tableName = Object.values(tableRow)[0] as string;
      console.log(`  → ${tableName}`);

      // Obtém estrutura da tabela
      const [createTableResult] = await connection.query<any[]>(`SHOW CREATE TABLE \`${tableName}\``);
      const createTableSQL = createTableResult[0]['Create Table'];

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
      onProgress?.(feitas, tables.length, tableName);
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
