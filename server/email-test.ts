import { sendTestEmail } from './_core/emailService';

/**
 * Script de teste para verificar configuração de email SMTP
 * 
 * Execute com: pnpm tsx server/email-test.ts
 */

async function testEmailConfiguration() {
  console.log('🧪 Testando configuração de email SMTP...\n');
  
  // Substitua pelo email de destino para teste
  const testEmail = 'paulovinicius92@hotmail.com';
  
  console.log(`📧 Enviando email de teste para: ${testEmail}`);
  console.log('⏳ Aguarde...\n');
  
  const success = await sendTestEmail(testEmail);
  
  if (success) {
    console.log('\n✅ Email enviado com sucesso!');
    console.log('📬 Verifique a caixa de entrada (e spam) do email de destino.');
  } else {
    console.log('\n❌ Falha ao enviar email.');
    console.log('\n🔍 Possíveis soluções:');
    console.log('1. Verifique se o email atendimento@exclusiveclubitz.com está criado no painel da Hostgator');
    console.log('2. Confirme a senha do email no cPanel da Hostgator');
    console.log('3. Verifique se o domínio exclusiveclubitz.com está ativo');
    console.log('4. Tente criar um novo email no painel da Hostgator');
    console.log('\n📖 Como acessar:');
    console.log('- Login: https://hostgator.com.br');
    console.log('- Email: paulovinicius92@hotmail.com');
    console.log('- Vá em: Contas de Email → Criar/Gerenciar');
  }
  
  process.exit(success ? 0 : 1);
}

testEmailConfiguration().catch(error => {
  console.error('\n💥 Erro inesperado:', error);
  process.exit(1);
});
