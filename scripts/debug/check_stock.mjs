import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

console.log('\n=== Verificar containers órfãos ===');
const [orphans] = await connection.execute(`
  SELECT frc.* 
  FROM fuel_record_containers frc
  LEFT JOIN fuel_records fr ON frc.fuel_record_id = fr.id
  WHERE fr.id IS NULL
`);
console.log('Containers órfãos:', orphans.length);

console.log('\n=== Estoque atual por galão ===');
const [stock] = await connection.execute(`
  SELECT 
    g.gallon_number,
    COALESCE(p.total_purchased, 0) / 100.0 as comprado_L,
    COALESCE(r.total_refueled, 0) / 100.0 as abastecido_L,
    (COALESCE(p.total_purchased, 0) - COALESCE(r.total_refueled, 0)) / 100.0 as estoque_L
  FROM gallon_stock g
  LEFT JOIN (
    SELECT gallon_number, SUM(liters_purchased) as total_purchased
    FROM fuel_purchases
    GROUP BY gallon_number
  ) p ON g.gallon_number = p.gallon_number
  LEFT JOIN (
    SELECT gallon_number, SUM(liters_used) as total_refueled FROM (
      SELECT fr.gallon_number, fr.liters as liters_used
      FROM fuel_records fr
      WHERE NOT EXISTS (SELECT 1 FROM fuel_record_containers frc WHERE frc.fuel_record_id = fr.id)
      UNION ALL
      SELECT frc.gallon_number, frc.liters_used
      FROM fuel_record_containers frc
    ) combined
    GROUP BY gallon_number
  ) r ON g.gallon_number = r.gallon_number
  ORDER BY g.gallon_number
`);
console.table(stock);

await connection.end();
