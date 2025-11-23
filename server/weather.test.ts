import { describe, expect, it, beforeEach } from "vitest";
import * as weather from "./weather";

describe("Weather Service", () => {
  beforeEach(() => {
    // Mock da API key
    process.env.OPENWEATHER_API_KEY = "test-api-key";
  });

  // Nota: checkWeatherAlerts requer chamada real à API ou mock mais complexo
  // Por isso, vamos testar as funções auxiliares que são puras

  describe("isWeatherFavorable", () => {
    it("deve retornar true para condições favoráveis", () => {
      const weatherData: weather.WeatherData = {
        temperature: 28,
        description: "céu limpo",
        humidity: 60,
        windSpeed: 15,
        icon: "01d",
        rainProbability: 20,
        tempMin: 25,
        tempMax: 30,
      };

      expect(weather.isWeatherFavorable(weatherData)).toBe(true);
    });

    it("deve retornar false para alta probabilidade de chuva", () => {
      const weatherData: weather.WeatherData = {
        temperature: 28,
        description: "chuva forte",
        humidity: 90,
        windSpeed: 15,
        icon: "10d",
        rainProbability: 80,
        tempMin: 25,
        tempMax: 30,
      };

      expect(weather.isWeatherFavorable(weatherData)).toBe(false);
    });

    it("deve retornar false para ventos fortes", () => {
      const weatherData: weather.WeatherData = {
        temperature: 28,
        description: "céu limpo",
        humidity: 60,
        windSpeed: 30,
        icon: "01d",
        rainProbability: 10,
        tempMin: 25,
        tempMax: 30,
      };

      expect(weather.isWeatherFavorable(weatherData)).toBe(false);
    });
  });

  describe("formatWeatherForEmail", () => {
    it("deve formatar dados do tempo corretamente", () => {
      const weatherData: weather.WeatherData = {
        temperature: 28,
        description: "céu limpo",
        humidity: 60,
        windSpeed: 15,
        icon: "01d",
        rainProbability: 20,
        rainVolume: 5,
        tempMin: 25,
        tempMax: 30,
      };

      const formatted = weather.formatWeatherForEmail(weatherData);

      expect(formatted).toContain("Previsão do Tempo");
      expect(formatted).toContain("28°C");
      expect(formatted).toContain("25°C");
      expect(formatted).toContain("30°C");
      expect(formatted).toContain("céu limpo");
      expect(formatted).toContain("60%");
      expect(formatted).toContain("15 km/h");
      expect(formatted).toContain("20%");
      expect(formatted).toContain("5mm");
    });

    it("deve incluir alertas para condições desfavoráveis", () => {
      const weatherData: weather.WeatherData = {
        temperature: 28,
        description: "chuva forte",
        humidity: 90,
        windSpeed: 30,
        icon: "10d",
        rainProbability: 85,
        tempMin: 25,
        tempMax: 30,
      };

      const formatted = weather.formatWeatherForEmail(weatherData);

      expect(formatted).toContain("ATENÇÃO");
      expect(formatted).toContain("Alta probabilidade de chuva");
      expect(formatted).toContain("Ventos fortes");
    });
  });

  describe("getWeatherEmoji", () => {
    it("deve retornar emoji correto para cada condição", () => {
      expect(weather.getWeatherEmoji("01d")).toBe("☀️");
      expect(weather.getWeatherEmoji("01n")).toBe("🌙");
      expect(weather.getWeatherEmoji("09d")).toBe("🌧️");
      expect(weather.getWeatherEmoji("11d")).toBe("⛈️");
      expect(weather.getWeatherEmoji("13d")).toBe("❄️");
      expect(weather.getWeatherEmoji("50d")).toBe("🌫️");
    });

    it("deve retornar emoji padrão para código desconhecido", () => {
      expect(weather.getWeatherEmoji("99x")).toBe("🌤️");
    });
  });
});
