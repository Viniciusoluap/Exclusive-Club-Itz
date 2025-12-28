import mysql from 'mysql2/promise';

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Listar todas as compras do Galão 1
  const [compras] = await connection.execute(`
    SELECT id, liters_purchased / 100 as litros, amount_paid / 100 as valor, notes, DATE(created_at) as data
    FROM fuel_purchases 
    WHERE gallon_number = 1
    ORDER BY created_at DESC
  `);
  
  console.log('=== TODAS AS COMPRAS DO GALÃO 1 ===');
  let total = 0;
  compras.forEach((c, i) => {
    total += Number(c.litros);
    console.log(`${i+1}. ID:${c.id} | ${c.litros}L | R$${c.valor} | ${c.data} | ${c.notes || '-'}`);
  });
  console.log(`\nTOTAL: ${total.toFixed(2)} L`);
  console.log(`Esperado: 373.19 L`);
  console.log(`Diferença: ${(total - 373.19).toFixed(2)} L`);
  
  await connection.end();
}

main().catch(console.error);
