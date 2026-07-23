import { config } from 'dotenv';
config();

console.log('ASAAS_API_KEY exists:', !!process.env.ASAAS_API_KEY);
console.log('Starts with:', process.env.ASAAS_API_KEY?.substring(0, 15));
console.log('Length:', process.env.ASAAS_API_KEY?.length);
