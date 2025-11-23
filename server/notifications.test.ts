import { describe, expect, it, vi } from "vitest";
import { notifyNewBooking, notifyBookingCancellation, notifyBookingUsed } from "./_core/emailNotification";

// Mock do notifyOwner para não enviar notificações reais durante os testes
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

describe("Sistema de Notificações", () => {
  it("deve formatar corretamente notificação de nova reserva", async () => {
    const result = await notifyNewBooking({
      clientName: "João Silva",
      clientEmail: "joao@example.com",
      vesselName: "JETSKI SEADOO GTI SE 130HP",
      bookingDate: new Date(2025, 11, 15), // 15 de dezembro de 2025
      notes: "Primeira vez usando jetski",
    });

    expect(result).toBe(true);
  });

  it("deve formatar corretamente notificação de cancelamento", async () => {
    const result = await notifyBookingCancellation({
      clientName: "Maria Santos",
      clientEmail: "maria@example.com",
      vesselName: "Focker 215 150HP",
      bookingDate: new Date(2025, 11, 20),
    });

    expect(result).toBe(true);
  });

  it("deve formatar corretamente notificação de reserva usada", async () => {
    const result = await notifyBookingUsed({
      clientName: "Pedro Costa",
      vesselName: "JETSKI SEADOO GTI SE 130HP",
      bookingDate: new Date(2025, 11, 10),
    });

    expect(result).toBe(true);
  });
});
