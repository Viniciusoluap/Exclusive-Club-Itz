import { getSetting } from '../../server/systemSettings';

async function main() {
  const keyFromDb = await getSetting('asaas_api_key');
  const apiKey = keyFromDb || process.env.ASAAS_API_KEY || '';
  if (!apiKey) { console.error('NO API KEY'); return; }
  const apiUrl = apiKey.startsWith('$aact_prod_') ? 'https://api.asaas.com/v3' : 'https://sandbox.asaas.com/api/v3';
  
  console.log('API URL:', apiUrl);
  
  // Testar endpoint financialTransactions DEBIT
  const r1 = await fetch(`${apiUrl}/financialTransactions?type=DEBIT&startDate=2025-01-01&limit=10`, {
    headers: { 'access_token': apiKey }
  });
  const d1 = await r1.json();
  console.log('\n=== financialTransactions DEBIT (primeiros 10) ===');
  console.log('Status:', r1.status, '| Total:', d1.totalCount ?? 'N/A');
  if (d1.data?.length) {
    for (const tx of d1.data.slice(0, 5)) {
      console.log(` id=${tx.id} type=${tx.type} value=${tx.value} date=${tx.date} desc="${tx.description}"`);
    }
  } else {
    console.log('Resposta:', JSON.stringify(d1).slice(0, 300));
  }
  
  // Testar endpoint de pagamentos (bills/payments saídos)
  const r2 = await fetch(`${apiUrl}/payments?type=DEBIT&startDate=2025-01-01&limit=10`, {
    headers: { 'access_token': apiKey }
  });
  const d2 = await r2.json();
  console.log('\n=== payments DEBIT ===');
  console.log('Status:', r2.status, '| Total:', d2.totalCount ?? 'N/A');
  if (d2.data?.length) {
    for (const p of d2.data.slice(0, 3)) {
      console.log(` id=${p.id} status=${p.status} value=${p.value} due=${p.dueDate} desc="${p.description}" customer=${p.customer}`);
    }
  } else {
    console.log('Resposta:', JSON.stringify(d2).slice(0, 300));
  }
  
  // Testar endpoint de transferências/PIX saídos
  const r3 = await fetch(`${apiUrl}/transfers?startDate=2025-01-01&limit=10`, {
    headers: { 'access_token': apiKey }
  });
  const d3 = await r3.json();
  console.log('\n=== transfers ===');
  console.log('Status:', r3.status, '| Total:', d3.totalCount ?? 'N/A');
  if (d3.data?.length) {
    for (const t of d3.data.slice(0, 3)) {
      console.log(` id=${t.id} value=${t.value} date=${t.dateCreated} desc="${t.description ?? t.operationType}" status=${t.status}`);
    }
  } else {
    console.log('Resposta:', JSON.stringify(d3).slice(0, 300));
  }
  
  // Testar endpoint de boletos pagos (bills)
  const r4 = await fetch(`${apiUrl}/bills?startDate=2025-01-01&limit=10`, {
    headers: { 'access_token': apiKey }
  });
  const d4 = await r4.json();
  console.log('\n=== bills (boletos pagos) ===');
  console.log('Status:', r4.status, '| Total:', d4.totalCount ?? 'N/A');
  if (d4.data?.length) {
    for (const b of d4.data.slice(0, 3)) {
      console.log(` id=${b.id} value=${b.value} due=${b.dueDate} desc="${b.description}" status=${b.status}`);
    }
  } else {
    console.log('Resposta:', JSON.stringify(d4).slice(0, 300));
  }
}

main().catch(console.error);
