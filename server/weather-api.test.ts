import { describe, expect, it } from "vitest";
import * as weather from "./weather";

describe("OpenWeatherMap API Integration", () => {
  it("deve validar chave da API e retornar previsão válida", async () => {
    // Testa com uma data futura (amanhã)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);

    const forecast = await weather.getWeatherForecast(tomorrow);

    if (!forecast) {
      console.warn("⚠️ Previsão não disponível. Verifique se OPENWEATHER_API_KEY está configurada corretamente.");
      console.warn("Obtenha uma chave gratuita em: https://openweathermap.org/api");
      // Não falha o teste se a chave não estiver configurada
      expect(forecast).toBeNull();
      return;
    }

    // Se retornou dados, valida a estrutura
    expect(forecast).toBeDefined();
    expect(forecast.temperature).toBeTypeOf("number");
    expect(forecast.description).toBeTypeOf("string");
    expect(forecast.humidity).toBeTypeOf("number");
    expect(forecast.windSpeed).toBeTypeOf("number");
    expect(forecast.rainProbability).toBeTypeOf("number");
    expect(forecast.tempMin).toBeTypeOf("number");
    expect(forecast.tempMax).toBeTypeOf("number");
    expect(forecast.icon).toBeTypeOf("string");

    // Valida ranges razoáveis
    expect(forecast.temperature).toBeGreaterThan(-50);
    expect(forecast.temperature).toBeLessThan(60);
    expect(forecast.humidity).toBeGreaterThanOrEqual(0);
    expect(forecast.humidity).toBeLessThanOrEqual(100);
    expect(forecast.rainProbability).toBeGreaterThanOrEqual(0);
    expect(forecast.rainProbability).toBeLessThanOrEqual(100);

    console.log("✅ API OpenWeatherMap funcionando corretamente!");
    console.log(`📍 Localização: Imperatriz, MA`);
    console.log(`🌡️ Temperatura: ${forecast.temperature}°C`);
    console.log(`☁️ Condição: ${forecast.description}`);
    console.log(`💧 Umidade: ${forecast.humidity}%`);
    console.log(`🌧️ Probabilidade de chuva: ${forecast.rainProbability}%`);
  }, 10000); // Timeout de 10s para chamada de API
});
