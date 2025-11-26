/**
 * Script para enviar lembretes automáticos 24h antes das reservas
 * 
 * Uso:
 * node server/daily-reminders.mjs
 * 
 * Cron (executar todo dia às 9h):
 * 0 9 * * * cd /home/ubuntu/exclusive-club-reservas && node server/daily-reminders.mjs
 */

import { sendReminderEmail } from "./reminders.ts";
import * as db from "./db.ts";

async function main() {
  console.log("[Daily Reminders] Iniciando envio de lembretes...");
  
  const now = Date.now();
  const tomorrow = now + (24 * 60 * 60 * 1000);
  const tomorrowEnd = tomorrow + (24 * 60 * 60 * 1000);
  
  // Buscar reservas confirmadas para amanhã
  const bookings = await db.getBookings({
    startDate: tomorrow,
    endDate: tomorrowEnd,
  });
  
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  
  console.log(`[Daily Reminders] Encontradas ${confirmedBookings.length} reservas para amanhã`);
  
  let sent = 0;
  let failed = 0;
  
  for (const booking of confirmedBookings) {
    try {
      const success = await sendReminderEmail({
        clientName: booking.clientName,
        clientEmail: booking.clientEmail,
        vesselName: booking.vesselName,
        bookingDate: new Date(booking.bookingDate),
      });
      
      if (success) {
        sent++;
        console.log(`[Daily Reminders] ✅ Lembrete enviado para ${booking.clientEmail}`);
      } else {
        failed++;
        console.log(`[Daily Reminders] ❌ Falha ao enviar para ${booking.clientEmail}`);
      }
    } catch (error) {
      failed++;
      console.error(`[Daily Reminders] ❌ Erro ao enviar para ${booking.clientEmail}:`, error);
    }
  }
  
  console.log(`[Daily Reminders] Concluído: ${sent} enviados, ${failed} falhas`);
  process.exit(0);
}

main().catch(error => {
  console.error("[Daily Reminders] Erro fatal:", error);
  process.exit(1);
});
