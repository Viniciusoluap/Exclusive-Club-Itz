import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Verificar campos existentes
  const [cols] = await conn.query('DESCRIBE subscription_charges');
  const existing = cols.map(c => c.Field);
  console.log('Campos existentes:', existing.join(', '));
  
  const toAdd = [
    { 
      name: 'net_value', 
      sql: 'ADD COLUMN net_value DECIMAL(10,2) NULL COMMENT "Valor liquido apos taxas Asaas"' 
    },
    { 
      name: 'external_reference', 
      sql: 'ADD COLUMN external_reference VARCHAR(255) NULL COMMENT "Referencia externa no Asaas"' 
    },
    { 
      name: 'billing_type', 
      sql: 'ADD COLUMN billing_type VARCHAR(20) NULL COMMENT "Tipo de cobranca: PIX, BOLETO, CREDIT_CARD"' 
    },
  ];
  
  for (const field of toAdd) {
    if (!existing.includes(field.name)) {
      await conn.query(`ALTER TABLE subscription_charges ${field.sql}`);
      console.log('✅ Adicionado:', field.name);
    } else {
      console.log('⏭️  Já existe:', field.name);
    }
  }
  
  // Verificar resultado final
  const [finalCols] = await conn.query('DESCRIBE subscription_charges');
  console.log('\n📋 Estrutura final de subscription_charges:');
  finalCols.forEach(c => console.log(`  ${c.Field} ${c.Type} ${c.Null === 'YES' ? 'NULL' : 'NOT NULL'}`));
  
  await conn.end();
  console.log('\n✅ Migração Fase 2 concluída!');
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
