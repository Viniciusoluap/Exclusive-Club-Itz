import { notifyOwner } from "./notification";

/**
 * Helper para enviar notificações por email usando a API built-in do Manus
 * 
 * Por enquanto, todas as notificações são enviadas para o owner (admin)
 * No futuro, pode-se integrar com serviços de email como SendGrid, AWS SES, etc.
 */

export interface BookingNotificationData {
  clientName: string;
  clientEmail: string;
  vesselName: string;
  bookingDate: Date;
  notes?: string;
}

export interface BookingCancellationData {
  clientName: string;
  clientEmail: string;
  vesselName: string;
  bookingDate: Date;
}

export interface BookingUsedData {
  clientName: string;
  vesselName: string;
  bookingDate: Date;
}

/**
 * Notifica o admin quando uma nova reserva é criada
 */
export async function notifyNewBooking(data: BookingNotificationData): Promise<boolean> {
  const dateStr = data.bookingDate.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const title = "🎉 Nova Reserva Criada!";
  const content = `
**Cliente:** ${data.clientName} (${data.clientEmail})
**Embarcação:** ${data.vesselName}
**Data:** ${dateStr}
${data.notes ? `**Observações:** ${data.notes}` : ''}

Acesse o painel admin para mais detalhes.
  `.trim();

  return await notifyOwner({ title, content });
}

/**
 * Notifica o admin quando uma reserva é cancelada
 */
export async function notifyBookingCancellation(data: BookingCancellationData): Promise<boolean> {
  const dateStr = data.bookingDate.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const title = "❌ Reserva Cancelada";
  const content = `
**Cliente:** ${data.clientName} (${data.clientEmail})
**Embarcação:** ${data.vesselName}
**Data:** ${dateStr}

O cliente cancelou sua reserva.
  `.trim();

  return await notifyOwner({ title, content });
}

/**
 * Notifica o admin quando uma reserva é marcada como usada
 */
export async function notifyBookingUsed(data: BookingUsedData): Promise<boolean> {
  const dateStr = data.bookingDate.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const title = "✅ Reserva Utilizada";
  const content = `
**Cliente:** ${data.clientName}
**Embarcação:** ${data.vesselName}
**Data:** ${dateStr}

A reserva foi marcada como utilizada com sucesso.
  `.trim();

  return await notifyOwner({ title, content });
}

/**
 * Envia confirmação de reserva para o cliente
 * 
 * Nota: Por enquanto, apenas notifica o admin.
 * Para enviar emails diretamente aos clientes, será necessário integrar
 * um serviço de email como SendGrid, AWS SES, Mailgun, etc.
 */
export async function notifyClientBookingConfirmation(data: BookingNotificationData): Promise<boolean> {
  // TODO: Implementar envio de email direto para o cliente
  // Por enquanto, apenas registra que a notificação seria enviada
  console.log(`[Email] Confirmação de reserva seria enviada para ${data.clientEmail}`);
  return true;
}

/**
 * Envia notificação de cancelamento para o cliente
 */
export async function notifyClientBookingCancellation(data: BookingCancellationData): Promise<boolean> {
  // TODO: Implementar envio de email direto para o cliente
  console.log(`[Email] Cancelamento de reserva seria enviado para ${data.clientEmail}`);
  return true;
}
