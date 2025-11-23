/**
 * Serviço de previsão do tempo
 * 
 * Usa OpenWeatherMap API (gratuita até 1000 chamadas/dia)
 * Para usar, adicione OPENWEATHER_API_KEY nas variáveis de ambiente
 * 
 * Coordenadas de Imperatriz-MA: -5.5242, -47.4919
 */

const IMPERATRIZ_LAT = -5.5242;
const IMPERATRIZ_LON = -47.4919;

export interface WeatherData {
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
  icon: string;
  rainProbability: number; // 0-100
  rainVolume?: number; // mm
  tempMin: number;
  tempMax: number;
}

export interface WeatherAlert {
  hasAlert: boolean;
  message?: string;
  severity?: "low" | "medium" | "high";
}

/**
 * Busca previsão do tempo para uma data específica
 * Coordenadas padrão: Imperatriz, MA
 */
export async function getWeatherForecast(date: Date, lat: number = IMPERATRIZ_LAT, lon: number = IMPERATRIZ_LON): Promise<WeatherData | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  
  if (!apiKey) {
    console.warn('[Weather] OPENWEATHER_API_KEY não configurada');
    return null;
  }
  
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=pt_br`
    );
    
    if (!response.ok) {
      console.error('[Weather] Erro ao buscar previsão:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    
    // Encontrar previsão mais próxima da data solicitada
    const targetTime = date.getTime();
    let closestForecast = data.list[0];
    let minDiff = Math.abs(new Date(closestForecast.dt * 1000).getTime() - targetTime);
    
    for (const forecast of data.list) {
      const forecastTime = new Date(forecast.dt * 1000).getTime();
      const diff = Math.abs(forecastTime - targetTime);
      
      if (diff < minDiff) {
        minDiff = diff;
        closestForecast = forecast;
      }
    }
    
    // Calcular probabilidade de chuva (pop = probability of precipitation)
    const rainProbability = Math.round((closestForecast.pop || 0) * 100);
    const rainVolume = closestForecast.rain?.["3h"] || 0;

    return {
      temperature: Math.round(closestForecast.main.temp),
      description: closestForecast.weather[0].description,
      humidity: closestForecast.main.humidity,
      windSpeed: Math.round(closestForecast.wind.speed * 3.6), // m/s para km/h
      icon: closestForecast.weather[0].icon,
      rainProbability,
      rainVolume: rainVolume > 0 ? rainVolume : undefined,
      tempMin: Math.round(closestForecast.main.temp_min),
      tempMax: Math.round(closestForecast.main.temp_max),
    };
  } catch (error) {
    console.error('[Weather] Erro ao buscar previsão:', error);
    return null;
  }
}

/**
 * Retorna ícone emoji baseado no código do OpenWeather
 */
export function getWeatherEmoji(icon: string): string {
  const iconMap: Record<string, string> = {
    '01d': '☀️', // clear sky day
    '01n': '🌙', // clear sky night
    '02d': '⛅', // few clouds day
    '02n': '☁️', // few clouds night
    '03d': '☁️', // scattered clouds
    '03n': '☁️',
    '04d': '☁️', // broken clouds
    '04n': '☁️',
    '09d': '🌧️', // shower rain
    '09n': '🌧️',
    '10d': '🌦️', // rain day
    '10n': '🌧️', // rain night
    '11d': '⛈️', // thunderstorm
    '11n': '⛈️',
    '13d': '❄️', // snow
    '13n': '❄️',
    '50d': '🌫️', // mist
    '50n': '🌫️',
  };
  
  return iconMap[icon] || '🌤️';
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
  
  return `
${emoji} **Previsão do Tempo**

🌡️ Temperatura: ${weather.temperature}°C (Min: ${weather.tempMin}°C / Max: ${weather.tempMax}°C)
☁️ Condição: ${weather.description}
💧 Umidade: ${weather.humidity}%
💨 Vento: ${weather.windSpeed} km/h
🌧️ Probabilidade de chuva: ${weather.rainProbability}%
${weather.rainVolume ? `💦 Volume esperado: ${weather.rainVolume}mm` : ""}

${weather.rainProbability >= 80 ? "⛈️ **ATENÇÃO:** Alta probabilidade de chuva. Considere reagendar." : ""}
${weather.windSpeed > 25 ? "💨 **ATENÇÃO:** Ventos fortes previstos. Navegação pode ser desconfortável." : ""}
  `.trim();
}

/**
 * Verifica se as condições são favoráveis para navegação
 */
export function isWeatherFavorable(weather: WeatherData): boolean {
  return (
    weather.rainProbability < 60 &&
    weather.windSpeed <= 25
  );
}
