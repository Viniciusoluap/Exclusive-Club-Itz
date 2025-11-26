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

  const title = `Reserva Confirmada - ${data.vesselName} - ${data.clientName}`;
  const content = `
DESTINATÁRIO: ${data.clientEmail}
NOME: ${data.clientName}

========================================
CONFIRMAÇÃO DE RESERVA
Exclusive Club - Sistema de Reservas
========================================

Olá ${data.clientName},

Sua reserva foi confirmada com sucesso.

DETALHES DA RESERVA:
- Embarcação: ${data.vesselName}
- Data: ${dateStr}
${data.notes ? `- Observações: ${data.notes}` : ''}

Em caso de dúvidas, entre em contato conosco.

Atenciosamente,
Equipe Exclusive Club

========================================
Esta é uma mensagem automática.
Por favor, não responda este email.
========================================
  `.trim();

  return await notifyOwner({ title, content });
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

  const title = `Reserva Cancelada - ${data.vesselName} - ${data.clientName}`;
  const content = `
DESTINATÁRIO: ${data.clientEmail}
NOME: ${data.clientName}

========================================
CANCELAMENTO DE RESERVA
Exclusive Club - Sistema de Reservas
========================================

Olá ${data.clientName},

Sua reserva foi cancelada conforme solicitado.

DETALHES DA RESERVA CANCELADA:
- Embarcação: ${data.vesselName}
- Data: ${dateStr}

Se precisar fazer uma nova reserva, acesse nosso sistema.

Atenciosamente,
Equipe Exclusive Club

========================================
Esta é uma mensagem automática.
Por favor, não responda este email.
========================================
  `.trim();

  return await notifyOwner({ title, content });
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
