import { notifyOwner } from "./notification";
import { sendEmail } from "./emailService";

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
 * Nota: Envia notificação ao owner com as informações do cliente.
 * Para enviar emails diretamente aos clientes, será necessário integrar
 * um serviço de email como SendGrid, AWS SES, Mailgun, etc.
 */
export async function notifyClientBookingConfirmation(data: BookingNotificationData): Promise<boolean> {
  const dateStr = data.bookingDate.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = "🎉 Reserva Confirmada - Exclusive Club";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: #0891b2; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">🎉 Reserva Confirmada!</h1>
      </div>
      
      <div style="background-color: white; padding: 30px;">
        <p style="font-size: 16px; color: #374151;">Olá <strong>${data.clientName}</strong>,</p>
        
        <p style="font-size: 16px; color: #374151;">Sua reserva foi <strong style="color: #059669;">confirmada com sucesso</strong>!</p>
        
        <div style="background-color: #f0f9ff; padding: 20px; margin: 20px 0; border-left: 4px solid #0891b2;">
          <p style="margin: 8px 0; color: #1f2937;"><strong>📅 Data:</strong> ${dateStr}</p>
          <p style="margin: 8px 0; color: #1f2937;"><strong>⛵ Embarcação:</strong> ${data.vesselName}</p>
          ${data.notes ? `<p style="margin: 8px 0; color: #1f2937;"><strong>📝 Observações:</strong> ${data.notes}</p>` : ''}
        </div>
        
        <p style="font-size: 16px; color: #374151;">Estamos ansiosos para proporcionar momentos inesquecíveis!</p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="font-size: 14px; color: #6b7280; text-align: center;">
          Atenciosamente,<br>
          <strong>Equipe Exclusive Club</strong>
        </p>
      </div>
    </div>
  `;

  console.log(`[Email] Enviando confirmação de reserva para ${data.clientEmail}`);
  
  return await sendEmail({
    to: data.clientEmail,
    subject,
    html,
  });
}

/**
 * Envia notificação de cancelamento para o cliente
 */
export async function notifyClientBookingCancellation(data: BookingCancellationData): Promise<boolean> {
  const dateStr = data.bookingDate.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = "⚠️ Reserva Cancelada - Exclusive Club";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: #dc2626; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">⚠️ Reserva Cancelada</h1>
      </div>
      
      <div style="background-color: white; padding: 30px;">
        <p style="font-size: 16px; color: #374151;">Olá <strong>${data.clientName}</strong>,</p>
        
        <p style="font-size: 16px; color: #374151;">Informamos que sua reserva foi <strong style="color: #dc2626;">cancelada</strong>.</p>
        
        <div style="background-color: #fef2f2; padding: 20px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 8px 0; color: #1f2937;"><strong>📅 Data:</strong> ${dateStr}</p>
          <p style="margin: 8px 0; color: #1f2937;"><strong>⛵ Embarcação:</strong> ${data.vesselName}</p>
        </div>
        
        <p style="font-size: 16px; color: #374151;">Se precisar fazer uma nova reserva, acesse nosso sistema.</p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="font-size: 14px; color: #6b7280; text-align: center;">
          Atenciosamente,<br>
          <strong>Equipe Exclusive Club</strong>
        </p>
      </div>
    </div>
  `;

  console.log(`[Email] Enviando cancelamento de reserva para ${data.clientEmail}`);
  
  return await sendEmail({
    to: data.clientEmail,
    subject,
    html,
  });
}

export interface MaintenanceCancellationData {
  clientName: string;
  clientEmail: string;
  vesselName: string;
  bookingDate: Date;
  maintenanceStartDate: Date;
  maintenanceEndDate: Date;
  maintenanceDescription?: string;
}

/**
 * Notifica cliente que sua reserva foi cancelada devido a manutenção
 */
export async function notifyClientMaintenanceCancellation(data: MaintenanceCancellationData): Promise<boolean> {
  // TODO: Implementar envio de email direto para o cliente
  const bookingDateStr = data.bookingDate.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const maintenanceStartStr = data.maintenanceStartDate.toLocaleDateString('pt-BR');
  const maintenanceEndStr = data.maintenanceEndDate.toLocaleDateString('pt-BR');
  
  console.log(`[Email] Notificação de cancelamento por manutenção seria enviada para ${data.clientEmail}`);
  console.log(`Assunto: Reserva Cancelada - Manutenção Programada`);
  console.log(`Corpo: Olá ${data.clientName}, sua reserva para ${data.vesselName} no dia ${bookingDateStr} foi cancelada devido a uma manutenção programada entre ${maintenanceStartStr} e ${maintenanceEndStr}.`);
  if (data.maintenanceDescription) {
    console.log(`Motivo: ${data.maintenanceDescription}`);
  }
  return true;
}

