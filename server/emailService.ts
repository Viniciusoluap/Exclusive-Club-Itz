/**
 * Email Service for sending weather forecasts and alerts
 * Uses the built-in notification system to send emails to booking owners
 */

import * as weather from "./weather";
import * as db from "./db";
import { notifyOwner } from "./_core/notification";

interface EmailResult {
  success: boolean;
  emailsSent: number;
  errors: string[];
}

/**
 * Envia emails com previsão do tempo para todas as reservas do dia
 * Deve ser executado diariamente às 08:00
 */
export async function sendDailyWeatherEmails(): Promise<EmailResult> {
  const result: EmailResult = {
    success: true,
    emailsSent: 0,
    errors: [],
  };

  try {
    // Busca reservas de hoje
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayBookings = await db.getBookingsByDateRange(
      today.getTime(),
      tomorrow.getTime() - 1
    );

    // Filtra apenas reservas confirmadas
    const confirmedBookings = todayBookings.filter(
      (b) => b.status === "confirmed"
    );

    if (confirmedBookings.length === 0) {
      return {
        success: true,
        emailsSent: 0,
        errors: ["Nenhuma reserva confirmada para hoje"],
      };
    }

    // Busca previsão do tempo
    const forecast = await weather.getWeatherForecast(today);
    
    if (!forecast) {
      result.errors.push("Não foi possível obter previsão do tempo");
      result.success = false;
      return result;
    }

    // Monta mensagem
    const weatherText = weather.formatWeatherForEmail(forecast);
    const isFavorable = weather.isWeatherFavorable(forecast);

    // Envia notificação para o admin com lista de reservas
    const bookingsList = confirmedBookings
      .map(
        (b) =>
          `• ${b.clientName} (${b.clientEmail}) - ${b.vesselName}`
      )
      .join("\n");

    const emailContent = `
📅 **Reservas de Hoje** (${today.toLocaleDateString("pt-BR")})

${bookingsList}

---

${weatherText}

${
  isFavorable
    ? "✅ **Condições favoráveis para navegação**"
    : "⚠️ **ATENÇÃO: Condições podem não ser ideais para navegação**"
}

---

💡 **Ação recomendada:** ${
      isFavorable
        ? "Envie uma mensagem de confirmação aos clientes."
        : "Entre em contato com os clientes para avaliar se desejam manter a reserva."
    }
    `;

    const notificationSent = await notifyOwner({
      title: `☀️ Previsão do Tempo - ${confirmedBookings.length} Reserva(s) Hoje`,
      content: emailContent,
    });

    if (notificationSent) {
      result.emailsSent = 1;
    } else {
      result.errors.push("Falha ao enviar notificação");
      result.success = false;
    }

    return result;
  } catch (error) {
    result.success = false;
    result.errors.push(
      error instanceof Error ? error.message : "Erro desconhecido"
    );
    return result;
  }
}

/**
 * Verifica alertas de chuva para reservas futuras (próximos 5 dias)
 * Envia notificação se detectar probabilidade > 80%
 */
