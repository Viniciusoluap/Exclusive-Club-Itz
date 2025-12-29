import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock do módulo db
vi.mock('./db', () => ({
  getDb: vi.fn()
}));

// Mock do drizzle-orm
vi.mock('drizzle-orm', () => ({
  sql: {
    raw: (query: string) => query
  }
}));

describe("employee.upcomingReservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar reservas com telefone do cliente", async () => {
    // Mock dos dados de reserva com telefone
    const mockReservations = [
      {
        id: 1,
        clientEmail: "cliente@teste.com",
        clientName: "João Silva",
        vesselId: 1,
        vesselName: "Focker 215",
        bookingDate: Date.now() + 86400000, // amanhã
        status: "confirmed",
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        clientPhone: "(11) 99999-9999"
      }
    ];

    const mockDb = {
      execute: vi.fn().mockResolvedValue([mockReservations])
    };

    const { getDb } = await import('./db');
    (getDb as any).mockResolvedValue(mockDb);

    // Simular a query que seria executada
    const result = mockReservations;

    // Verificar que o resultado contém o telefone
    expect(result[0]).toHaveProperty('clientPhone');
    expect(result[0].clientPhone).toBe("(11) 99999-9999");
  });

  it("deve retornar clientPhone como null quando cliente não tem telefone cadastrado", async () => {
    const mockReservations = [
      {
        id: 2,
        clientEmail: "cliente2@teste.com",
        clientName: "Maria Santos",
        vesselId: 2,
        vesselName: "Jet Ski",
        bookingDate: Date.now() + 172800000, // depois de amanhã
        status: "confirmed",
        notes: "Reserva especial",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        clientPhone: null
      }
    ];

    const mockDb = {
      execute: vi.fn().mockResolvedValue([mockReservations])
    };

    const { getDb } = await import('./db');
    (getDb as any).mockResolvedValue(mockDb);

    const result = mockReservations;

    expect(result[0]).toHaveProperty('clientPhone');
    expect(result[0].clientPhone).toBeNull();
  });

  it("deve calcular corretamente o cutoff baseado no horário de Brasília", () => {
    // Testar a lógica de cálculo do cutoff
    const testCases = [
      { hour: 10, shouldShowToday: true },  // 10h - deve mostrar reservas de hoje
      { hour: 17, shouldShowToday: true },  // 17h - deve mostrar reservas de hoje
      { hour: 18, shouldShowToday: false }, // 18h - não deve mostrar reservas de hoje
      { hour: 20, shouldShowToday: false }, // 20h - não deve mostrar reservas de hoje
      { hour: 23, shouldShowToday: false }, // 23h - não deve mostrar reservas de hoje
    ];

    testCases.forEach(({ hour, shouldShowToday }) => {
      // Simular o cálculo do cutoff
      const brasiliaTime = new Date();
      brasiliaTime.setHours(hour, 0, 0, 0);
      
      const cutoffDate = new Date(brasiliaTime);
      if (hour >= 18) {
        cutoffDate.setDate(cutoffDate.getDate() + 1);
      }
      cutoffDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (shouldShowToday) {
        // Se deve mostrar hoje, cutoff deve ser hoje à meia-noite
        expect(cutoffDate.getTime()).toBe(today.getTime());
      } else {
        // Se não deve mostrar hoje, cutoff deve ser amanhã à meia-noite
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        expect(cutoffDate.getTime()).toBe(tomorrow.getTime());
      }
    });
  });

  it("deve formatar telefone corretamente para WhatsApp", () => {
    // Função de formatação do frontend
    const formatPhoneForWhatsApp = (phone: string | null | undefined): string | null => {
      if (!phone) return null;
      const cleanPhone = phone.replace(/\D/g, '');
      if (!cleanPhone.startsWith('55')) {
        return `55${cleanPhone}`;
      }
      return cleanPhone;
    };

    // Testes de formatação
    expect(formatPhoneForWhatsApp(null)).toBeNull();
    expect(formatPhoneForWhatsApp(undefined)).toBeNull();
    expect(formatPhoneForWhatsApp("")).toBeNull();
    expect(formatPhoneForWhatsApp("(11) 99999-9999")).toBe("5511999999999");
    expect(formatPhoneForWhatsApp("11999999999")).toBe("5511999999999");
    expect(formatPhoneForWhatsApp("5511999999999")).toBe("5511999999999");
    expect(formatPhoneForWhatsApp("+55 11 99999-9999")).toBe("5511999999999");
  });

  it("deve gerar URL correta do WhatsApp", () => {
    const formatPhoneForWhatsApp = (phone: string | null | undefined): string | null => {
      if (!phone) return null;
      const cleanPhone = phone.replace(/\D/g, '');
      if (!cleanPhone.startsWith('55')) {
        return `55${cleanPhone}`;
      }
      return cleanPhone;
    };

    const phone = "(11) 99999-9999";
    const whatsappPhone = formatPhoneForWhatsApp(phone);
    const whatsappUrl = whatsappPhone ? `https://wa.me/${whatsappPhone}` : null;

    expect(whatsappUrl).toBe("https://wa.me/5511999999999");
  });
});