/**
 * Notifica admin sobre reservas canceladas devido a manutenção
 */
export async function notifyAdminMaintenanceCancellations(data: {
  vesselName: string;
  maintenanceStartDate: Date;
  maintenanceEndDate: Date;
  cancelledBookings: Array<{
    clientName: string;
    clientEmail: string;
    bookingDate: Date;
  }>;
}): Promise<boolean> {
  const startStr = data.maintenanceStartDate.toLocaleDateString('pt-BR');
  const endStr = data.maintenanceEndDate.toLocaleDateString('pt-BR');
  
  const bookingsList = data.cancelledBookings.map(b => {
    const dateStr = b.bookingDate.toLocaleDateString('pt-BR');
    return `- ${b.clientName} (${b.clientEmail}) - ${dateStr}`;
  }).join('\n');

  const title = "⚠️ Reservas Canceladas - Manutenção Criada";
  const content = `
**Embarcação:** ${data.vesselName}
**Período de Manutenção:** ${startStr} a ${endStr}
**Total de reservas canceladas:** ${data.cancelledBookings.length}

**Reservas afetadas:**
${bookingsList}

Os clientes foram notificados sobre o cancelamento.
  `.trim();

  return await notifyOwner({ title, content });
}

export interface MaintenanceStatusChangeData {
  vesselName: string;
  oldStatus: string;
  newStatus: string;
  startDate: Date;
  endDate: Date;
  description?: string;
}

/**
 * Traduz status de manutenção para português
 */
function translateMaintenanceStatus(status: string): string {
  const translations: Record<string, string> = {
    'scheduled': 'Agendada',
    'in_progress': 'Em Andamento',
    'completed': 'Concluída',
    'cancelled': 'Cancelada',
  };
  return translations[status] || status;
}

/**
 * Notifica admin sobre mudança de status de manutenção
 */
export async function notifyAdminMaintenanceStatusChange(data: MaintenanceStatusChangeData): Promise<boolean> {
  const startStr = data.startDate.toLocaleDateString('pt-BR');
  const endStr = data.endDate.toLocaleDateString('pt-BR');
  const oldStatusPt = translateMaintenanceStatus(data.oldStatus);
  const newStatusPt = translateMaintenanceStatus(data.newStatus);

  const title = `🔧 Status de Manutenção Alterado - ${data.vesselName}`;
  const content = `
========================================
ALTERAÇÃO DE STATUS DE MANUTENÇÃO
Exclusive Club - Sistema de Reservas
========================================

Embarcação: ${data.vesselName}
Período: ${startStr} a ${endStr}

Status Anterior: ${oldStatusPt}
Novo Status: ${newStatusPt}

${data.description ? `Descrição: ${data.description}` : ''}

========================================
Esta é uma notificação automática.
========================================
  `.trim();

  return await notifyOwner({ title, content });
}

/**
 * Notifica clientes afetados sobre mudança de status de manutenção
 */
export async function notifyClientsMaintenanceStatusChange(data: {
  vesselName: string;
  newStatus: string;
  startDate: Date;
  endDate: Date;
  affectedClients: Array<{
    clientName: string;
    clientEmail: string;
    bookingDate: Date;
  }>;
}): Promise<boolean> {
  const startStr = data.startDate.toLocaleDateString('pt-BR');
  const endStr = data.endDate.toLocaleDateString('pt-BR');
  const newStatusPt = translateMaintenanceStatus(data.newStatus);

  // Enviar notificação para cada cliente afetado
  for (const client of data.affectedClients) {
    const bookingDateStr = client.bookingDate.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const title = `Atualização de Manutenção - ${data.vesselName} - ${client.clientName}`;
    const content = `
DESTINATÁRIO: ${client.clientEmail}
NOME: ${client.clientName}

========================================
ATUALIZAÇÃO DE MANUTENÇÃO
Exclusive Club - Sistema de Reservas
========================================

Olá ${client.clientName},

Informamos que o status da manutenção da embarcação ${data.vesselName} foi atualizado.

DETALHES:
- Embarcação: ${data.vesselName}
- Período de Manutenção: ${startStr} a ${endStr}
- Novo Status: ${newStatusPt}
- Sua Reserva: ${bookingDateStr}

${data.newStatus === 'completed' || data.newStatus === 'cancelled' 
  ? 'A manutenção foi finalizada. Você pode fazer novas reservas para esta embarcação.' 
  : 'A manutenção está em andamento. Sua reserva pode ser afetada.'}

Em caso de dúvidas, entre em contato conosco.

Atenciosamente,
Equipe Exclusive Club

========================================
Esta é uma mensagem automática.
Por favor, não responda este email.
========================================
    `.trim();

    await notifyOwner({ title, content });
  }

  return true;
}
