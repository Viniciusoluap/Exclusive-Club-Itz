import { mysqlTable, mysqlSchema, AnyMySqlColumn, index, int, varchar, text, timestamp, mysqlEnum, foreignKey, decimal, tinyint, bigint } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const allowedClients = mysqlTable("allowed_clients", {
	id: int().autoincrement().notNull(),
	email: varchar({ length: 320 }).notNull(),
	name: text().notNull(),
	phone: varchar({ length: 20 }),
	cpfCnpj: varchar("cpf_cnpj", { length: 18 }),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	contractUrl: text("contract_url"),
	contract2Url: text("contract2_url"),
	documentUrl: text("document_url"),
},
(table) => [
	index("allowed_clients_email_unique").on(table.email),
]);

export const bookings = mysqlTable("bookings", {
	id: int().autoincrement().notNull(),
	clientEmail: varchar("client_email", { length: 320 }).notNull(),
	clientName: text("client_name").notNull(),
	vesselId: int("vessel_id").notNull(),
	vesselName: text("vessel_name").notNull(),
	bookingDate: bigint("booking_date", { mode: "number" }).notNull(),
	status: mysqlEnum(['pending','confirmed','used','cancelled']).default('confirmed').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const clientQuotas = mysqlTable("client_quotas", {
	id: int().autoincrement().notNull(),
	clientId: int("client_id").notNull(),
	vesselId: int("vessel_id").notNull(),
	quotaType: mysqlEnum("quota_type", ['full','half']).notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	quotaNumber: int("quota_number").notNull(),
});

export const dueDateChangeRequests = mysqlTable("due_date_change_requests", {
	id: int().autoincrement().notNull(),
	chargeId: int("charge_id").notNull(),
	clientEmail: varchar("client_email", { length: 320 }).notNull(),
	oldDueDate: timestamp("old_due_date", { mode: 'string' }).notNull(),
	newDueDate: timestamp("new_due_date", { mode: 'string' }).notNull(),
	reason: text().notNull(),
	status: mysqlEnum(['pending','approved','rejected']).default('pending').notNull(),
	adminResponse: text("admin_response"),
	processedBy: varchar("processed_by", { length: 320 }),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const employees = mysqlTable("employees", {
	id: int().autoincrement().notNull(),
	name: text().notNull(),
	email: varchar({ length: 320 }).notNull(),
	phone: varchar({ length: 20 }),
	vesselIds: text("vessel_ids"),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("email").on(table.email),
]);

export const fuelBudget = mysqlTable("fuel_budget", {
	id: int().autoincrement().notNull(),
	monthYear: varchar("month_year", { length: 7 }).notNull(),
	totalBudget: int("total_budget").default(0).notNull(),
	totalSpent: int("total_spent").default(0).notNull(),
	totalReceived: int("total_received").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	stockLiters: int("stock_liters").default(0).notNull(),
	lastPricePerLiter: int("last_price_per_liter").default(0).notNull(),
},
(table) => [
	index("month_year").on(table.monthYear),
]);

export const fuelPurchases = mysqlTable("fuel_purchases", {
	id: int().autoincrement().notNull(),
	monthYear: varchar("month_year", { length: 7 }).notNull(),
	litersPurchased: int("liters_purchased").notNull(),
	amountPaid: int("amount_paid").notNull(),
	pricePerLiter: int("price_per_liter").notNull(),
	purchasedAt: timestamp("purchased_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	purchasedBy: int("purchased_by").references(() => users.id),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	gallonNumber: int("gallon_number").default(1).notNull(),
});

export const fuelRecords = mysqlTable("fuel_records", {
	id: int().autoincrement().notNull(),
	bookingId: int("booking_id").notNull(),
	vesselId: int("vessel_id").notNull(),
	vesselName: text("vessel_name").notNull(),
	clientEmail: varchar("client_email", { length: 320 }).notNull(),
	clientName: text("client_name").notNull(),
	liters: int().notNull(),
	pricePerLiter: int("price_per_liter").notNull(),
	totalAmount: int("total_amount").notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	asaasChargeId: varchar("asaas_charge_id", { length: 100 }),
	paymentStatus: mysqlEnum("payment_status", ['pending','paid','cancelled','overdue']).default('pending').notNull(),
	paidAt: timestamp("paid_at", { mode: 'string' }),
	dueDate: timestamp("due_date", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	receiptUrl: text("receipt_url"),
	recordedBy: varchar("recorded_by", { length: 320 }).default('system@exclusive.club').notNull(),
	recordedAt: timestamp("recorded_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	asaasCustomerId: varchar("asaas_customer_id", { length: 100 }),
	paymentUrl: text("payment_url"),
	syncStatus: mysqlEnum("sync_status", ['pending','synced','failed','manual']).default('pending').notNull(),
	syncError: text("sync_error"),
	lastSyncAttempt: timestamp("last_sync_attempt", { mode: 'string' }),
	manualPaymentNote: text("manual_payment_note"),
	litersInitial: int("liters_initial"),
	weightFull: int("weight_full"),
	weightAfter: int("weight_after"),
	weightConsumed: int("weight_consumed"),
	litersCalculated: int("liters_calculated"),
	photoBeforeUrl: text("photo_before_url"),
	photoAfterUrl: text("photo_after_url"),
	gallonNumber: int("gallon_number").default(1).notNull(),
});

export const gallonStock = mysqlTable("gallon_stock", {
	id: int().autoincrement().notNull(),
	gallonNumber: int("gallon_number").notNull(),
	stockLiters: int("stock_liters").default(0).notNull(),
	lastPricePerLiter: int("last_price_per_liter").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("gallon_number_idx").on(table.gallonNumber),
]);

export const inspectionCharges = mysqlTable("inspection_charges", {
	id: int().autoincrement().notNull(),
	chargeType: mysqlEnum("charge_type", ['inspection','repair']).default('inspection').notNull(),
	inspectionId: int("inspection_id"),
	vesselId: int("vessel_id"),
	clientEmail: varchar("client_email", { length: 320 }).notNull(),
	vesselName: text("vessel_name").notNull(),
	description: text(),
	failedItems: text("failed_items"),
	amount: decimal({ precision: 10, scale: 2 }).notNull(),
	dueDate: timestamp("due_date", { mode: 'string' }).notNull(),
	asaasChargeId: varchar("asaas_charge_id", { length: 255 }),
	paymentStatus: mysqlEnum("payment_status", ['pending','paid','overdue']).default('pending').notNull(),
	receiptUrl: text("receipt_url"),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const inspections = mysqlTable("inspections", {
	id: int().autoincrement().notNull(),
	bookingId: int("booking_id"),
	vesselId: int("vessel_id").notNull(),
	vesselName: text("vessel_name").notNull(),
	vesselType: mysqlEnum("vessel_type", ['lancha','jetski']).notNull(),
	clientName: text("client_name").notNull(),
	clientEmail: varchar("client_email", { length: 320 }),
	inspectionData: text("inspection_data").notNull(),
	observations: text(),
	status: mysqlEnum(['approved','rejected']).notNull(),
	inspectedBy: text("inspected_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	reprovationPhotos: text("reprovation_photos"),
});

export const maintenances = mysqlTable("maintenances", {
	id: int().autoincrement().notNull(),
	vesselId: int("vessel_id").notNull(),
	vesselName: text("vessel_name").notNull(),
	startDate: bigint("start_date", { mode: "number" }).notNull(),
	endDate: bigint("end_date", { mode: "number" }).notNull(),
	description: text().notNull(),
	status: mysqlEnum(['scheduled','in_progress','completed','cancelled']).default('scheduled').notNull(),
	createdBy: int("created_by").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const reviews = mysqlTable("reviews", {
	id: int().autoincrement().notNull(),
	bookingId: int("booking_id").notNull(),
	clientEmail: varchar("client_email", { length: 320 }).notNull(),
	clientName: text("client_name").notNull(),
	vesselId: int("vessel_id").notNull(),
	vesselName: text("vessel_name").notNull(),
	rating: int().notNull(),
	comment: text(),
	isApproved: tinyint("is_approved").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const systemSettings = mysqlTable("system_settings", {
	id: int().autoincrement().notNull(),
	key: varchar({ length: 100 }).notNull(),
	value: text().notNull(),
	description: text(),
	updatedBy: varchar("updated_by", { length: 320 }),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("key").on(table.key),
]);

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull(),
	openId: varchar({ length: 64 }).notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['user','admin','employee']).default('user').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("users_openId_unique").on(table.openId),
]);

export const vessels = mysqlTable("vessels", {
	id: int().autoincrement().notNull(),
	name: text().notNull(),
	type: mysqlEnum(['lancha','jetski']).notNull(),
	description: text(),
	imageUrl: text("image_url"),
	capacity: int(),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	quotaCount: int("quota_count").default(6).notNull(),
	documentUrl: text("document_url"),
	extraDocumentUrl: text("extra_document_url"),
});

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AllowedClient = typeof allowedClients.$inferSelect;
export type InsertAllowedClient = typeof allowedClients.$inferInsert;
export type Vessel = typeof vessels.$inferSelect;
export type InsertVessel = typeof vessels.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;
export type ClientQuota = typeof clientQuotas.$inferSelect;
export type InsertClientQuota = typeof clientQuotas.$inferInsert;
export type Maintenance = typeof maintenances.$inferSelect;
export type InsertMaintenance = typeof maintenances.$inferInsert;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;
export type GallonStock = typeof gallonStock.$inferSelect;
export type InsertGallonStock = typeof gallonStock.$inferInsert;
export type FuelPurchase = typeof fuelPurchases.$inferSelect;
export type InsertFuelPurchase = typeof fuelPurchases.$inferInsert;
export type FuelRecord = typeof fuelRecords.$inferSelect;
export type InsertFuelRecord = typeof fuelRecords.$inferInsert;
