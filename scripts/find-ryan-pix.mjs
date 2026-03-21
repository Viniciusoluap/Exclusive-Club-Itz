import { config } from 'dotenv';
import https from 'https';

// Carregar variáveis de ambiente
config({ path: '.env.local' });
config({ path: '.env' });

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
if (!ASAAS_API_KEY) {
  console.error('ASAAS_API_KEY não encontrada');
  process.exit(1);
}

async function fetchAsaas(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.asaas.com',
      path: `/v3${path}`,
      headers: { 'access_token': ASAAS_API_KEY, 'Content-Type': 'application/json' }
    };
    https.get(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ error: data }); }
      });
    }).on('error', reject);
  });
}

// Buscar clientes com email do Lucas
const customers = await fetchAsaas('/customers?email=Limiransafg@gmail.com&limit=10');
console.log('Clientes encontrados:', JSON.stringify(customers?.data?.map(c => ({ id: c.id, name: c.name, email: c.email })), null, 2));

if (customers?.data?.length > 0) {
  for (const customer of customers.data) {
    console.log(`\nBuscando cobranças RECEIVED do cliente ${customer.name} (${customer.id})...`);
    const charges = await fetchAsaas(`/payments?customer=${customer.id}&status=RECEIVED&limit=20`);
    if (charges?.data) {
      charges.data.forEach(c => {
        console.log(`  ID: ${c.id} | Valor: R$ ${c.value} | Venc: ${c.dueDate} | Desc: ${(c.description || '').substring(0, 60)}`);
      });
    }
  }
}
