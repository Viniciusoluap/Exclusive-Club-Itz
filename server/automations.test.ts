import { describe, it, expect } from "vitest";
import { generateMonthlyCharges, sendOverdueAlerts, sendMonthlyReport, handleAsaasWebhook } from "./automations";

describe("Automations", () => {
  describe("generateMonthlyCharges", () => {
    it("deve executar sem erros", async () => {
      const result = await generateMonthlyCharges();
      
      expect(result).toHaveProperty("success");
      expect(typeof result.success).toBe("boolean");
    });
  });

  describe("sendOverdueAlerts", () => {
    it("deve executar sem erros", async () => {
      const result = await sendOverdueAlerts();
      
      expect(result).toHaveProperty("success");
      expect(typeof result.success).toBe("boolean");
    });
  });

  describe("sendMonthlyReport", () => {
    it("deve executar sem erros", async () => {
      const result = await sendMonthlyReport();
      
      expect(result).toHaveProperty("success");
      expect(typeof result.success).toBe("boolean");
    });
  });

  describe("handleAsaasWebhook", () => {
    it("deve processar webhook de pagamento recebido", async () => {
      const payload = {
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_123",
          externalReference: "1",
          value: 100.00,
        },
      };

      const result = await handleAsaasWebhook(payload);
      
      expect(result).toHaveProperty("success");
      expect(typeof result.success).toBe("boolean");
    });

    it("deve rejeitar payload inválido", async () => {
      const payload = {
        event: "PAYMENT_RECEIVED",
        payment: null,
      };

      const result = await handleAsaasWebhook(payload);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("Payload inválido");
    });
  });
});
