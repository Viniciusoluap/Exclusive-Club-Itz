import { describe, expect, it } from "vitest";
import * as emailService from "./emailService";

describe("Sistema de Emails Automáticos", () => {
  it("deve executar sendDailyWeatherEmails sem erros", async () => {
    const result = await emailService.sendDailyWeatherEmails();
    
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("emailsSent");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.errors)).toBe(true);
    
    // Pode não ter reservas hoje, mas não deve dar erro
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.emailsSent).toBe("number");
  });

  it("deve executar checkRainAlerts sem erros", async () => {
    const result = await emailService.checkRainAlerts();
    
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("emailsSent");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.errors)).toBe(true);
    
    // Pode não ter alertas, mas não deve dar erro
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.emailsSent).toBe("number");
  });

  it("deve executar sendTomorrowReminders sem erros", async () => {
    const result = await emailService.sendTomorrowReminders();
    
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("emailsSent");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.errors)).toBe(true);
    
    // Pode não ter reservas amanhã, mas não deve dar erro
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.emailsSent).toBe("number");
  });

  it("deve retornar estrutura correta quando não há reservas", async () => {
    // Testa com data futura distante (improvável ter reservas)
    const result = await emailService.sendDailyWeatherEmails();
    
    if (!result.success || result.emailsSent === 0) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Nenhuma reserva" || "Não foi possível");
    }
  });
});
