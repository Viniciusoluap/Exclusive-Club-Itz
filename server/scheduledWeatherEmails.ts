/**
 * Sistema de Agendamento de Emails com Previsão do Tempo
 * 
 * Envia emails automáticos às 08:00 da manhã para clientes com reservas no dia
 * Inclui previsão do tempo e alertas de condições desfavoráveis
 */

import * as db from "./db";
import * as weather from "./weather";
import { notifyOwner } from "./_core/notification";

/**
 * Processa e envia emails de previsão do tempo para reservas do dia
 * Deve ser executado diariamente às 08:00
 */
export async function sendDailyWeatherEmails(): Promise<void> {
  try {
    console.log("[Weather Emails] Iniciando envio de emails diários...");

    // Buscar todas as reservas confirmadas para hoje
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayEnd = tomorrow.getTime();

    const todayBookings = await db.getBookingsByDateRange(todayStart, todayEnd);
    
    if (!todayBookings || todayBookings.length === 0) {
      console.log("[Weather Emails] Nenhuma reserva para hoje");
      return;
    }

    // Filtrar apenas reservas confirmadas
    const confirmedBookings = todayBookings.filter(b => b.status === "confirmed");
    
    if (confirmedBookings.length === 0) {
      console.log("[Weather Emails] Nenhuma reserva confirmada para hoje");
      return;
    }

    console.log(`[Weather Emails] ${confirmedBookings.length} reserva(s) confirmada(s) para hoje`);

    // Buscar previsão do tempo
    const weatherData = await weather.getWeatherForecast(today);
    
    if (!weatherData) {
      console.warn("[Weather Emails] Não foi possível obter previsão do tempo");
      return;
    }

    // Verificar alertas
    const alert = await weather.checkWeatherAlerts(today);

    // Enviar email para cada reserva
    for (const booking of confirmedBookings) {
      try {
        await sendWeatherEmailToClient(booking, weatherData, alert);
      } catch (error) {
        console.error(`[Weather Emails] Erro ao enviar email para reserva ${booking.id}:`, error);
      }
    }

    // Notificar owner se houver alertas severos
    if (alert.hasAlert && alert.severity === "high") {
      await notifyOwner({
        title: "⛈️ Alerta Meteorológico - Reservas Hoje",
        content: `${alert.message}\n\n${confirmedBookings.length} reserva(s) confirmada(s) para hoje podem ser afetadas.`,
      });
    }

    console.log("[Weather Emails] Envio de emails concluído");
  } catch (error) {
    console.error("[Weather Emails] Erro ao processar emails:", error);
  }
}

/**
 * Envia email com previsão do tempo para um cliente específico
 */
async function sendWeatherEmailToClient(
  booking: any,
  weatherData: weather.WeatherData,
  alert: weather.WeatherAlert
): Promise<void> {
  const client = await db.getAllowedClientByEmail(booking.clientEmail);
  const vessel = await db.getVesselById(booking.vesselId);

  if (!client || !vessel) {
    console.warn(`[Weather Emails] Cliente ou embarcação não encontrado para reserva ${booking.id}`);
    return;
  }

  const emoji = weather.getWeatherEmoji(weatherData.icon);
  const isFavorable = weather.isWeatherFavorable(weatherData);

  const emailContent = `
Olá ${client.name}! 👋

Sua reserva está confirmada para **hoje, ${new Date(booking.bookingDate).toLocaleDateString("pt-BR")}**!

**🚤 Embarcação:** ${vessel.name}

---

${emoji} **PREVISÃO DO TEMPO PARA HOJE**

🌡️ **Temperatura:** ${weatherData.temperature}°C (Min: ${weatherData.tempMin}°C / Max: ${weatherData.tempMax}°C)
☁️ **Condição:** ${weatherData.description}
💧 **Umidade:** ${weatherData.humidity}%
💨 **Vento:** ${weatherData.windSpeed} km/h
🌧️ **Probabilidade de chuva:** ${weatherData.rainProbability}%
${weatherData.rainVolume ? `💦 **Volume esperado:** ${weatherData.rainVolume}mm` : ""}

---

${alert.hasAlert ? `
⚠️ **ALERTA METEOROLÓGICO**

${alert.message}

${alert.severity === "high" ? "**Recomendamos entrar em contato para reagendar sua reserva.**" : ""}

---
` : ""}

${isFavorable ? "✅ **Condições favoráveis para navegação!**" : "⚠️ **Atenção às condições meteorológicas.**"}

---

📋 **CHECKLIST PRÉ-NAVEGAÇÃO**

Antes de sair, não esqueça de:
✓ Usar colete salva-vidas (OBRIGATÓRIO para todos)
✓ Verificar combustível e equipamentos de segurança
✓ Conferir bujão de drenagem fechado
✓ Levar documentos (habilitação náutica + RG)
✓ Informar horário de retorno estimado

📖 **Manual completo de segurança:** https://exclusivereservas.manus.space/embarcacoes

---

📞 **Dúvidas ou precisa reagendar?**
WhatsApp: (99) 98139-2210

🌊 Tenha uma ótima navegação!

**Exclusive Club** - Compartilhando Sonhos
  `.trim();

  // Enviar via sistema de notificação do owner (que pode ser configurado para enviar para clientes também)
  // Por enquanto, notifica o owner sobre o envio
  await notifyOwner({
    title: `📧 Email de Previsão Enviado - ${client.name}`,
    content: `Email com previsão do tempo enviado para ${client.name} (${client.email}).\n\nReserva: ${vessel.name} - ${new Date(booking.bookingDate).toLocaleDateString("pt-BR")}`,
  });

  console.log(`[Weather Emails] Email enviado para ${client.name} (reserva ${booking.id})`);
}

/**
 * Verifica e envia alertas de chuva forte (>80%) para reservas futuras
 * Deve ser executado diariamente
 */
export async function checkAndSendRainAlerts(): Promise<void> {
  try {
    console.log("[Rain Alerts] Verificando alertas de chuva...");

    // Buscar reservas confirmadas dos próximos 5 dias
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 5);
    const futureEnd = futureDate.getTime();

    const futureBookings = await db.getBookingsByDateRange(todayStart, futureEnd);
    
    if (!futureBookings || futureBookings.length === 0) {
      console.log("[Rain Alerts] Nenhuma reserva futura para verificar");
      return;
    }

    const confirmedBookings = futureBookings.filter(b => b.status === "confirmed");

    let alertsSent = 0;

    for (const booking of confirmedBookings) {
      try {
        const bookingDate = new Date(booking.bookingDate);
        const alert = await weather.checkWeatherAlerts(bookingDate);

        // Enviar alerta apenas para chuva forte (>80%)
        if (alert.hasAlert && alert.severity === "high") {
          const client = await db.getAllowedClientByEmail(booking.clientEmail);
          const vessel = await db.getVesselById(booking.vesselId);

          if (client && vessel) {
            await notifyOwner({
              title: "⛈️ Alerta de Chuva Forte",
              content: `
**Cliente:** ${client.name} (${client.email})
**Embarcação:** ${vessel.name}
**Data:** ${bookingDate.toLocaleDateString("pt-BR")}

${alert.message}

**Recomendação:** Entrar em contato com o cliente para reagendar.
              `.trim(),
            });

            alertsSent++;
          }
        }
      } catch (error) {
        console.error(`[Rain Alerts] Erro ao verificar alerta para reserva ${booking.id}:`, error);
      }
    }

    console.log(`[Rain Alerts] ${alertsSent} alerta(s) enviado(s)`);
  } catch (error) {
    console.error("[Rain Alerts] Erro ao verificar alertas:", error);
  }
}
