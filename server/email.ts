import { notifyOwner } from "./_core/notification";

/**
 * Serviço de notificações por email
 * Usa a API de notificações do Manus para enviar emails ao owner
 */

interface BookingEmailData {
  clientName: string;
  clientEmail: string;
  vesselName: string;
  bookingDate: Date;
  status: "pending" | "confirmed" | "cancelled";
}

/**
 * Notifica o owner sobre nova reserva criada
 */
export async function sendBookingCreatedNotification(data: BookingEmailData): Promise<boolean> {
  const dateStr = data.bookingDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const title = "🎉 Nova Reserva Criada";
  const content = `
**Cliente:** ${data.clientName} (${data.clientEmail})
**Embarcação:** ${data.vesselName}
**Data:** ${dateStr}
**Status:** ${getStatusLabel(data.status)}

Uma nova reserva foi criada no sistema e aguarda sua confirmação.
  `.trim();

  return await notifyOwner({ title, content });
}

/**
 * Notifica o owner sobre reserva confirmada
 */
export async function sendBookingConfirmedNotification(data: BookingEmailData): Promise<boolean> {
  const dateStr = data.bookingDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const title = "✅ Reserva Confirmada";
  const content = `
**Cliente:** ${data.clientName} (${data.clientEmail})
**Embarcação:** ${data.vesselName}
**Data:** ${dateStr}

A reserva foi confirmada com sucesso.
  `.trim();

  return await notifyOwner({ title, content });
}

/**
 * Notifica o owner sobre reserva cancelada
 */
export async function sendBookingCancelledNotification(data: BookingEmailData): Promise<boolean> {
  const dateStr = data.bookingDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const title = "❌ Reserva Cancelada";
  const content = `
**Cliente:** ${data.clientName} (${data.clientEmail})
**Embarcação:** ${data.vesselName}
**Data:** ${dateStr}

A reserva foi cancelada.
  `.trim();

  return await notifyOwner({ title, content });
}

/**
 * Notifica o owner sobre lembrete de reserva (1 dia antes)
 */
export async function sendBookingReminderNotification(data: BookingEmailData): Promise<boolean> {
  const dateStr = data.bookingDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const title = "⏰ Lembrete: Reserva Amanhã";
  const content = `
**Cliente:** ${data.clientName} (${data.clientEmail})
**Embarcação:** ${data.vesselName}
**Data:** ${dateStr}

Lembrete: há uma reserva confirmada para amanhã.
  `.trim();

  return await notifyOwner({ title, content });
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pendente",
    confirmed: "Confirmada",
    cancelled: "Cancelada",
  };
  return labels[status] || status;
}
