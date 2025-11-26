import * as db from "./db";
import { sendEmail } from "./_core/emailService";

/**
 * Busca reservas que acontecerão em aproximadamente 24h
 * 
 * @returns Array de reservas que precisam de lembrete
 */
export async function getBookingsNeedingReminder() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Buscar reservas entre 23h e 25h a partir de agora
  const startWindow = new Date(now);
  startWindow.setHours(startWindow.getHours() + 23);
  
  const endWindow = new Date(now);
  endWindow.setHours(endWindow.getHours() + 25);
  
  // Buscar todas as reservas
  const allBookings = await db.getBookings();
  
  return allBookings.filter((booking: any) => {
    if (booking.status !== 'confirmed') return false;
    
    const bookingDate = new Date(booking.bookingDate);
    return bookingDate >= startWindow && bookingDate <= endWindow;
  });
}

/**
 * Envia lembrete por email para uma reserva
 * 
 * @param booking Dados da reserva
 * @returns true se enviado com sucesso
 */
export async function sendBookingReminder(booking: {
  clientName: string;
  clientEmail: string;
  vesselName: string;
  bookingDate: Date;
  quotaName?: string;
}): Promise<boolean> {
  const dateStr = booking.bookingDate.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  const timeStr = booking.bookingDate.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const subject = "Lembrete de Reserva - Exclusive Club";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb;">
      <div style="background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); padding: 40px 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Exclusive Club</h1>
      </div>
      
      <div style="background-color: white; padding: 40px 30px; border-radius: 8px; margin: 20px;">
        <h2 style="color: #0891b2; margin-top: 0;">Lembrete de Reserva</h2>
        
        <p style="font-size: 16px; color: #374151;">Prezado(a) <strong>${booking.clientName}</strong>,</p>
        
        <p style="font-size: 16px; color: #374151; line-height: 1.6;">
          Lembramos que sua reserva está confirmada para <strong style="color: #0891b2;">amanhã</strong>. Seguem os detalhes:
        </p>
        
        <div style="background-color: #f0f9ff; padding: 20px; margin: 20px 0; border-left: 4px solid #0891b2;">
          <p style="margin: 8px 0; color: #1f2937;"><strong>📅 Data:</strong> ${dateStr}</p>
          <p style="margin: 8px 0; color: #1f2937;"><strong>⏰ Horário:</strong> ${timeStr}</p>
          <p style="margin: 8px 0; color: #1f2937;"><strong>⛵ Embarcação:</strong> ${booking.vesselName}</p>
          ${booking.quotaName ? `<p style="margin: 8px 0; color: #1f2937;"><strong>🎫 Cota:</strong> ${booking.quotaName}</p>` : ''}
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            <strong>⚠️ Dicas importantes:</strong>
          </p>
          <ul style="margin: 10px 0; padding-left: 20px; color: #92400e; font-size: 14px;">
            <li>Chegue com 15 minutos de antecedência</li>
            <li>Traga documentos pessoais</li>
            <li>Use protetor solar e trajes adequados</li>
            <li>Verifique as condições climáticas</li>
          </ul>
        </div>
        
        <p style="font-size: 16px; color: #374151; line-height: 1.6;">
          Agradecemos a preferência e aguardamos sua presença.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="font-size: 14px; color: #6b7280; text-align: center;">
          Atenciosamente,<br>
          <strong>Equipe Exclusive Club</strong>
        </p>
        
        <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 20px;">
          Em caso de dúvidas ou necessidade de cancelamento, solicitamos que entre em contato com antecedência.
        </p>
      </div>
    </div>
  `;

  console.log(`[Reminders] Enviando lembrete para ${booking.clientEmail}`);
  
  return await sendEmail({
    to: booking.clientEmail,
    subject,
    html,
  });
}

/**
 * Processa todos os lembretes pendentes
 * 
 * @returns Número de lembretes enviados
 */
export async function processReminders(): Promise<number> {
  console.log('[Reminders] Iniciando processamento de lembretes...');
  
  const bookings = await getBookingsNeedingReminder();
  console.log(`[Reminders] Encontradas ${bookings.length} reservas para lembrete`);
  
  let sentCount = 0;
  
  for (const booking of bookings) {
    try {
      const success = await sendBookingReminder({
        clientName: booking.clientName,
        clientEmail: booking.clientEmail,
        vesselName: booking.vesselName,
        bookingDate: new Date(booking.bookingDate),
        // quotaName: booking.quotaName, // Campo não existe no schema
      });
      
      if (success) {
        sentCount++;
        console.log(`[Reminders] Lembrete enviado para ${booking.clientEmail}`);
      }
    } catch (error) {
      console.error(`[Reminders] Erro ao enviar lembrete para ${booking.clientEmail}:`, error);
    }
  }
  
  console.log(`[Reminders] Processamento concluído: ${sentCount}/${bookings.length} lembretes enviados`);
  return sentCount;
}
