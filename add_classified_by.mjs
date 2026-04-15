import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // Verificar se o campo já existe
  const [cols] = await conn.execute(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'bpo_charges' 
    AND COLUMN_NAME = 'classified_by'
  `);
  
  if (Array.isArray(cols) && cols.length > 0) {
    console.log('✅ Campo classified_by já existe na tabela bpo_charges');
  } else {
    await conn.execute(`
      ALTER TABLE bpo_charges 
      ADD COLUMN classified_by ENUM('auto', 'manual', 'unclassified') 
      DEFAULT 'unclassified' 
      AFTER type
    `);
    console.log('✅ Campo classified_by adicionado com sucesso à tabela bpo_charges');
  }
} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await conn.end();
}
