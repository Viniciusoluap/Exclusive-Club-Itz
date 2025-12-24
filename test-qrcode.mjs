import { config } from 'dotenv';
config();

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_API_URL = ASAAS_API_KEY?.startsWith('$aact_prod_')
  ? 'https://api.asaas.com/v3'
  : 'https://sandbox.asaas.com/api/v3';

// ID da cobrança de teste (vamos buscar do banco)
const chargeId = 'pay_8056088774976683'; // Exemplo

async function testGetCharge() {
  console.log('=== Testando busca de cobrança ===');
  console.log('API URL:', ASAAS_API_URL);
  console.log('Charge ID:', chargeId);
  
  try {
    const response = await fetch(`${ASAAS_API_URL}/payments/${chargeId}`, {
      method: 'GET',
      headers: {
        'access_token': ASAAS_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    console.log('\n=== Resposta da API ===');
    console.log('Status:', response.status);
    console.log('billingType:', data.billingType);
    console.log('status:', data.status);
    console.log('value:', data.value);
    console.log('encodedImage existe?', !!data.encodedImage);
    console.log('payload existe?', !!data.payload);
    
    if (data.encodedImage) {
      console.log('encodedImage length:', data.encodedImage.length);
    }
    if (data.payload) {
      console.log('payload length:', data.payload.length);
    }
    
    // Tentar buscar QR Code no endpoint específico
    console.log('\n=== Testando endpoint /pixQrCode ===');
    const pixResponse = await fetch(`${ASAAS_API_URL}/payments/${chargeId}/pixQrCode`, {
      method: 'GET',
      headers: {
        'access_token': ASAAS_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    
    console.log('Status:', pixResponse.status);
    const pixData = await pixResponse.json();
    console.log('encodedImage existe?', !!pixData.encodedImage);
    console.log('payload existe?', !!pixData.payload);
    
  } catch (error) {
    console.error('Erro:', error.message);
  }
}

testGetCharge();
