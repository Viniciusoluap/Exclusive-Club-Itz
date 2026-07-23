import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);
  
  // Verificar gallon_stock
  console.log('\n=== GALLON_STOCK ===');
  const [gallonRows] = await connection.query('SELECT gallon_number, stock_liters, last_price_per_liter FROM gallon_stock ORDER BY gallon_number');
  console.table(gallonRows);
  
  // Verificar compras do galão 1
  console.log('\n=== COMPRAS DO GALÃO 1 ===');
  const [purchaseRows] = await connection.query(`
    SELECT id, gallon_number, 
           liters_purchased/100 as liters, 
           amount_paid/100 as amount, 
           price_per_liter/100 as price_per_liter, 
           purchased_at 
    FROM fuel_purchases 
    WHERE gallon_number = 1 
    ORDER BY purchased_at DESC 
    LIMIT 10
  `);
  console.table(purchaseRows);
  
  // Calcular média correta
  console.log('\n=== CÁLCULO DA MÉDIA ===');
  const [avgResult] = await connection.query(`
    SELECT 
      gallon_number,
      AVG(price_per_liter)/100 as avg_price_per_liter,
      SUM(liters_purchased)/100 as total_liters,
      SUM(amount_paid)/100 as total_amount,
      SUM(amount_paid)/SUM(liters_purchased) as weighted_avg_price
    FROM fuel_purchases 
    WHERE gallon_number = 1
    GROUP BY gallon_number
  `);
  console.table(avgResult);
  
  await connection.end();
}

main().catch(console.error);
