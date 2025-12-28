import mysql from 'mysql2/promise';

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('=== ESTOQUE DE TODOS OS GALÕES ===\n');
  
  for (let gallon = 1; gallon <= 3; gallon++) {
    const [compras] = await connection.execute(`
      SELECT COALESCE(SUM(liters_purchased), 0) / 100 as total FROM fuel_purchases WHERE gallon_number = ?
    `, [gallon]);
    
    const [abastecimentos] = await connection.execute(`
      SELECT COALESCE(SUM(liters), 0) / 100 as total FROM fuel_records WHERE gallon_number = ?
    `, [gallon]);
    
    const comprasLitros = Number(compras[0].total) || 0;
    const abastecimentosLitros = Number(abastecimentos[0].total) || 0;
    const estoque = comprasLitros - abastecimentosLitros;
    
    console.log(`GALÃO ${gallon}:`);
    console.log(`  Compras: ${comprasLitros.toFixed(2)} L`);
    console.log(`  Abastecimentos: ${abastecimentosLitros.toFixed(2)} L`);
    console.log(`  Estoque: ${estoque.toFixed(2)} L`);
    console.log('');
  }
  
  // Total
  const [totalCompras] = await connection.execute(`
    SELECT COALESCE(SUM(liters_purchased), 0) / 100 as total FROM fuel_purchases
  `);
  const [totalAbastecimentos] = await connection.execute(`
    SELECT COALESCE(SUM(liters), 0) / 100 as total FROM fuel_records
  `);
  
  const tc = Number(totalCompras[0].total) || 0;
  const ta = Number(totalAbastecimentos[0].total) || 0;
  
  console.log('=== TOTAL GERAL ===');
  console.log(`Compras: ${tc.toFixed(2)} L`);
  console.log(`Abastecimentos: ${ta.toFixed(2)} L`);
  console.log(`Estoque Total: ${(tc - ta).toFixed(2)} L`);
  
  await connection.end();
}

main().catch(console.error);
