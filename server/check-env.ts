/**
 * Script de verificação de variáveis de ambiente
 */

console.log('=== VERIFICAÇÃO DE VARIÁVEIS DE AMBIENTE ===\n');

console.log('1. ASAAS_API_KEY:');
console.log('   - Está definida?', process.env.ASAAS_API_KEY ? 'SIM ✅' : 'NÃO ❌');
if (process.env.ASAAS_API_KEY) {
  console.log('   - Tamanho:', process.env.ASAAS_API_KEY.length, 'caracteres');
  console.log('   - Primeiros 15 chars:', process.env.ASAAS_API_KEY.substring(0, 15) + '...');
  console.log('   - Começa com $aact_?', process.env.ASAAS_API_KEY.startsWith('$aact_') ? 'SIM ✅' : 'NÃO ❌');
} else {
  console.log('   - Valor: undefined/null');
}

console.log('\n2. Outras variáveis importantes:');
console.log('   - DATABASE_URL:', process.env.DATABASE_URL ? 'SET ✅' : 'NOT SET ❌');
console.log('   - JWT_SECRET:', process.env.JWT_SECRET ? 'SET ✅' : 'NOT SET ❌');
console.log('   - VITE_APP_ID:', process.env.VITE_APP_ID ? 'SET ✅' : 'NOT SET ❌');

console.log('\n3. Todas as variáveis que começam com ASAAS:');
Object.keys(process.env)
  .filter(key => key.startsWith('ASAAS'))
  .forEach(key => {
    const value = process.env[key];
    console.log(`   - ${key}:`, value ? `SET (${value.length} chars)` : 'NOT SET');
  });

console.log('\n=== FIM DA VERIFICAÇÃO ===');
