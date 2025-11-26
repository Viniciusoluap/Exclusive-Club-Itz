import { processReminders } from './reminders';

/**
 * Script de teste para lembretes automáticos
 * 
 * Execute com: pnpm tsx server/test-reminders.ts
 */

async function testReminders() {
  console.log('🧪 Testando sistema de lembretes automáticos...\n');
  
  try {
    const sentCount = await processReminders();
    
    console.log(`\n✅ Teste concluído!`);
    console.log(`📧 Total de lembretes enviados: ${sentCount}`);
    
    if (sentCount === 0) {
      console.log('\n💡 Nenhuma reserva encontrada para as próximas 24h.');
      console.log('   Para testar, crie uma reserva para amanhã no sistema.');
    }
  } catch (error) {
    console.error('\n❌ Erro ao processar lembretes:', error);
    process.exit(1);
  }
}

testReminders();
