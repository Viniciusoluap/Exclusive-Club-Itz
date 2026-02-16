import { schedule } from 'node-cron';
import { runBackup } from './backup';

/**
 * Agendador de backup automático diário
 * Executa todos os dias às 3h da manhã (horário do servidor)
 */

console.log('🕐 Agendador de Backup Iniciado');
console.log('📅 Backup programado para: Todos os dias às 3h da manhã');
console.log('');

// Agenda backup diário às 3h da manhã
// Formato cron: segundo minuto hora dia mês dia-da-semana
// '0 3 * * *' = às 3:00 AM todos os dias
schedule('0 3 * * *', async () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('⏰ Backup agendado iniciando...');
  console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
  console.log('='.repeat(60));
  console.log('');

  try {
    await runBackup();
    console.log('');
    console.log('✅ Backup agendado concluído com sucesso!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('');
    console.error('❌ Erro no backup agendado:', error);
    console.error('='.repeat(60));
  }
}, {
  timezone: 'America/Sao_Paulo' // Ajuste para seu timezone
});

console.log('✅ Agendador configurado e ativo');
console.log('💡 Mantenha este processo rodando para backups automáticos');
console.log('');

// Mantém o processo rodando
process.on('SIGINT', () => {
  console.log('');
  console.log('🛑 Agendador de backup encerrado');
  process.exit(0);
});
