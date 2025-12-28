import mysql from 'mysql2/promise';

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Verificar compras do Galão 1
  const [compras] = await connection.execute(`
    SELECT SUM(liters_purchased) / 100 as total_litros FROM fuel_purchases WHERE gallon_number = 1
  `);
  
  // Verificar abastecimentos do Galão 1
  const [abastecimentos] = await connection.execute(`
    SELECT SUM(liters) / 100 as total_litros FROM fuel_records WHERE gallon_number = 1
  `);
  
  // Verificar tabela gallon_stock
  const [gallonStock] = await connection.execute(`
    SELECT * FROM gallon_stock WHERE gallon_number = 1
  `);
  
  const comprasLitros = Number(compras[0].total_litros) || 0;
  const abastecimentosLitros = Number(abastecimentos[0].total_litros) || 0;
  const estoqueCalculado = comprasLitros - abastecimentosLitros;
  
  console.log('=== GALÃO 1 - ANÁLISE ===');
  console.log('Compras (litros):', comprasLitros);
  console.log('Abastecimentos (litros):', abastecimentosLitros);
  console.log('Estoque Calculado:', estoqueCalculado.toFixed(2), 'L');
  console.log('Esperado pelo usuário: 10.79 L');
  console.log('\n--- TABELA gallon_stock ---');
  console.log('stock_liters na tabela:', gallonStock[0]?.stock_liters);
  console.log('stock_liters / 100:', (gallonStock[0]?.stock_liters || 0) / 100);
  
  await connection.end();
}

main().catch(console.error);
