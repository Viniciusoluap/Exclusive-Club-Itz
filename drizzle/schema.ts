import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, bigint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "employee"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Allowed clients table - stores emails authorized to make reservations
 */
export const allowedClients = mysqlTable("allowed_clients", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: text("name").notNull(),
  phone: varchar("phone", { length: 20 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type AllowedClient = typeof allowedClients.$inferSelect;
export type InsertAllowedClient = typeof allowedClients.$inferInsert;

/**
 * Vessels table - stores information about boats and jetskis
 */
export const vessels = mysqlTable("vessels", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  type: mysqlEnum("type", ["lancha", "jetski"]).notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  capacity: int("capacity"),
  quotaCount: int("quota_count").notNull().default(6), // Número de cotas disponíveis (3, 4, 6, 7, etc.)
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Vessel = typeof vessels.$inferSelect;
export type InsertVessel = typeof vessels.$inferInsert;

/**
 * Bookings table - stores reservation information
 */
export const bookings = mysqlTable("bookings", {
  id: int("id").autoincrement().primaryKey(),
  clientEmail: varchar("client_email", { length: 320 }).notNull(),
  clientName: text("client_name").notNull(),
  vesselId: int("vessel_id").notNull(),
  vesselName: text("vessel_name").notNull(),
  bookingDate: bigint("booking_date", { mode: "number" }).notNull(), // UTC timestamp in milliseconds
  status: mysqlEnum("status", ["pending", "confirmed", "used", "cancelled"]).default("confirmed").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;

/**
 * Client Quotas table - stores quota allocations per vessel for each client
 * A client can have multiple quotas for different vessels
 * Example: 1 full quota for lancha + 1 half quota for jetski
 */
export const clientQuotas = mysqlTable("client_quotas", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("client_id").notNull(), // references allowed_clients.id
  vesselId: int("vessel_id").notNull(), // references vessels.id
  quotaNumber: int("quota_number").notNull(), // Número da cota (1-7 para lancha, 1-6 para jetski)
  quotaType: mysqlEnum("quota_type", ["full", "half"]).notNull(), // full = 2 reservas, half = 1 reserva
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ClientQuota = typeof clientQuotas.$inferSelect;
export type InsertClientQuota = typeof clientQuotas.$inferInsert;

/**
 * Maintenances table - stores scheduled maintenance periods for vessels
 * Bookings are automatically blocked during maintenance periods
 */
export const maintenances = mysqlTable("maintenances", {
  id: int("id").autoincrement().primaryKey(),
  vesselId: int("vessel_id").notNull(), // references vessels.id
  vesselName: text("vessel_name").notNull(),
  startDate: bigint("start_date", { mode: "number" }).notNull(), // UTC timestamp in milliseconds
  endDate: bigint("end_date", { mode: "number" }).notNull(), // UTC timestamp in milliseconds
  description: text("description"),
  status: mysqlEnum("status", ["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Maintenance = typeof maintenances.$inferSelect;
export type InsertMaintenance = typeof maintenances.$inferInsert;


/**
 * Reviews table - stores client reviews for vessels after use
 * Only visible to admin users
 */
export const reviews = mysqlTable("reviews", {
  id: int("id").autoincrement().primaryKey(),
  bookingId: int("booking_id").notNull(), // references bookings.id
  clientEmail: varchar("client_email", { length: 320 }).notNull(),
  clientName: text("client_name").notNull(),
  vesselId: int("vessel_id").notNull(), // references vessels.id
  vesselName: text("vessel_name").notNull(),
  rating: int("rating").notNull(), // 1-5 stars
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Review = typeof reviews.$inferSelect;
export type InsertReview = typeof reviews.$inferInsert;


/**
 * Employees table - stores employee information with limited access
 * Employees can view future bookings, create maintenances, and view reports
 * Cannot access clients, vessels, or past bookings
 */
export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }),
  vesselIds: text("vessel_ids"), // JSON array of vessel IDs they are responsible for
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

/**
 * Fuel Records table - stores fuel consumption and charges per booking
 * Admin only - tracks fuel used and amount charged to client
 */
export const fuelRecords = mysqlTable("fuel_records", {
  id: int("id").autoincrement().primaryKey(),
  bookingId: int("booking_id").notNull(), // references bookings.id
  vesselId: int("vessel_id").notNull(), // references vessels.id
  vesselName: text("vessel_name").notNull(),
  clientEmail: varchar("client_email", { length: 320 }).notNull(),
  clientName: text("client_name").notNull(),
  liters: int("liters").notNull(), // Litros abastecidos
  pricePerLiter: int("price_per_liter").notNull(), // Preço por litro em centavos
  totalAmount: int("total_amount").notNull(), // Valor total em centavos
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type FuelRecord = typeof fuelRecords.$inferSelect;
export type InsertFuelRecord = typeof fuelRecords.$inferInsert;

/**
 * Inspections table - stores vessel inspection records
 * Two types: jetski and lancha, each with different checklist
 */
export const inspections = mysqlTable("inspections", {
  id: int("id").autoincrement().primaryKey(),
  bookingId: int("booking_id"), // references bookings.id (optional - can be standalone inspection)
  vesselId: int("vessel_id").notNull(), // references vessels.id
  vesselName: text("vessel_name").notNull(),
  vesselType: mysqlEnum("vessel_type", ["lancha", "jetski"]).notNull(),
  clientName: text("client_name").notNull(),
  inspectionData: text("inspection_data").notNull(), // JSON with all checklist items
  observations: text("observations"),
  status: mysqlEnum("status", ["approved", "rejected"]).notNull(), // Overall status
  inspectedBy: text("inspected_by"), // Name of employee who performed inspection
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Inspection = typeof inspections.$inferSelect;
export type InsertInspection = typeof inspections.$inferInsert;
