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
  contractUrl: text("contract_url"), // URL do contrato principal (obrigatório)
  contract2Url: text("contract2_url"), // URL do segundo contrato (opcional)
  documentUrl: text("document_url"), // URL do documento pessoal (obrigatório)
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
  createdBy: int("created_by"), // references users.id - quem criou a manutenção
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
  liters: int("liters").notNull(), // Litros abastecidos (método manual) ou litros calculados (método por peso)
  pricePerLiter: int("price_per_liter").notNull(), // Preço por litro em centavos
  totalAmount: int("total_amount").notNull(), // Valor total em centavos
  // Campos do método de abastecimento por pesagem (opcionais - para compatibilidade com registros antigos)
  litersInitial: int("liters_initial"), // Litros iniciais no galão (em centésimos, ex: 5005 = 50.05L)
  weightFull: int("weight_full"), // Peso do galão cheio em gramas (ex: 37800 = 37.80kg)
  weightAfter: int("weight_after"), // Peso do galão após abastecer em gramas (ex: 23400 = 23.40kg)
  weightConsumed: int("weight_consumed"), // Peso consumido em gramas (calculado: weightFull - weightAfter)
  litersCalculated: int("liters_calculated"), // Litros calculados pela regra de 3 (em centésimos)
  photoBeforeUrl: text("photo_before_url"), // URL da foto da balança ANTES do abastecimento
  photoAfterUrl: text("photo_after_url"), // URL da foto da balança DEPOIS do abastecimento
  notes: text("notes"),
  // Campos de pagamento Asaas
  asaasChargeId: varchar("asaas_charge_id", { length: 100 }), // ID da cobrança no Asaas
  asaasCustomerId: varchar("asaas_customer_id", { length: 100 }), // ID do cliente no Asaas
  paymentStatus: mysqlEnum("payment_status", ["pending", "paid", "cancelled", "overdue"]).default("pending").notNull(),
  paymentUrl: text("payment_url"), // URL para pagamento no Asaas
  paidAt: timestamp("paid_at"), // Data do pagamento
  // Campos de sincronização manual
  syncStatus: mysqlEnum("sync_status", ["pending", "synced", "failed", "manual"]).default("pending").notNull(),
  syncError: text("sync_error"), // Mensagem de erro da última tentativa
  lastSyncAttempt: timestamp("last_sync_attempt"), // Timestamp da última tentativa de sync
  manualPaymentNote: text("manual_payment_note"), // Observações de pagamento manual
  recordedBy: int("recorded_by"), // ID do usuário (admin ou employee) que criou o registro
  recordedAt: timestamp("recorded_at").defaultNow().notNull(), // Data/hora de criação do registro
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type FuelRecord = typeof fuelRecords.$inferSelect;
export type InsertFuelRecord = typeof fuelRecords.$inferInsert;

/**
 * Fuel Budget table - stores monthly budget for fuel expenses
 * Admin can set budget per month/year to track spending
 * total_spent and total_received are calculated dynamically from fuel_records
 */
export const fuelBudget = mysqlTable("fuel_budget", {
  id: int("id").autoincrement().primaryKey(),
  monthYear: varchar("month_year", { length: 7 }).notNull().unique(), // Format: "2025-11" (YYYY-MM)
  totalBudget: int("total_budget").notNull().default(0), // Orçamento total em centavos
  totalSpent: int("total_spent").notNull().default(0), // Total gasto (calculado)
  totalReceived: int("total_received").notNull().default(0), // Total recebido (calculado)
  stockLiters: int("stock_liters").notNull().default(0), // Estoque em centésimos de litro (ex: 15050 = 150.50L)
  lastPricePerLiter: int("last_price_per_liter").notNull().default(0), // Último preço/L em centavos (ex: 650 = R$ 6.50)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type FuelBudget = typeof fuelBudget.$inferSelect;
export type InsertFuelBudget = typeof fuelBudget.$inferInsert;

/**
 * Fuel Purchases table - stores gasoline purchase records
 * Admin only - tracks fuel purchases to control stock
 */
export const fuelPurchases = mysqlTable("fuel_purchases", {
  id: int("id").autoincrement().primaryKey(),
  monthYear: varchar("month_year", { length: 7 }).notNull(), // Format: "2025-12" (YYYY-MM)
  litersPurchased: int("liters_purchased").notNull(), // Litros comprados em centésimos (ex: 10000 = 100.00L)
  amountPaid: int("amount_paid").notNull(), // Valor pago em centavos (ex: 65000 = R$ 650.00)
  pricePerLiter: int("price_per_liter").notNull(), // Preço/L calculado em centavos (ex: 650 = R$ 6.50)
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
  purchasedBy: int("purchased_by"), // references users.id
  notes: text("notes"), // Observações (ex: "Posto Shell, NF 12345")
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type FuelPurchase = typeof fuelPurchases.$inferSelect;
export type InsertFuelPurchase = typeof fuelPurchases.$inferInsert;

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
  reprovationPhotos: text("reprovation_photos"), // JSON array: [{itemName: string, photoUrl: string}]
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Inspection = typeof inspections.$inferSelect;
export type InsertInspection = typeof inspections.$inferInsert;
