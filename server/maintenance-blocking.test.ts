import { describe, expect, it, beforeEach } from "vitest";
import * as db from "./db";

describe("Bloqueio de Reservas durante Manutenção", () => {
  const testVesselId = 1; // Lancha Focker 215
  
  it("deve detectar manutenção programada para uma data específica", async () => {
    // Cria uma manutenção de teste para amanhã
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    
    // Cria manutenção
    const maintenanceId = await db.createMaintenance({
      vesselId: testVesselId,
      vesselName: "Lancha Focker 215",
      startDate: tomorrow.getTime(),
      endDate: dayAfterTomorrow.getTime(),
      description: "Manutenção de teste",
      status: "scheduled",
    });

    expect(maintenanceId).toBeTypeOf("number");

    // Verifica se detecta manutenção na data
    const hasMaintenance = await db.hasMaintenanceOnDate(testVesselId, tomorrow.getTime());
    expect(hasMaintenance).toBe(true);

    // Limpa manutenção de teste
    await db.deleteMaintenance(maintenanceId);
  });

  it("não deve detectar manutenção em datas sem manutenção programada", async () => {
    // Testa uma data no futuro distante (30 dias)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    futureDate.setHours(0, 0, 0, 0);

    const hasMaintenance = await db.hasMaintenanceOnDate(testVesselId, futureDate.getTime());
    expect(hasMaintenance).toBe(false);
  });

  it("deve detectar manutenção no meio do período", async () => {
    // Cria manutenção de 5 dias
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 5);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 5);
    
    const maintenanceId = await db.createMaintenance({
      vesselId: testVesselId,
      vesselName: "Lancha Focker 215",
      startDate: startDate.getTime(),
      endDate: endDate.getTime(),
      description: "Manutenção de teste longa",
      status: "scheduled",
    });

    // Testa data no meio do período
    const middleDate = new Date(startDate);
    middleDate.setDate(middleDate.getDate() + 2);
    
    const hasMaintenance = await db.hasMaintenanceOnDate(testVesselId, middleDate.getTime());
    expect(hasMaintenance).toBe(true);

    // Limpa
    await db.deleteMaintenance(maintenanceId);
  });

  it("não deve detectar manutenção cancelada", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    
    // Cria manutenção cancelada
    const maintenanceId = await db.createMaintenance({
      vesselId: testVesselId,
      vesselName: "Lancha Focker 215",
      startDate: tomorrow.getTime(),
      endDate: dayAfterTomorrow.getTime(),
      description: "Manutenção cancelada",
      status: "cancelled",
    });

    // Atualiza para cancelada
    await db.updateMaintenance(maintenanceId, { status: "cancelled" });

    // Não deve detectar manutenção cancelada
    const hasMaintenance = await db.hasMaintenanceOnDate(testVesselId, tomorrow.getTime());
    expect(hasMaintenance).toBe(false);

    // Limpa
    await db.deleteMaintenance(maintenanceId);
  });
});
