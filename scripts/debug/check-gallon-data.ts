import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { sql } from 'drizzle-orm';

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);

  console.log('=== COMPRAS POR GALÃO ===');
  const [compras] = await connection.execute(`
    SELECT id, gallon_number, liters_purchased as litros_centesimos, liters_purchased/100 as litros, amount_paid/100 as valor, purchased_at 
    FROM fuel_purchases 
    ORDER BY gallon_number, purchased_at DESC
  `);
  console.table(compras);

  console.log('\n=== SOMA DE COMPRAS POR GALÃO ===');
  const [somaCompras] = await connection.execute(`
    SELECT gallon_number, SUM(liters_purchased)/100 as total_litros, SUM(amount_paid)/100 as total_valor
    FROM fuel_purchases 
    GROUP BY gallon_number
    ORDER BY gallon_number
  `);
  console.table(somaCompras);

  console.log('\n=== ABASTECIMENTOS POR GALÃO (fuel_records) ===');
  const [abastecimentos] = await connection.execute(`
    SELECT gallon_number, SUM(liters)/100 as total_litros
    FROM fuel_records 
    GROUP BY gallon_number
    ORDER BY gallon_number
  `);
  console.table(abastecimentos);

  console.log('\n=== CÁLCULO DO ESTOQUE ===');
  for (const compra of somaCompras as any[]) {
    const gn = compra.gallon_number;
    const abast = (abastecimentos as any[]).find(a => a.gallon_number === gn);
    const totalComprado = Number(compra.total_litros);
    const totalAbastecido = abast ? Number(abast.total_litros) : 0;
    const estoque = totalComprado - totalAbastecido;
    console.log(`Galão ${gn}: Comprado=${totalComprado.toFixed(2)}L - Abastecido=${totalAbastecido.toFixed(2)}L = Estoque=${estoque.toFixed(2)}L`);
  }

  await connection.end();
}

main().catch(console.error);
