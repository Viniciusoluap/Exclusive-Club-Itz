/**
 * Testes para o serviço de pagamentos Asaas
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isValidCPF,
  isValidCNPJ,
  isValidCpfCnpj,
  formatDateForAsaas,
  mapAsaasStatus,
  mapToLegacyStatus,
} from "./_core/asaasService";

describe("Asaas Service - Validações", () => {
  describe("isValidCPF", () => {
    it("deve validar CPF válido", () => {
      expect(isValidCPF("529.982.247-25")).toBe(true);
      expect(isValidCPF("52998224725")).toBe(true);
    });

    it("deve rejeitar CPF inválido", () => {
      expect(isValidCPF("111.111.111-11")).toBe(false);
      expect(isValidCPF("123.456.789-00")).toBe(false);
      expect(isValidCPF("12345")).toBe(false);
      expect(isValidCPF("")).toBe(false);
    });

    it("deve rejeitar CPF com todos dígitos iguais", () => {
      expect(isValidCPF("000.000.000-00")).toBe(false);
      expect(isValidCPF("999.999.999-99")).toBe(false);
    });
  });

  describe("isValidCNPJ", () => {
    it("deve validar CNPJ válido", () => {
      expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
      expect(isValidCNPJ("11222333000181")).toBe(true);
    });

    it("deve rejeitar CNPJ inválido", () => {
      expect(isValidCNPJ("11.111.111/1111-11")).toBe(false);
      expect(isValidCNPJ("12.345.678/0001-00")).toBe(false);
      expect(isValidCNPJ("12345")).toBe(false);
      expect(isValidCNPJ("")).toBe(false);
    });
  });

  describe("isValidCpfCnpj", () => {
    it("deve validar CPF ou CNPJ", () => {
      expect(isValidCpfCnpj("529.982.247-25")).toBe(true);
      expect(isValidCpfCnpj("11.222.333/0001-81")).toBe(true);
    });

    it("deve rejeitar valores inválidos", () => {
      expect(isValidCpfCnpj("123")).toBe(false);
      expect(isValidCpfCnpj("")).toBe(false);
    });
  });
});

describe("Asaas Service - Formatação", () => {
  describe("formatDateForAsaas", () => {
    it("deve formatar data para YYYY-MM-DD", () => {
      const date = new Date("2024-03-15T10:30:00Z");
      expect(formatDateForAsaas(date)).toBe("2024-03-15");
    });

    it("deve formatar data de timestamp", () => {
      const date = new Date(2024, 11, 25); // mês é 0-indexed
      expect(formatDateForAsaas(date)).toBe("2024-12-25");
    });
  });
});

describe("Asaas Service - Mapeamento de Status", () => {
  describe("mapAsaasStatus", () => {
    it("deve mapear status PENDING", () => {
      expect(mapAsaasStatus("PENDING")).toBe("pending");
    });

    it("deve mapear status RECEIVED", () => {
      expect(mapAsaasStatus("RECEIVED")).toBe("received");
    });

    it("deve mapear status CONFIRMED", () => {
      expect(mapAsaasStatus("CONFIRMED")).toBe("confirmed");
    });

    it("deve mapear status OVERDUE", () => {
      expect(mapAsaasStatus("OVERDUE")).toBe("overdue");
    });

    it("deve mapear status REFUNDED", () => {
      expect(mapAsaasStatus("REFUNDED")).toBe("refunded");
    });

    it("deve mapear status RECEIVED_IN_CASH", () => {
      expect(mapAsaasStatus("RECEIVED_IN_CASH")).toBe("received");
    });

    it("deve mapear status REFUND_REQUESTED para refunded", () => {
      expect(mapAsaasStatus("REFUND_REQUESTED")).toBe("refunded");
    });

    it("deve mapear status REFUND_IN_PROGRESS para pending", () => {
      expect(mapAsaasStatus("REFUND_IN_PROGRESS")).toBe("pending");
    });

    it("deve mapear status CHARGEBACK_REQUESTED para failed", () => {
      expect(mapAsaasStatus("CHARGEBACK_REQUESTED")).toBe("failed");
    });

    it("deve mapear status CHARGEBACK_DISPUTE para failed", () => {
      expect(mapAsaasStatus("CHARGEBACK_DISPUTE")).toBe("failed");
    });

    it("deve mapear status AWAITING_CHARGEBACK_REVERSAL para failed", () => {
      expect(mapAsaasStatus("AWAITING_CHARGEBACK_REVERSAL")).toBe("failed");
    });

    it("deve mapear status DUNNING_REQUESTED para pending", () => {
      expect(mapAsaasStatus("DUNNING_REQUESTED")).toBe("pending");
    });

    it("deve mapear status DUNNING_RECEIVED para pending", () => {
      expect(mapAsaasStatus("DUNNING_RECEIVED")).toBe("pending");
    });

    it("deve mapear status AWAITING_RISK_ANALYSIS para pending", () => {
      expect(mapAsaasStatus("AWAITING_RISK_ANALYSIS")).toBe("pending");
    });

    it("deve retornar pending para status desconhecido", () => {
      expect(mapAsaasStatus("UNKNOWN_STATUS")).toBe("pending");
    });
  });

  describe("mapToLegacyStatus", () => {
    it("deve mapear para paid", () => {
      expect(mapToLegacyStatus("confirmed")).toBe("paid");
      expect(mapToLegacyStatus("received")).toBe("paid");
    });

    it("deve mapear para pending", () => {
      expect(mapToLegacyStatus("pending")).toBe("pending");
    });

    it("deve mapear para overdue", () => {
      expect(mapToLegacyStatus("overdue")).toBe("overdue");
    });

    it("deve retornar pending para status desconhecido", () => {
      expect(mapToLegacyStatus("unknown")).toBe("pending");
    });
  });
});

describe("Asaas Service - Integração (Mocked)", () => {
  // Testes de integração seriam feitos com mocks da API
  // Aqui apenas verificamos que as funções existem
  
  it("deve ter funções de integração exportadas", async () => {
    const asaasService = await import("./_core/asaasService");
    
    expect(typeof asaasService.getOrCreateAsaasCustomer).toBe("function");
    expect(typeof asaasService.createPixCharge).toBe("function");
    expect(typeof asaasService.getPixQrCode).toBe("function");
    expect(typeof asaasService.getChargeStatus).toBe("function");
    expect(typeof asaasService.cancelCharge).toBe("function");
    expect(typeof asaasService.savePaymentRecord).toBe("function");
    expect(typeof asaasService.updatePaymentStatus).toBe("function");
    expect(typeof asaasService.logPaymentAudit).toBe("function");
  });
});
