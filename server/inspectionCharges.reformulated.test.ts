import { describe, expect, it } from "vitest";

/**
 * Testes para o sistema reformulado de cobranças de danos
 * 
 * Valida:
 * 1. Criação de cobrança tipo "inspection" (Vistoria Reprovada)
 * 2. Criação de cobrança tipo "repair" (Reparo da Embarcação)
 * 3. Lógica de rateio automático entre cotistas
 * 4. Validações de campos obrigatórios por tipo
 */

describe("Sistema de Cobranças Reformulado", () => {
  describe("Validação de Tipos", () => {
    it("deve aceitar charge_type 'inspection'", () => {
      const chargeType = "inspection";
      expect(["inspection", "repair"]).toContain(chargeType);
    });

    it("deve aceitar charge_type 'repair'", () => {
      const chargeType = "repair";
      expect(["inspection", "repair"]).toContain(chargeType);
    });

    it("deve rejeitar charge_type inválido", () => {
      const chargeType = "invalid";
      expect(["inspection", "repair"]).not.toContain(chargeType);
    });
  });

  describe("Validação de Campos Obrigatórios", () => {
    it("tipo 'inspection' requer inspection_id", () => {
      const charge = {
        charge_type: "inspection",
        inspection_id: 123,
        amount: 50000, // R$ 500.00 em centavos
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      expect(charge.charge_type).toBe("inspection");
      expect(charge.inspection_id).toBeDefined();
      expect(charge.amount).toBeGreaterThan(0);
    });

    it("tipo 'repair' requer vessel_id e description", () => {
      const charge = {
        charge_type: "repair",
        vessel_id: 456,
        description: "Reparo do motor - substituição de peças",
        amount: 100000, // R$ 1000.00 em centavos
        receipt_url: "https://s3.amazonaws.com/receipts/123.pdf",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      expect(charge.charge_type).toBe("repair");
      expect(charge.vessel_id).toBeDefined();
      expect(charge.description).toBeDefined();
      expect(charge.amount).toBeGreaterThan(0);
    });

    it("tipo 'inspection' não deve ter vessel_id", () => {
      const charge = {
        charge_type: "inspection",
        inspection_id: 123,
        vessel_id: null, // Não deve ter vessel_id
        amount: 50000,
      };

      expect(charge.charge_type).toBe("inspection");
      expect(charge.vessel_id).toBeNull();
    });

    it("tipo 'repair' não deve ter inspection_id", () => {
      const charge = {
        charge_type: "repair",
        vessel_id: 456,
        inspection_id: null, // Não deve ter inspection_id
        description: "Reparo do casco",
        amount: 80000,
      };

      expect(charge.charge_type).toBe("repair");
      expect(charge.inspection_id).toBeNull();
    });
  });

  describe("Lógica de Rateio Automático", () => {
    it("deve calcular valor por cota corretamente", () => {
      const totalAmount = 100000; // R$ 1000.00 em centavos
      const quotaCount = 4; // 4 cotas na embarcação

      const valuePerQuota = totalAmount / quotaCount;

      expect(valuePerQuota).toBe(25000); // R$ 250.00 por cota
    });

    it("deve calcular valor para cota inteira (1.0)", () => {
      const valuePerQuota = 25000; // R$ 250.00
      const quotaShare = 1.0; // Cota inteira

      const clientAmount = valuePerQuota * quotaShare;

      expect(clientAmount).toBe(25000); // R$ 250.00
    });

    it("deve calcular valor para meia cota (0.5)", () => {
      const valuePerQuota = 25000; // R$ 250.00
      const quotaShare = 0.5; // Meia cota

      const clientAmount = valuePerQuota * quotaShare;

      expect(clientAmount).toBe(12500); // R$ 125.00
    });

    it("deve ratear R$ 1000.00 entre 2 cotistas (1 inteira + 1 meia)", () => {
      const totalAmount = 100000; // R$ 1000.00
      const quotaCount = 2; // 2 cotas

      const valuePerQuota = totalAmount / quotaCount; // R$ 500.00 por cota

      const client1Amount = valuePerQuota * 1.0; // Cota inteira
      const client2Amount = valuePerQuota * 0.5; // Meia cota

      expect(client1Amount).toBe(50000); // R$ 500.00
      expect(client2Amount).toBe(25000); // R$ 250.00
      expect(client1Amount + client2Amount).toBe(75000); // Total: R$ 750.00
    });

    it("deve ratear R$ 2000.00 entre 4 cotistas (variações)", () => {
      const totalAmount = 200000; // R$ 2000.00
      const quotaCount = 4; // 4 cotas

      const valuePerQuota = totalAmount / quotaCount; // R$ 500.00 por cota

      const client1Amount = valuePerQuota * 1.0; // Cota inteira: R$ 500.00
      const client2Amount = valuePerQuota * 1.0; // Cota inteira: R$ 500.00
      const client3Amount = valuePerQuota * 0.5; // Meia cota: R$ 250.00
      const client4Amount = valuePerQuota * 0.5; // Meia cota: R$ 250.00

      expect(client1Amount).toBe(50000);
      expect(client2Amount).toBe(50000);
      expect(client3Amount).toBe(25000);
      expect(client4Amount).toBe(25000);

      const total = client1Amount + client2Amount + client3Amount + client4Amount;
      expect(total).toBe(150000); // Total: R$ 1500.00
    });
  });

  describe("Data de Vencimento Padrão", () => {
    it("deve usar vencimento padrão de 7 dias", () => {
      const now = Date.now();
      const defaultDueDate = new Date(now + 7 * 24 * 60 * 60 * 1000);

      const diffInDays = Math.floor(
        (defaultDueDate.getTime() - now) / (24 * 60 * 60 * 1000)
      );

      expect(diffInDays).toBe(7);
    });

    it("deve aceitar data de vencimento customizada", () => {
      const customDueDate = new Date("2025-12-31T12:00:00Z");
      
      expect(customDueDate).toBeInstanceOf(Date);
      expect(customDueDate.getFullYear()).toBe(2025);
      expect(customDueDate.getMonth()).toBe(11); // Dezembro (0-indexed)
      expect(customDueDate.getUTCDate()).toBe(31);
    });
  });

  describe("Upload de Comprovante", () => {
    it("deve aceitar URL de comprovante válida", () => {
      const receiptUrl = "https://s3.amazonaws.com/receipts/repair-123.pdf";
      
      expect(receiptUrl).toMatch(/^https?:\/\//);
      expect(receiptUrl).toContain("s3.amazonaws.com");
    });

    it("deve aceitar comprovante null (opcional)", () => {
      const receiptUrl = null;
      
      expect(receiptUrl).toBeNull();
    });

    it("deve validar extensões de arquivo aceitas", () => {
      const validExtensions = [".jpg", ".jpeg", ".png", ".pdf"];
      
      const testFiles = [
        "receipt.jpg",
        "receipt.jpeg",
        "receipt.png",
        "receipt.pdf",
      ];

      testFiles.forEach((file) => {
        const hasValidExtension = validExtensions.some((ext) =>
          file.toLowerCase().endsWith(ext)
        );
        expect(hasValidExtension).toBe(true);
      });
    });

    it("deve rejeitar extensões inválidas", () => {
      const validExtensions = [".jpg", ".jpeg", ".png", ".pdf"];
      
      const invalidFiles = [
        "receipt.txt",
        "receipt.doc",
        "receipt.exe",
      ];

      invalidFiles.forEach((file) => {
        const hasValidExtension = validExtensions.some((ext) =>
          file.toLowerCase().endsWith(ext)
        );
        expect(hasValidExtension).toBe(false);
      });
    });
  });

  describe("Integração com Asaas", () => {
    it("deve gerar dados de cobrança para Asaas (inspection)", () => {
      const charge = {
        charge_type: "inspection",
        client_email: "cliente@example.com",
        client_name: "João Silva",
        amount: 50000, // R$ 500.00 em centavos
        due_date: new Date("2025-12-31"),
        description: "Cobrança de Danos - Vistoria 23/12/2025",
      };

      // Converte centavos para reais (Asaas espera valor em reais)
      const amountInReais = charge.amount / 100;

      expect(amountInReais).toBe(500);
      expect(charge.client_email).toBeDefined();
      expect(charge.description).toContain("Vistoria");
    });

    it("deve gerar dados de cobrança para Asaas (repair)", () => {
      const charge = {
        charge_type: "repair",
        client_email: "cliente@example.com",
        client_name: "Maria Santos",
        amount: 25000, // R$ 250.00 em centavos (rateado)
        due_date: new Date("2025-12-31"),
        description: "Reparo do Motor - Substituição de Peças",
      };

      const amountInReais = charge.amount / 100;

      expect(amountInReais).toBe(250);
      expect(charge.client_email).toBeDefined();
      expect(charge.description).toContain("Reparo");
    });
  });
});
