import { eq, and, gte, lte, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, allowedClients, InsertAllowedClient, vessels, InsertVessel, bookings, InsertBooking, clientQuotas, InsertClientQuota, maintenances, InsertMaintenance, reviews, InsertReview } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Allowed Clients
export async function getAllowedClients() {
  const db = await getDb();
  if (!db) return [];
  const clients = await db.select().from(allowedClients).orderBy(desc(allowedClients.createdAt));
  
  // Fetch quotas for each client
  const clientsWithQuotas = await Promise.all(
    clients.map(async (client) => {
      const quotas = await getClientQuotasByClientId(client.id);
      return { ...client, quotas };
    })
  );
  
  return clientsWithQuotas;
}

export async function getActiveAllowedClients() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(allowedClients).where(eq(allowedClients.isActive, true));
}

export async function getAllowedClientByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(allowedClients).where(eq(allowedClients.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createAllowedClient(client: InsertAllowedClient) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(allowedClients).values(client);
  return result;
}

export async function updateAllowedClient(id: number, data: Partial<InsertAllowedClient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(allowedClients).set(data).where(eq(allowedClients.id, id));
}

export async function deleteAllowedClient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(allowedClients).where(eq(allowedClients.id, id));
}

// Vessels
export async function getVessels() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(vessels).orderBy(desc(vessels.createdAt));
}

export async function getActiveVessels() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(vessels).where(eq(vessels.isActive, true));
}

export async function getVesselById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(vessels).where(eq(vessels.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createVessel(vessel: InsertVessel) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vessels).values(vessel);
  return result;
}

export async function updateVessel(id: number, data: Partial<InsertVessel>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(vessels).set(data).where(eq(vessels.id, id));
}

export async function deleteVessel(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(vessels).where(eq(vessels.id, id));
}

// Bookings
export async function getBookings() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(bookings).orderBy(desc(bookings.bookingDate));
}

export async function getBookingsByEmail(email: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(bookings).where(eq(bookings.clientEmail, email)).orderBy(desc(bookings.bookingDate));
}

export async function getActiveBookingsByEmail(email: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(bookings)
    .where(
      and(
        eq(bookings.clientEmail, email),
        eq(bookings.status, "confirmed")
      )
    )
    .orderBy(desc(bookings.bookingDate));
}

export async function getBookingsByDateRange(startDate: number, endDate: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(bookings)
    .where(
      and(
        gte(bookings.bookingDate, startDate),
        lte(bookings.bookingDate, endDate)
      )
    )
    .orderBy(bookings.bookingDate);
}

export async function getBookingsByVesselAndDate(vesselId: number, date: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(bookings)
    .where(
      and(
        eq(bookings.vesselId, vesselId),
        eq(bookings.bookingDate, date),
        eq(bookings.status, "confirmed")
      )
    );
}

export async function createBooking(booking: InsertBooking) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(bookings).values(booking);
  return result;
}

export async function updateBooking(id: number, data: Partial<InsertBooking>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(bookings).set(data).where(eq(bookings.id, id));
}

export async function deleteBooking(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(bookings).where(eq(bookings.id, id));
}

// Client Quotas
export async function getClientQuotasByClientId(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(clientQuotas)
    .where(and(eq(clientQuotas.clientId, clientId), eq(clientQuotas.isActive, true)));
}

export async function getClientQuotasByEmail(email: string) {
  const db = await getDb();
  if (!db) return [];
  
  const client = await getAllowedClientByEmail(email);
  if (!client) return [];
  
  return await getClientQuotasByClientId(client.id);
}

export async function getClientQuotaByVessel(clientId: number, vesselId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(clientQuotas)
    .where(
      and(
        eq(clientQuotas.clientId, clientId),
        eq(clientQuotas.vesselId, vesselId),
        eq(clientQuotas.isActive, true)
      )
    );
}

export async function createClientQuota(quota: InsertClientQuota) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clientQuotas).values(quota);
  return result;
}

export async function deleteClientQuota(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(clientQuotas).where(eq(clientQuotas.id, id));
}

export async function deleteClientQuotasByClientId(clientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(clientQuotas).where(eq(clientQuotas.clientId, clientId));
}


// ========== Maintenance Functions ==========

export async function createMaintenance(maintenance: InsertMaintenance) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(maintenances).values(maintenance);
  return result;
}

export async function getAllMaintenances() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(maintenances).orderBy(desc(maintenances.startDate));
}

export async function getMaintenanceById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(maintenances).where(eq(maintenances.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getMaintenancesByVessel(vesselId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(maintenances)
    .where(eq(maintenances.vesselId, vesselId))
    .orderBy(desc(maintenances.startDate));
}

export async function getMaintenancesByDateRange(startDate: number, endDate: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(maintenances)
    .where(
      and(
        lte(maintenances.startDate, endDate),
        gte(maintenances.endDate, startDate)
      )
    )
    .orderBy(desc(maintenances.startDate));
}

export async function updateMaintenance(id: number, updates: Partial<InsertMaintenance>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(maintenances).set(updates).where(eq(maintenances.id, id));
}

export async function deleteMaintenance(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(maintenances).where(eq(maintenances.id, id));
}

/**
 * Check if a vessel has maintenance scheduled for a specific date
 */
export async function hasMaintenanceOnDate(vesselId: number, date: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const dayStart = new Date(date).setHours(0, 0, 0, 0);
  const dayEnd = new Date(date).setHours(23, 59, 59, 999);

  const result = await db.select().from(maintenances)
    .where(
      and(
        eq(maintenances.vesselId, vesselId),
        lte(maintenances.startDate, dayEnd),
        gte(maintenances.endDate, dayStart),
        eq(maintenances.status, "scheduled")
      )
    )
    .limit(1);

  return result.length > 0;
}


// ========== Review Functions ==========

export async function createReview(review: InsertReview) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(reviews).values(review);
  return result;
}

export async function getAllReviews() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(reviews).orderBy(desc(reviews.createdAt));
}

export async function getApprovedReviews() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(reviews)
    .where(eq(reviews.isApproved, true))
    .orderBy(desc(reviews.createdAt));
}

export async function getReviewsByVessel(vesselId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(reviews)
    .where(and(eq(reviews.vesselId, vesselId), eq(reviews.isApproved, true)))
    .orderBy(desc(reviews.createdAt));
}

export async function getReviewByBooking(bookingId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(reviews)
    .where(eq(reviews.bookingId, bookingId))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

export async function updateReview(id: number, updates: Partial<InsertReview>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(reviews).set(updates).where(eq(reviews.id, id));
}

export async function deleteReview(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(reviews).where(eq(reviews.id, id));
}

export async function approveReview(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(reviews).set({ isApproved: true }).where(eq(reviews.id, id));
}