export async function checkRainAlerts(): Promise<EmailResult> {
  const result: EmailResult = {
    success: true,
    emailsSent: 0,
    errors: [],
  };

  try {
    // Busca reservas dos próximos 5 dias
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fiveDaysLater = new Date(today);
    fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);

    const upcomingBookings = await db.getBookingsByDateRange(
      today.getTime(),
      fiveDaysLater.getTime()
    );

    // Filtra apenas confirmadas
    const confirmedBookings = upcomingBookings.filter(
      (b) => b.status === "confirmed"
    );

    if (confirmedBookings.length === 0) {
      return {
        success: true,
        emailsSent: 0,
        errors: ["Nenhuma reserva confirmada nos próximos 5 dias"],
      };
    }

    // Verifica alertas para cada reserva
    const alertsToSend: Array<{
      booking: any;
      alert: weather.WeatherAlert;
    }> = [];

    for (const booking of confirmedBookings) {
      const alert = await weather.checkWeatherAlerts(
        new Date(booking.bookingDate)
      );
      
      if (alert.hasAlert && alert.severity === "high") {
        alertsToSend.push({ booking, alert });
      }
    }

    if (alertsToSend.length === 0) {
      return {
        success: true,
        emailsSent: 0,
        errors: ["Nenhum alerta de chuva detectado"],
      };
    }

    // Monta mensagem de alerta
    const alertsList = alertsToSend
      .map(
        ({ booking, alert }) =>
          `⛈️ **${new Date(booking.bookingDate).toLocaleDateString("pt-BR")}**
   Cliente: ${booking.clientName} (${booking.clientEmail})
   Embarcação: ${booking.vesselName}
   ${alert.message}
`
      )
      .join("\n");

    const emailContent = `
🌧️ **ALERTA DE CHUVA - Reservas em Risco**

${alertsList}

---

💡 **Ação recomendada:** Entre em contato com os clientes para:
1. Informar sobre as condições meteorológicas desfavoráveis
2. Oferecer reagendamento sem custos
3. Confirmar se desejam manter a reserva mesmo com o alerta

📞 **Contatos dos clientes:**
${alertsToSend
  .map((a) => `• ${a.booking.clientName}: ${a.booking.clientEmail}`)
  .join("\n")}
    `;

    const notificationSent = await notifyOwner({
      title: `⚠️ ALERTA: ${alertsToSend.length} Reserva(s) com Risco de Chuva`,
      content: emailContent,
    });

    if (notificationSent) {
      result.emailsSent = 1;
    } else {
      result.errors.push("Falha ao enviar notificação de alerta");
      result.success = false;
    }

    return result;
  } catch (error) {
    result.success = false;
    result.errors.push(
      error instanceof Error ? error.message : "Erro desconhecido"
    );
    return result;
  }
}

/**
 * Envia email de lembrete com previsão do tempo para reservas de amanhã
 */
export async function sendTomorrowReminders(): Promise<EmailResult> {
  const result: EmailResult = {
    success: true,
    emailsSent: 0,
    errors: [],
  };

  try {
    // Busca reservas de amanhã
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const tomorrowBookings = await db.getBookingsByDateRange(
      tomorrow.getTime(),
      dayAfter.getTime() - 1
    );

    const confirmedBookings = tomorrowBookings.filter(
      (b) => b.status === "confirmed"
    );

    if (confirmedBookings.length === 0) {
      return {
        success: true,
        emailsSent: 0,
        errors: ["Nenhuma reserva confirmada para amanhã"],
      };
    }

    // Busca previsão
    const forecast = await weather.getWeatherForecast(tomorrow);
    
    if (!forecast) {
      result.errors.push("Não foi possível obter previsão do tempo");
      result.success = false;
      return result;
    }

    const weatherText = weather.formatWeatherForEmail(forecast);
    const isFavorable = weather.isWeatherFavorable(forecast);

    // Lista de reservas
    const bookingsList = confirmedBookings
      .map(
        (b) =>
          `• ${b.clientName} (${b.clientEmail}) - ${b.vesselName}`
      )
      .join("\n");

    const emailContent = `
📅 **Lembrete: Reservas de Amanhã** (${tomorrow.toLocaleDateString("pt-BR")})

${bookingsList}

---

${weatherText}

${
  isFavorable
    ? "✅ **Condições favoráveis previstas para navegação**"
    : "⚠️ **ATENÇÃO: Condições podem não ser ideais. Considere entrar em contato com os clientes.**"
}

---

💡 **Checklist para amanhã:**
- [ ] Verificar combustível e equipamentos de segurança
- [ ] Confirmar horário com os clientes
- [ ] Revisar condições meteorológicas pela manhã
    `;

    const notificationSent = await notifyOwner({
      title: `📅 Lembrete: ${confirmedBookings.length} Reserva(s) Amanhã`,
      content: emailContent,
    });

    if (notificationSent) {
      result.emailsSent = 1;
    } else {
      result.errors.push("Falha ao enviar lembrete");
      result.success = false;
    }

    return result;
  } catch (error) {
    result.success = false;
    result.errors.push(
      error instanceof Error ? error.message : "Erro desconhecido"
    );
    return result;
  }
}
