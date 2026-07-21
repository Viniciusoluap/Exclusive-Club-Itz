import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database functions
vi.mock("./db", () => ({
  getMaintenanceById: vi.fn(),
  getVesselById: vi.fn(),
  getAllBookings: vi.fn(),
  updateMaintenance: vi.fn(),
  updateBooking: vi.fn(),
}));

// Mock email notifications
vi.mock("./_core/emailNotification", () => ({
  notifyClientMaintenanceCancellation: vi.fn().mockResolvedValue(true),
  notifyAdminMaintenanceCancellations: vi.fn().mockResolvedValue(true),
  notifyAdminMaintenanceStatusChange: vi.fn().mockResolvedValue(true),
  notifyClientsMaintenanceStatusChange: vi.fn().mockResolvedValue(true),
  notifyNewBooking: vi.fn(),
  notifyBookingCancellation: vi.fn(),
  notifyBookingUsed: vi.fn(),
  notifyClientBookingConfirmation: vi.fn(),
  notifyClientBookingCancellation: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import * as db from "./db";
import * as emailNotification from "./_core/emailNotification";
import * as notification from "./_core/notification";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createEmployeeContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "employee-user",
    email: "employee@example.com",
    name: "Employee User",
    loginMethod: "manus",
    role: "employee" as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 3,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("maintenances.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update maintenance without cancelling bookings when dates unchanged", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const existingMaintenance = {
      id: 1,
      vesselId: 1,
      vesselName: "Test Vessel",
      startDate: new Date("2025-01-01").getTime(),
      endDate: new Date("2025-01-05").getTime(),
      description: "Old description",
      status: "scheduled",
    };

    vi.mocked(db.getMaintenanceById).mockResolvedValue(existingMaintenance as any);
    vi.mocked(db.updateMaintenance).mockResolvedValue(undefined);

    const result = await caller.maintenances.update({
      id: 1,
      description: "New description",
    });

    expect(result.success).toBe(true);
    expect(result.cancelledCount).toBe(0);
    expect(db.updateMaintenance).toHaveBeenCalledWith(1, { description: "New description" });
    expect(emailNotification.notifyClientMaintenanceCancellation).not.toHaveBeenCalled();
  });

  it("should cancel conflicting bookings when dates are changed", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const existingMaintenance = {
      id: 1,
      vesselId: 1,
      vesselName: "Test Vessel",
      startDate: new Date("2025-01-01").getTime(),
      endDate: new Date("2025-01-05").getTime(),
      description: "Test maintenance",
      status: "scheduled",
    };

    const conflictingBooking = {
      id: 100,
      vesselId: 1,
      vesselName: "Test Vessel",
      clientName: "John Doe",
      clientEmail: "john@example.com",
      bookingDate: new Date("2025-01-10").getTime(),
      status: "confirmed",
    };

    vi.mocked(db.getMaintenanceById).mockResolvedValue(existingMaintenance as any);
    vi.mocked(db.getAllBookings).mockResolvedValue([conflictingBooking] as any);
    vi.mocked(db.updateMaintenance).mockResolvedValue(undefined);
    vi.mocked(db.updateBooking).mockResolvedValue(undefined);

    const result = await caller.maintenances.update({
      id: 1,
      startDate: new Date("2025-01-08").getTime(),
      endDate: new Date("2025-01-15").getTime(),
    });

    expect(result.success).toBe(true);
    expect(result.cancelledCount).toBe(1);
    expect(db.updateBooking).toHaveBeenCalledWith(100, { status: "cancelled" });
    expect(emailNotification.notifyClientMaintenanceCancellation).toHaveBeenCalled();
    expect(emailNotification.notifyAdminMaintenanceCancellations).toHaveBeenCalled();
  });

  it("should cancel conflicting bookings when vessel is changed", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const existingMaintenance = {
      id: 1,
      vesselId: 1,
      vesselName: "Vessel 1",
      startDate: new Date("2025-01-01").getTime(),
      endDate: new Date("2025-01-05").getTime(),
      description: "Test maintenance",
      status: "scheduled",
    };

    const newVessel = {
      id: 2,
      name: "Vessel 2",
    };

    const conflictingBooking = {
      id: 101,
      vesselId: 2,
      vesselName: "Vessel 2",
      clientName: "Jane Doe",
      clientEmail: "jane@example.com",
      bookingDate: new Date("2025-01-03").getTime(),
      status: "confirmed",
    };

    vi.mocked(db.getMaintenanceById).mockResolvedValue(existingMaintenance as any);
    vi.mocked(db.getVesselById).mockResolvedValue(newVessel as any);
    vi.mocked(db.getAllBookings).mockResolvedValue([conflictingBooking] as any);
    vi.mocked(db.updateMaintenance).mockResolvedValue(undefined);
    vi.mocked(db.updateBooking).mockResolvedValue(undefined);

    const result = await caller.maintenances.update({
      id: 1,
      vesselId: 2,
    });

    expect(result.success).toBe(true);
    expect(result.cancelledCount).toBe(1);
    expect(db.updateBooking).toHaveBeenCalledWith(101, { status: "cancelled" });
    expect(emailNotification.notifyClientMaintenanceCancellation).toHaveBeenCalled();
  });

  it("should not cancel already cancelled or used bookings", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const existingMaintenance = {
      id: 1,
      vesselId: 1,
      vesselName: "Test Vessel",
      startDate: new Date("2025-01-01").getTime(),
      endDate: new Date("2025-01-05").getTime(),
      description: "Test maintenance",
      status: "scheduled",
    };

    const bookings = [
      {
        id: 100,
        vesselId: 1,
        vesselName: "Test Vessel",
        clientName: "John",
        clientEmail: "john@example.com",
        bookingDate: new Date("2025-01-10").getTime(),
        status: "cancelled",
      },
      {
        id: 101,
        vesselId: 1,
        vesselName: "Test Vessel",
        clientName: "Jane",
        clientEmail: "jane@example.com",
        bookingDate: new Date("2025-01-11").getTime(),
        status: "used",
      },
    ];

    vi.mocked(db.getMaintenanceById).mockResolvedValue(existingMaintenance as any);
    vi.mocked(db.getAllBookings).mockResolvedValue(bookings as any);
    vi.mocked(db.updateMaintenance).mockResolvedValue(undefined);

    const result = await caller.maintenances.update({
      id: 1,
      startDate: new Date("2025-01-08").getTime(),
      endDate: new Date("2025-01-15").getTime(),
    });

    expect(result.success).toBe(true);
    expect(result.cancelledCount).toBe(0);
    expect(db.updateBooking).not.toHaveBeenCalled();
    expect(emailNotification.notifyClientMaintenanceCancellation).not.toHaveBeenCalled();
  });

  it("should reject update from regular user", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.maintenances.update({
        id: 1,
        description: "New description",
      })
    ).rejects.toThrow("Employee access required");
  });

  it("should allow employee to update maintenance", async () => {
    const ctx = createEmployeeContext();
    const caller = appRouter.createCaller(ctx);

    const existingMaintenance = {
      id: 1,
      vesselId: 1,
      vesselName: "Test Vessel",
      startDate: new Date("2025-01-01").getTime(),
      endDate: new Date("2025-01-05").getTime(),
      description: "Old description",
      status: "scheduled",
    };

    vi.mocked(db.getMaintenanceById).mockResolvedValue(existingMaintenance as any);
    vi.mocked(db.updateMaintenance).mockResolvedValue(undefined);

    const result = await caller.maintenances.update({
      id: 1,
      description: "Updated by employee",
    });

    expect(result.success).toBe(true);
  });

  it("should throw error if maintenance not found", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    vi.mocked(db.getMaintenanceById).mockResolvedValue(null as any);

    await expect(
      caller.maintenances.update({
        id: 999,
        description: "New description",
      })
    ).rejects.toThrow("Manutenção não encontrada");
  });

  it("should throw error if start date is after end date", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const existingMaintenance = {
      id: 1,
      vesselId: 1,
      vesselName: "Test Vessel",
      startDate: new Date("2025-01-01").getTime(),
      endDate: new Date("2025-01-05").getTime(),
      description: "Test maintenance",
      status: "scheduled",
    };

    vi.mocked(db.getMaintenanceById).mockResolvedValue(existingMaintenance as any);

    await expect(
      caller.maintenances.update({
        id: 1,
        startDate: new Date("2025-01-15").getTime(),
        endDate: new Date("2025-01-10").getTime(),
      })
    ).rejects.toThrow("Data de início deve ser anterior à data de término");
  });
});
