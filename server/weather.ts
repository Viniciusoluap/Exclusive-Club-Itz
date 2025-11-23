/**
 * Weather service using OpenWeatherMap API
 * Location: Imperatriz, MA, Brazil (-5.5264, -47.4820)
 */

const IMPERATRIZ_LAT = -5.5264;
const IMPERATRIZ_LON = -47.4820;
const API_BASE_URL = "https://api.openweathermap.org/data/2.5";

export interface WeatherData {
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
  icon: string;
  rainProbability: number;
  rainVolume?: number;
  tempMin: number;
  tempMax: number;
  emoji?: string;
}

export interface WeatherAlert {
  hasAlert: boolean;
  severity?: "low" | "medium" | "high";
  message?: string;
}

/**
 * Busca previsão do tempo para uma data específica
 */
export async function getWeatherForecast(date: Date): Promise<WeatherData | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  
  if (!apiKey) {
    console.warn("[Weather] OPENWEATHER_API_KEY not configured");
    return null;
  }

  try {
    // Usa forecast API para previsões futuras (até 5 dias)
    const url = `${API_BASE_URL}/forecast?lat=${IMPERATRIZ_LAT}&lon=${IMPERATRIZ_LON}&appid=${apiKey}&units=metric&lang=pt_br`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[Weather] API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    
    // Encontra a previsão mais próxima da data solicitada
    const targetTime = date.getTime();
    let closestForecast = data.list[0];
    let minDiff = Math.abs(closestForecast.dt * 1000 - targetTime);

    for (const forecast of data.list) {
      const diff = Math.abs(forecast.dt * 1000 - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestForecast = forecast;
      }
    }

    const weather = closestForecast.weather[0];
    const main = closestForecast.main;
    const wind = closestForecast.wind;
    const rain = closestForecast.rain || {};
    const pop = closestForecast.pop || 0; // Probability of precipitation

    return {
      temperature: Math.round(main.temp),
      description: weather.description,
      humidity: main.humidity,
      windSpeed: Math.round(wind.speed * 3.6), // m/s to km/h
      icon: weather.icon,
      rainProbability: Math.round(pop * 100),
      rainVolume: rain["3h"] ? Math.round(rain["3h"]) : undefined,
      tempMin: Math.round(main.temp_min),
      tempMax: Math.round(main.temp_max),
      emoji: getWeatherEmoji(weather.icon),
    };
  } catch (error) {
    console.error("[Weather] Error fetching forecast:", error);
    return null;
  }
}

/**
 * Verifica se há alertas meteorológicos para a data
 */
export async function checkWeatherAlerts(date: Date): Promise<WeatherAlert> {
  const weather = await getWeatherForecast(date);
  
  if (!weather) {
    return { hasAlert: false };
  }

  // Alerta de chuva forte (>80%)
  if (weather.rainProbability >= 80) {
    return {
      hasAlert: true,
      severity: "high",
      message: `⛈️ ALERTA: Alta probabilidade de chuva (${weather.rainProbability}%) em ${new Date(date).toLocaleDateString("pt-BR")}. Recomendamos reagendar sua reserva.`,
    };
  }

  // Alerta de chuva moderada (60-79%)
  if (weather.rainProbability >= 60) {
    return {
      hasAlert: true,
      severity: "medium",
      message: `🌧️ ATENÇÃO: Probabilidade moderada de chuva (${weather.rainProbability}%) em ${new Date(date).toLocaleDateString("pt-BR")}. Fique atento à previsão.`,
    };
  }

  // Alerta de vento forte (>25 km/h)
  if (weather.windSpeed > 25) {
    return {
      hasAlert: true,
      severity: "medium",
      message: `💨 ATENÇÃO: Ventos fortes previstos (${weather.windSpeed} km/h) em ${new Date(date).toLocaleDateString("pt-BR")}. Navegação pode ser desconfortável.`,
    };
  }

  return { hasAlert: false };
}

/**
 * Formata dados do tempo para exibição em email
 */
export function formatWeatherForEmail(weather: WeatherData): string {
  const emoji = getWeatherEmoji(weather.icon);
  
  let formatted = `
${emoji} **Previsão do Tempo**

🌡️ Temperatura: ${weather.temperature}°C (Min: ${weather.tempMin}°C / Max: ${weather.tempMax}°C)
☁️ Condição: ${weather.description}
💧 Umidade: ${weather.humidity}%
💨 Vento: ${weather.windSpeed} km/h
🌧️ Probabilidade de chuva: ${weather.rainProbability}%`;

  if (weather.rainVolume) {
    formatted += `\n💦 Volume esperado: ${weather.rainVolume}mm`;
  }

  // Adiciona alertas
  if (weather.rainProbability >= 60) {
    formatted += `\n\n⚠️ **ATENÇÃO:** Alta probabilidade de chuva. Considere reagendar se possível.`;
  }

  if (weather.windSpeed > 25) {
    formatted += `\n\n💨 **ATENÇÃO:** Ventos fortes previstos. Navegação pode ser desconfortável.`;
  }

  return formatted;
}

/**
 * Verifica se as condições meteorológicas são favoráveis para navegação
 */
export function isWeatherFavorable(weather: WeatherData): boolean {
  return weather.rainProbability < 60 && weather.windSpeed <= 25;
}

/**
 * Retorna emoji baseado no código do ícone do OpenWeatherMap
 */
export function getWeatherEmoji(iconCode: string): string {
  const emojiMap: Record<string, string> = {
    "01d": "☀️", // clear sky day
    "01n": "🌙", // clear sky night
    "02d": "🌤️", // few clouds day
    "02n": "☁️", // few clouds night
    "03d": "☁️", // scattered clouds
    "03n": "☁️",
    "04d": "☁️", // broken clouds
    "04n": "☁️",
    "09d": "🌧️", // shower rain
    "09n": "🌧️",
    "10d": "🌦️", // rain day
    "10n": "🌧️", // rain night
    "11d": "⛈️", // thunderstorm
    "11n": "⛈️",
    "13d": "❄️", // snow
    "13n": "❄️",
    "50d": "🌫️", // mist
    "50n": "🌫️",
  };

  return emojiMap[iconCode] || "🌤️";
}
