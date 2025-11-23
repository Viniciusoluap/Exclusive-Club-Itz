/**
 * Serviço de previsão do tempo
 * 
 * Usa OpenWeatherMap API (gratuita até 1000 chamadas/dia)
 * Para usar, adicione OPENWEATHER_API_KEY nas variáveis de ambiente
 */

export interface WeatherData {
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
  icon: string;
}

/**
 * Busca previsão do tempo para uma data específica
 * Coordenadas padrão: Brasília, DF
 */
export async function getWeatherForecast(date: Date, lat: number = -15.7942, lon: number = -47.8822): Promise<WeatherData | null> {
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
    
    return {
      temperature: Math.round(closestForecast.main.temp),
      description: closestForecast.weather[0].description,
      humidity: closestForecast.main.humidity,
      windSpeed: Math.round(closestForecast.wind.speed * 3.6), // m/s para km/h
      icon: closestForecast.weather[0].icon,
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
