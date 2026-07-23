import { config } from 'dotenv';
config();

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_API_URL = ASAAS_API_KEY?.startsWith('$aact_prod_')
  ? 'https://api.asaas.com/v3'
  : 'https://sandbox.asaas.com/api/v3';

const chargeId = 'pay_d43p3x9hbhqfbfso';

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
    console.log('\n=== Resposta GET /payments/{id} ===');
    console.log('Status:', response.status);
    console.log('billingType:', data.billingType);
    console.log('status:', data.status);
    console.log('value:', data.value);
    console.log('encodedImage existe?', !!data.encodedImage);
    console.log('payload existe?', !!data.payload);
    
    if (data.encodedImage) {
      console.log('✅ encodedImage length:', data.encodedImage.length);
    } else {
      console.log('❌ encodedImage NÃO existe');
    }
    if (data.payload) {
      console.log('✅ payload length:', data.payload.length);
    } else {
      console.log('❌ payload NÃO existe');
    }
    
    // Tentar buscar QR Code no endpoint específico
    console.log('\n=== Testando GET /payments/{id}/pixQrCode ===');
    const pixResponse = await fetch(`${ASAAS_API_URL}/payments/${chargeId}/pixQrCode`, {
      method: 'GET',
      headers: {
        'access_token': ASAAS_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    
    console.log('Status:', pixResponse.status);
    
    if (pixResponse.ok) {
      const pixData = await pixResponse.json();
      console.log('encodedImage existe?', !!pixData.encodedImage);
      console.log('payload existe?', !!pixData.payload);
      
      if (pixData.encodedImage) {
        console.log('✅ QR Code encontrado! Length:', pixData.encodedImage.length);
      }
    } else {
      const errorData = await pixResponse.json();
      console.log('❌ Erro:', errorData);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

testGetCharge();
