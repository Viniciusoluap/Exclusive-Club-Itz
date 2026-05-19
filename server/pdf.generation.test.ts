import { describe, expect, it } from "vitest";
import { generateNotificationPdf, generateContractPdf } from "./_core/htmlToPdf";

describe("PDF Generation (PDFKit — sem Puppeteer/Chrome)", () => {
  it("gera PDF de notificação extrajudicial sem erro", async () => {
    const buf = await generateNotificationPdf({
      clientName: "LUCAS SANTOS MIRANDA",
      clientCpfCnpj: "123.456.789-00",
      clientEmail: "lucas@test.com",
      debts: [
        {
          description: "Mensalidade Maio/2026",
          dueDate: "2026-05-01",
          value: 350,
          daysOverdue: 18,
          type: "monthly",
        },
        {
          description: "Abastecimento Abril/2026",
          dueDate: "2026-04-15",
          value: 120,
          daysOverdue: 34,
          type: "fuel",
        },
      ],
      totalDebt: 470,
      notificationDate: "19 de maio de 2026",
      notificationNumber: "EC-20260519-1",
    });

    // Deve retornar um Buffer válido com conteúdo PDF
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
    // PDF começa com %PDF
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("gera PDF de contrato sem erro", async () => {
    const buf = await generateContractPdf({
      clientName: "LUCAS SANTOS MIRANDA",
      clientCpfCnpj: "123.456.789-00",
      clientPhone: "(99) 99999-9999",
      clientEmail: "lucas@test.com",
      boatName: "Focker 215 150HP",
      boatDescription: "Lancha Focker 215 com motor Mercury 150HP",
      quotaType: "Meia Cota",
      quotaNumber: 2,
      quotaPercentage: "12.5",
      totalQuotas: 8,
      adhesionValue: 15000,
      monthlyFee: 350,
      installments: [
        { description: "Parcela 1/3 — Adesão", dueDate: "2026-06-01", value: 5000 },
        { description: "Parcela 2/3 — Adesão", dueDate: "2026-07-01", value: 5000 },
        { description: "Parcela 3/3 — Adesão", dueDate: "2026-08-01", value: 5000 },
      ],
      contractDate: "19 de maio de 2026",
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("gera PDF de notificação com múltiplos tipos de débito", async () => {
    const buf = await generateNotificationPdf({
      clientName: "DIOGO DE LEMOS BRITO",
      clientCpfCnpj: "987.654.321-00",
      clientEmail: "diogo@test.com",
      debts: [
        { description: "Mensalidade Jan/2026", dueDate: "2026-01-01", value: 350, daysOverdue: 138, type: "monthly" },
        { description: "Mensalidade Fev/2026", dueDate: "2026-02-01", value: 350, daysOverdue: 107, type: "monthly" },
        { description: "Reparo motor", dueDate: "2026-03-01", value: 800, daysOverdue: 79, type: "repair" },
        { description: "Vistoria anual", dueDate: "2026-04-01", value: 200, daysOverdue: 48, type: "inspection" },
      ],
      totalDebt: 1700,
      notificationDate: "19 de maio de 2026",
      notificationNumber: "EC-20260519-2",
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
  });
});
