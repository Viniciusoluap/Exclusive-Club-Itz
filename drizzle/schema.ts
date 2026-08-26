import { mysqlTable, mysqlSchema, AnyMySqlColumn, index, uniqueIndex, int, varchar, text, timestamp, mysqlEnum, foreignKey, decimal, tinyint, bigint } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const allowedClients = mysqlTable("allowed_clients", {
	id: int().autoincrement().notNull().primaryKey(),
	email: varchar({ length: 320 }).notNull(),
	name: text().notNull(),
	phone: varchar({ length: 20 }),
	cpfCnpj: varchar("cpf_cnpj", { length: 18 }),
	rg: varchar("rg", { length: 30 }),
	address: varchar("address", { length: 255 }),
	neighborhood: varchar("neighborhood", { length: 100 }),
	city: varchar("city", { length: 100 }),
	state: varchar("state", { length: 2 }),
	zipCode: varchar("zip_code", { length: 10 }),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
	contractUrl: text("contract_url"),
	contract2Url: text("contract2_url"),
	documentUrl: text("document_url"),
},
(table) => [
	// Story 13 (Fase 1, DB-09/DB-14): apesar do nome "_unique", isto era um
	// index() comum (não uniqueIndex()) — nenhuma constraint UNIQUE de fato
	// existia no banco. getAllowedClientByEmail() já assume 1 cliente por
	// email (usa .limit(1)); agora isso é garantido pelo schema também.
	// Nome novo (sufixo _uq, não mais "_unique") de propósito: a migration
	// cria esta constraint ANTES de derrubar o índice antigo do mesmo nome
	// (ver drizzle/0002_unique_email_openid.sql) — precisa de um nome
	// diferente para os dois coexistirem no instante da troca seguro.
	uniqueIndex("allowed_clients_email_uq").on(table.email),
]);

export const bookings = mysqlTable("bookings", {
	id: int().autoincrement().notNull().primaryKey(),
	clientEmail: varchar("client_email", { length: 320 }).notNull(),
	clientName: text("client_name").notNull(),
	vesselId: int("vessel_id").notNull(),
	vesselName: text("vessel_name").notNull(),
	bookingDate: bigint("booking_date", { mode: "number" }).notNull(),
	status: mysqlEnum(['pending','confirmed','used','cancelled']).default('confirmed').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	// Story 16 (Fase 1, DB-06/DB-07): sem nenhum índice além da PK antes —
	// portal do cliente (bookings.myBookings/getBookingsByEmail) e todo
	// scoping por dono faziam full scan. booking_date cobre calendário e
	// checagens de conflito (getByDateRange/getBookingsByVesselAndDate).
	index("bookings_client_email_idx").on(table.clientEmail),
	index("bookings_vessel_id_idx").on(table.vesselId),
	index("bookings_booking_date_idx").on(table.bookingDate),
]);

export const clientQuotas = mysqlTable("client_quotas", {
	id: int().autoincrement().notNull().primaryKey(),
	clientId: int("client_id").notNull(),
	vesselId: int("vessel_id").notNull(),
	quotaType: mysqlEnum("quota_type", ['full','half']).notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
	quotaNumber: int("quota_number").notNull(),
},
(table) => [
	// getClientQuotasByClientId/getClientQuotaByVessel filtram por estas
	// colunas em toda tela de reserva do cliente.
	index("client_quotas_client_id_idx").on(table.clientId),
	index("client_quotas_vessel_id_idx").on(table.vesselId),
]);

export const dueDateChangeRequests = mysqlTable("due_date_change_requests", {
	id: int().autoincrement().notNull().primaryKey(),
	chargeId: int("charge_id").notNull(),
	clientEmail: varchar("client_email", { length: 320 }).notNull(),
	oldDueDate: timestamp("old_due_date", { mode: 'string' as const }).notNull(),
	newDueDate: timestamp("new_due_date", { mode: 'string' as const }).notNull(),
	reason: text().notNull(),
	status: mysqlEnum(['pending','approved','rejected']).default('pending').notNull(),
	adminResponse: text("admin_response"),
	processedBy: varchar("processed_by", { length: 320 }),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	// Story 16 (Fase 1, DB-06/DB-07): join usado no portal de cobranças
	// (routers.ts, LEFT JOIN due_date_change_requests ON charge_id = ic.id).
	index("due_date_change_requests_charge_id_idx").on(table.chargeId),
]);

export const employees = mysqlTable("employees", {
	id: int().autoincrement().notNull().primaryKey(),
	name: text().notNull(),
	email: varchar({ length: 320 }).notNull(),
	phone: varchar({ length: 20 }),
	vesselIds: text("vessel_ids"),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	uniqueIndex("email").on(table.email),
]);

export const fuelBudget = mysqlTable("fuel_budget", {
	id: int().autoincrement().notNull().primaryKey(),
	monthYear: varchar("month_year", { length: 7 }).notNull(),
	totalBudget: int("total_budget").default(0).notNull(),
	totalSpent: int("total_spent").default(0).notNull(),
	totalReceived: int("total_received").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
	stockLiters: int("stock_liters").default(0).notNull(),
	lastPricePerLiter: int("last_price_per_liter").default(0).notNull(),
},
(table) => [
	index("month_year").on(table.monthYear),
]);

export const fuelPurchases = mysqlTable("fuel_purchases", {
	id: int().autoincrement().notNull().primaryKey(),
	monthYear: varchar("month_year", { length: 7 }).notNull(),
	litersPurchased: int("liters_purchased").notNull(),
	amountPaid: int("amount_paid").notNull(),
	pricePerLiter: int("price_per_liter").notNull(),
	purchasedAt: timestamp("purchased_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	purchasedBy: int("purchased_by").references(() => users.id),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	gallonNumber: int("gallon_number").default(1).notNull(),
},
(table) => [
	// Story 16 (Fase 1, DB-06/DB-07): getMonthPurchasesByGallon/
	// calculateGallonFinalStock agregam por (month_year, gallon_number) —
	// sem índice, full scan em toda tela de orçamento/estoque de combustível.
	index("fuel_purchases_month_year_gallon_idx").on(table.monthYear, table.gallonNumber),
]);

export const fuelRecords = mysqlTable("fuel_records", {
	id: int().autoincrement().notNull().primaryKey(),
	bookingId: int("booking_id"), // Nullable para abastecimentos operacionais
	vesselId: int("vessel_id").notNull(),
	vesselName: text("vessel_name").notNull(),
	clientEmail: varchar("client_email", { length: 320 }).notNull(),
	clientName: text("client_name").notNull(),
	liters: int().notNull(),
	pricePerLiter: int("price_per_liter").notNull(),
	totalAmount: int("total_amount").notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	asaasChargeId: varchar("asaas_charge_id", { length: 100 }),
	paymentStatus: mysqlEnum("payment_status", ['pending','paid','cancelled','overdue']).default('pending').notNull(),
	paidAt: timestamp("paid_at", { mode: 'string' as const }),
	dueDate: timestamp("due_date", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	receiptUrl: text("receipt_url"),
	recordedBy: varchar("recorded_by", { length: 320 }).default('system@exclusive.club').notNull(),
	recordedAt: timestamp("recorded_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	asaasCustomerId: varchar("asaas_customer_id", { length: 100 }),
	paymentUrl: text("payment_url"),
	syncStatus: mysqlEnum("sync_status", ['pending','synced','failed','manual']).default('pending').notNull(),
	syncError: text("sync_error"),
	lastSyncAttempt: timestamp("last_sync_attempt", { mode: 'string' as const }),
	manualPaymentNote: text("manual_payment_note"),
	litersInitial: int("liters_initial"),
	weightFull: int("weight_full"),
	weightAfter: int("weight_after"),
	weightConsumed: int("weight_consumed"),
	litersCalculated: int("liters_calculated"),
	photoBeforeUrl: text("photo_before_url"),
	photoAfterUrl: text("photo_after_url"),
	gallonNumber: int("gallon_number").default(1).notNull(),
	isOperational: tinyint("is_operational").default(0).notNull(),
},
(table) => [
	// Story 16 (Fase 1, DB-06/DB-07): fuelRecords.myRecords (portal do
	// cliente) filtra por client_email; fuelRecords.list/stats agregam por
	// mês via created_at; fuelRecords.getByBooking filtra por booking_id.
	// Nenhum índice existia além da PK — full scan em todas essas telas.
	index("fuel_records_client_email_idx").on(table.clientEmail),
	index("fuel_records_booking_id_idx").on(table.bookingId),
	index("fuel_records_vessel_id_idx").on(table.vesselId),
	index("fuel_records_created_at_idx").on(table.createdAt),
]);

export const gallonStock = mysqlTable("gallon_stock", {
	id: int().autoincrement().notNull().primaryKey(),
	gallonNumber: int("gallon_number").notNull(),
	stockLiters: int("stock_liters").default(0).notNull(),
	lastPricePerLiter: int("last_price_per_liter").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("gallon_number_idx").on(table.gallonNumber),
]);

export const inspectionCharges = mysqlTable("inspection_charges", {
	id: int().autoincrement().notNull().primaryKey(),
	chargeType: mysqlEnum("charge_type", ['inspection','repair']).default('inspection').notNull(),
	inspectionId: int("inspection_id"),
	vesselId: int("vessel_id"),
	clientEmail: varchar("client_email", { length: 320 }).notNull(),
	vesselName: text("vessel_name").notNull(),
	description: text(),
	failedItems: text("failed_items"),
	amount: decimal({ precision: 10, scale: 2 }).notNull(),
	dueDate: timestamp("due_date", { mode: 'string' as const }).notNull(),
	asaasChargeId: varchar("asaas_charge_id", { length: 255 }),
	paymentStatus: mysqlEnum("payment_status", ['pending','paid','overdue','partiallyPaid','cancelled']).default('pending').notNull(),
	amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).default('0.00').notNull(),
	receiptUrl: text("receipt_url"),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	// Story 16 (Fase 1, DB-06/DB-07): portal do cliente (myFailedInspections)
	// e telas admin filtram por estas colunas.
	index("inspection_charges_client_email_idx").on(table.clientEmail),
	index("inspection_charges_inspection_id_idx").on(table.inspectionId),
	index("inspection_charges_vessel_id_idx").on(table.vesselId),
]);

export const inspections = mysqlTable("inspections", {
	id: int().autoincrement().notNull().primaryKey(),
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
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	reprovationPhotos: text("reprovation_photos"),
},
(table) => [
	// myFailedInspections (portal) filtra por client_email + status; list
	// admin junta por booking_id/vessel_id.
	index("inspections_client_email_idx").on(table.clientEmail),
	index("inspections_booking_id_idx").on(table.bookingId),
	index("inspections_vessel_id_idx").on(table.vesselId),
]);

export const maintenances = mysqlTable("maintenances", {
	id: int().autoincrement().notNull().primaryKey(),
	vesselId: int("vessel_id").notNull(),
	vesselName: text("vessel_name").notNull(),
	startDate: bigint("start_date", { mode: "number" }).notNull(),
	endDate: bigint("end_date", { mode: "number" }).notNull(),
	description: text().notNull(),
	status: mysqlEnum(['scheduled','in_progress','completed','cancelled']).default('scheduled').notNull(),
	createdBy: int("created_by").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	// checkConflicts/getActiveMaintenancesByVesselAndDate filtram por
	// vessel_id no calendário de manutenções.
	index("maintenances_vessel_id_idx").on(table.vesselId),
]);

export const reviews = mysqlTable("reviews", {
	id: int().autoincrement().notNull().primaryKey(),
	bookingId: int("booking_id").notNull(),
	clientEmail: varchar("client_email", { length: 320 }).notNull(),
	clientName: text("client_name").notNull(),
	vesselId: int("vessel_id").notNull(),
	vesselName: text("vessel_name").notNull(),
	rating: int().notNull(),
	comment: text(),
	isApproved: tinyint("is_approved").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	// reviews.listByVessel/stats (público, mostrado na página da embarcação)
	// filtra por vessel_id em toda visita.
	index("reviews_vessel_id_idx").on(table.vesselId),
	index("reviews_booking_id_idx").on(table.bookingId),
]);

export const systemSettings = mysqlTable("system_settings", {
	id: int().autoincrement().notNull().primaryKey(),
	key: varchar({ length: 100 }).notNull(),
	value: text().notNull(),
	description: text(),
	updatedBy: varchar("updated_by", { length: 320 }),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("key").on(table.key),
]);

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull().primaryKey(),
	openId: varchar({ length: 64 }).notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['user','admin','employee']).default('user').notNull(),
	passwordHash: varchar("password_hash", { length: 255 }),
	createdAt: timestamp({ mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => [
	// Story 13 (Fase 1, DB-09/DB-14): "users_openId_unique" também era um
	// index() comum, não uma constraint UNIQUE real — o que significa que o
	// upsertUser() (server/db.ts, INSERT ... ON DUPLICATE KEY UPDATE
	// keyed em openId) nunca conseguia de fato disparar o caminho de UPDATE
	// em condição de corrida (dois logins simultâneos do mesmo openId): sem
	// uma chave única para colidir, o INSERT simplesmente cria uma segunda
	// linha para o mesmo usuário. uniqueIndex() corrige o schema E a
	// semântica do upsert ao mesmo tempo. Nome com sufixo _uq (não mais
	// "_unique") pelo mesmo motivo do allowed_clients acima — ver
	// drizzle/0002_unique_email_openid.sql.
	uniqueIndex("users_open_id_uq").on(table.openId),
	// email não tinha NENHUM índice/constraint antes — getUserByEmail() já
	// assume 1 usuário por email (usa .limit(1)); múltiplos NULL continuam
	// permitidos sob UNIQUE (usuários sem email cadastrado).
	uniqueIndex("users_email_uq").on(table.email),
]);

export const fuelRecordContainers = mysqlTable("fuel_record_containers", {
	id: int().autoincrement().notNull().primaryKey(),
	fuelRecordId: int("fuel_record_id").notNull(),
	gallonNumber: int("gallon_number").notNull(),
	litersInitial: int("liters_initial").notNull(),
	weightFull: int("weight_full").notNull(),
	weightAfter: int("weight_after").notNull(),
	weightConsumed: int("weight_consumed").notNull(),
	litersUsed: int("liters_used").notNull(),
	photoBeforeUrl: text("photo_before_url").notNull(),
	photoAfterUrl: text("photo_after_url").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => [
	index("fuel_record_id_idx").on(table.fuelRecordId),
]);

export const backupHistory = mysqlTable("backup_history", {
	id: int().autoincrement().notNull().primaryKey(),
	startedAt: timestamp("started_at", { mode: 'string' as const }).notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' as const }),
	status: mysqlEnum(['running','success','failed']).notNull(),
	fileName: text("file_name"),
	fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
	durationSeconds: int("duration_seconds"),
	errorMessage: text("error_message"),
	driveFileId: text("drive_file_id"),
	driveFileUrl: text("drive_file_url"),
	localFilePath: text("local_file_path"),
	s3Url: text("s3_url"), // URL do backup no S3
	// Progresso do backup em andamento. Percentual de trabalho concluído (não
	// de tempo decorrido) e a etapa atual, para a tela mostrar uma barra em vez
	// de um "Em Execução" que não distingue trabalhando de travado.
	progressPercent: int("progress_percent"),
	progressStep: varchar("progress_step", { length: 120 }),
});

// subscriptions e subscription_charges removidas — substituídas por bpo_charges

export const vessels = mysqlTable("vessels", {
	id: int().autoincrement().notNull().primaryKey(),
	name: text().notNull(),
	type: mysqlEnum(['lancha','jetski']).notNull(),
	description: text(),
	imageUrl: text("image_url"),
	capacity: int(),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
	quotaCount: int("quota_count").default(6).notNull(),
	documentUrl: text("document_url"),
	extraDocumentUrl: text("extra_document_url"),
});

// pixAllocations, excludedAsaasCharges e unclassifiedCharges removidas — substituídas por bpo_charges

// ─── Despesas / Centro de Custos ───────────────────────────────────────────
export const expenseRecords = mysqlTable("expense_records", {
	id: int().autoincrement().notNull().primaryKey(),
	/** Centro de custo da despesa */
	costCenter: mysqlEnum("cost_center", [
		'salary',
		'rent',
		'pro_labore',
		'fuel_operational',
		'repair',
		'operational',
		'withdrawal',
		'other'
	]).notNull(),
	/** Descrição livre da despesa */
	description: text().notNull(),
	/** Nome do fornecedor, funcionário ou beneficiário */
	recipientName: varchar("recipient_name", { length: 255 }),
	/** Valor da despesa */
	value: decimal({ precision: 10, scale: 2 }).notNull(),
	/** Data de vencimento (YYYY-MM-DD) */
	dueDate: varchar("due_date", { length: 10 }).notNull(),
	/** Data de pagamento (YYYY-MM-DD) */
	paidDate: varchar("paid_date", { length: 10 }),
	/** Status da despesa */
	status: mysqlEnum(['pending', 'paid', 'overdue', 'cancelled']).default('pending').notNull(),
	/** ID do pagamento no Asaas (opcional, para despesas pagas via Asaas) */
	asaasPaymentId: varchar("asaas_payment_id", { length: 255 }),
	/** Origem da despesa: transfer=PIX/TED saído, fee=taxa Asaas, bill=boleto pago, manual=cadastro manual */
	sourceType: mysqlEnum("source_type", ['transfer', 'fee', 'bill', 'manual', 'withdrawal']).default('manual'),
	/** Indica se o centro de custo foi classificado manualmente (protege contra reclassificação automática) */
	manuallyClassified: int("manually_classified").default(0),
	/** Observações adicionais */
	notes: text(),
	/** Usuário que cadastrou */
	createdBy: int("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("er_cost_center").on(table.costCenter),
	index("er_status").on(table.status),
	index("er_due_date").on(table.dueDate),
]);

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
export type FuelRecordContainer = typeof fuelRecordContainers.$inferSelect;
export type InsertFuelRecordContainer = typeof fuelRecordContainers.$inferInsert;
export type BackupHistory = typeof backupHistory.$inferSelect;
export type InsertBackupHistory = typeof backupHistory.$inferInsert;
// Tipos legados removidos — usar BpoCharge / InsertBpoCharge
export type ExpenseRecord = typeof expenseRecords.$inferSelect;
export type InsertExpenseRecord = typeof expenseRecords.$inferInsert;

// ============================================================
// BPO CHARGES — Fonte única de verdade do BPO Financeiro
// Substitui subscription_charges + unclassified_charges como
// base dos cards de totais e da lista de cobranças.
// ============================================================
export const bpoCharges = mysqlTable("bpo_charges", {
  id: int("id").autoincrement().primaryKey(),

  // Identificadores Asaas
  asaasChargeId: varchar("asaas_charge_id", { length: 64 }).unique(),
  asaasCustomerId: varchar("asaas_customer_id", { length: 64 }),

  // Cliente (desnormalizado para performance)
  clientId: int("client_id"),
  clientName: varchar("client_name", { length: 255 }),
  clientEmail: varchar("client_email", { length: 320 }),

  // Valores financeiros
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  netValue: decimal("net_value", { precision: 10, scale: 2 }),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).default("0"),

  // Datas
  dueDate: varchar("due_date", { length: 10 }).notNull(),  // "YYYY-MM-DD"
  paidDate: varchar("paid_date", { length: 10 }),

  // Status e classificação
  status: mysqlEnum("status", [
    "pending", "received", "confirmed", "overdue",
    "refunded", "receivedInCash", "awaitingChargeback",
    "detached", "partiallyPaid", "cancelled"
  ]).notNull().default("pending"),

  type: mysqlEnum("type", [
    "monthly", "quota_sale", "fuel", "repair", "inspection", "other"
  ]).default("other"),

  classifiedBy: mysqlEnum("classified_by", [
    "auto", "manual", "unclassified"
  ]).default("unclassified"),

  billingType: varchar("billing_type", { length: 32 }),  // PIX, BOLETO, CREDIT_CARD

  // Metadados
  description: text("description"),
  externalReference: varchar("external_reference", { length: 255 }),
  paymentLink: text("payment_link"),
  invoiceUrl: text("invoice_url"),
  bankSlipUrl: text("bank_slip_url"),
  // JSON array de asaasChargeIds vinculados (para split e pagamento parcial)
  paymentLinks: text("payment_links"),
  // URL do comprovante enviado pelo admin (foto/arquivo do comprovante real)
  receiptUrl: text("receipt_url"),

  // Controle de sincronização
  syncedAt: timestamp("synced_at", { mode: 'string' as const }),
  // "asaas_reconcile": gravado pela reconciliação individual de cobrança.
  // O valor era escrito pelo código sem existir no enum — em banco estrito a
  // reconciliação falhava. O `@ts-nocheck` do bpoRouter escondia o erro.
  source: mysqlEnum("source", [
    "asaas_import", "asaas_webhook", "manual", "system", "asaas_reconcile"
  ]).default("system"),

  createdAt: timestamp("created_at", { mode: 'string' as const }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' as const }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("bpo_charges_asaas_charge_id_idx").on(table.asaasChargeId),
  index("bpo_charges_client_id_idx").on(table.clientId),
  index("bpo_charges_due_date_idx").on(table.dueDate),
  index("bpo_charges_status_idx").on(table.status),
  // Story 16 (Fase 1, DB-06/DB-07): fallback por email (case-insensitive,
  // ver Story 8/9 — markAsPaid, webhook) e o portal de cobranças filtram
  // direto por client_email quando client_id é NULL.
  index("bpo_charges_client_email_idx").on(table.clientEmail),
]);

export type BpoCharge = typeof bpoCharges.$inferSelect;
export type InsertBpoCharge = typeof bpoCharges.$inferInsert;

// Cache de clientes Asaas — evita chamadas repetidas à API
export const asaasCustomers = mysqlTable("asaas_customers", {
  id: int().autoincrement().primaryKey(),
  clientEmail: varchar("client_email", { length: 320 }).notNull(),
  asaasCustomerId: varchar("asaas_customer_id", { length: 100 }).notNull(),
  cpfCnpj: varchar("cpf_cnpj", { length: 18 }),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("asaas_customers_email_unique").on(table.clientEmail),
  index("asaas_customers_customer_id_idx").on(table.asaasCustomerId),
]);
export type AsaasCustomer = typeof asaasCustomers.$inferSelect;
export type InsertAsaasCustomer = typeof asaasCustomers.$inferInsert;

// Trilha de auditoria de webhooks de pagamento (Asaas). DB-21 / Story 5.
// Recriada após ter sido dropada em 0033_good_lila_cheney.sql (linha 5) e nunca
// recriada — o INSERT de server/_core/index.ts falhava 100% em silêncio.
// O schema abaixo é o schema CANÔNICO efetivamente em produção
// (ver scripts/restore-missing-tables.mjs) e alinhado ao INSERT do webhook e ao
// SELECT do painel admin (bpoRouter.listWebhookLogs).
//
// RETENÇÃO / TTL (DB-21 AC): esta tabela cresce indefinidamente. Um job de
// limpeza (cron/scheduler) DEVE expurgar registros com created_at < NOW() - 90 dias.
// TODO(DB-21): implementar o job de retenção de 90 dias (fora do escopo desta story;
//   a story cobre a recriação da tabela + correção das falhas silenciosas de insert).
//   Query de expurgo: DELETE FROM webhook_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
export const webhookLogs = mysqlTable("webhook_logs", {
  id: int().autoincrement().primaryKey(),
  event: varchar("event", { length: 100 }).notNull(),
  asaasPaymentId: varchar("asaas_payment_id", { length: 255 }),
  payload: text("payload"),
  processed: tinyint("processed").default(0).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { mode: 'string' as const }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("wl_event").on(table.event),
  index("wl_asaas_payment_id").on(table.asaasPaymentId),
  index("wl_created_at").on(table.createdAt),
  // Story 9 (Fase 1, SYS-19): chave de idempotência do webhook. Um mesmo
  // evento (event + payment.id) só pode ter uma linha "reivindicada" aqui —
  // é essa constraint que impede reprocessar um reenvio do Asaas do mesmo
  // evento como se fosse novo. MySQL/TiDB tratam múltiplos NULL em
  // asaas_payment_id como distintos (não conflitam entre si), então isso
  // não afeta payloads malformados que nunca chegam a ter payment.id.
  uniqueIndex("wl_event_payment_unique").on(table.event, table.asaasPaymentId),
]);
export type WebhookLog = typeof webhookLogs.$inferSelect;
export type InsertWebhookLog = typeof webhookLogs.$inferInsert;

/**
 * Controle do arquivamento incremental de anexos no backup.
 *
 * Fotos e documentos são ESTÁTICOS: uma foto de abastecimento de julho não muda
 * mais. Rebaixá-las a cada backup fazia o processo passar de 43 segundos para
 * vários minutos — e o trabalho em segundo plano não sobrevive tanto tempo
 * nesta hospedagem, então o backup morria no meio.
 *
 * Com esta tabela, cada execução processa apenas os anexos AINDA NÃO
 * arquivados, em lotes curtos. A primeira rodada cobre o acervo em várias
 * passagens; depois, cada dia só tem alguns arquivos novos.
 */
export const backupAttachments = mysqlTable("backup_attachments", {
	id: int("id").autoincrement().notNull().primaryKey(),
	sourceUrl: varchar("source_url", { length: 500 }).notNull(),
	category: varchar("category", { length: 50 }).notNull(),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	storageUrl: text("storage_url"),
	sizeBytes: int("size_bytes"),
	status: mysqlEnum("status", ["archived", "failed"]).notNull(),
	errorMessage: text("error_message"),
	archivedAt: timestamp("archived_at", { mode: 'string' as const }).defaultNow().notNull(),
}, (table) => [
	// Uma URL é arquivada uma única vez — é o que torna o processo incremental.
	uniqueIndex("backup_attachments_source_url_unique").on(table.sourceUrl),
]);
export type BackupAttachment = typeof backupAttachments.$inferSelect;
// OPEN FINANCE — conexões e dados bancários agregados
// Provider-first (Pluggy), com campos provider-agnostic para futura
// substituição por Belvo/Celcoin sem reescrever o domínio financeiro.
// ============================================================
export const openFinanceConnections = mysqlTable(
  "open_finance_connections",
  {
    id: int().autoincrement().notNull().primaryKey(),
    userId: int("user_id").notNull(),
    provider: mysqlEnum("provider", ["pluggy", "belvo", "celcoin"])
      .default("pluggy")
      .notNull(),
    providerItemId: varchar("provider_item_id", { length: 128 }).notNull(),
    clientUserId: varchar("client_user_id", { length: 128 }).notNull(),
    institutionName: varchar("institution_name", { length: 255 }),
    status: mysqlEnum("status", [
      "pending",
      "connected",
      "syncing",
      "error",
      "disconnected",
      "consent_expired",
    ])
      .default("pending")
      .notNull(),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    lastSyncedAt: timestamp("last_synced_at", { mode: "string" as const }),
    createdAt: timestamp("created_at", { mode: "string" as const })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" as const })
      .defaultNow()
      .onUpdateNow()
      .notNull(),
  },
  table => [
    uniqueIndex("of_connections_provider_item_uq").on(
      table.provider,
      table.providerItemId
    ),
    index("of_connections_user_id_idx").on(table.userId),
    index("of_connections_status_idx").on(table.status),
  ]
);

export const openFinanceAccounts = mysqlTable(
  "open_finance_accounts",
  {
    id: int().autoincrement().notNull().primaryKey(),
    connectionId: int("connection_id").notNull(),
    providerAccountId: varchar("provider_account_id", {
      length: 128,
    }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 50 }),
    subtype: varchar("subtype", { length: 80 }),
    numberMasked: varchar("number_masked", { length: 80 }),
    currencyCode: varchar("currency_code", { length: 10 })
      .default("BRL")
      .notNull(),
    balance: decimal("balance", { precision: 18, scale: 2 })
      .default("0")
      .notNull(),
    availableBalance: decimal("available_balance", { precision: 18, scale: 2 }),
    lastUpdatedAt: timestamp("last_updated_at", { mode: "string" as const }),
    createdAt: timestamp("created_at", { mode: "string" as const })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" as const })
      .defaultNow()
      .onUpdateNow()
      .notNull(),
  },
  table => [
    uniqueIndex("of_accounts_provider_account_uq").on(table.providerAccountId),
    index("of_accounts_connection_id_idx").on(table.connectionId),
  ]
);

export const openFinanceTransactions = mysqlTable(
  "open_finance_transactions",
  {
    id: int().autoincrement().notNull().primaryKey(),
    accountId: int("account_id").notNull(),
    connectionId: int("connection_id").notNull(),
    providerTransactionId: varchar("provider_transaction_id", {
      length: 128,
    }).notNull(),
    transactionDate: varchar("transaction_date", { length: 32 }).notNull(),
    description: text("description").notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    currencyCode: varchar("currency_code", { length: 10 })
      .default("BRL")
      .notNull(),
    direction: mysqlEnum("direction", ["credit", "debit", "unknown"])
      .default("unknown")
      .notNull(),
    merchantName: varchar("merchant_name", { length: 255 }),
    category: varchar("category", { length: 120 }),
    status: varchar("status", { length: 50 }),
    createdAt: timestamp("created_at", { mode: "string" as const })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" as const })
      .defaultNow()
      .onUpdateNow()
      .notNull(),
  },
  table => [
    uniqueIndex("of_transactions_provider_transaction_uq").on(
      table.providerTransactionId
    ),
    index("of_transactions_account_date_idx").on(
      table.accountId,
      table.transactionDate
    ),
    index("of_transactions_connection_date_idx").on(
      table.connectionId,
      table.transactionDate
    ),
  ]
);

export const openFinanceWebhookEvents = mysqlTable(
  "open_finance_webhook_events",
  {
    id: int().autoincrement().notNull().primaryKey(),
    providerEventId: varchar("provider_event_id", { length: 128 }).notNull(),
    event: varchar("event", { length: 100 }).notNull(),
    itemId: varchar("item_id", { length: 128 }),
    clientUserId: varchar("client_user_id", { length: 128 }),
    processed: tinyint("processed").default(0).notNull(),
    errorMessage: text("error_message"),
    receivedAt: timestamp("received_at", { mode: "string" as const })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    processedAt: timestamp("processed_at", { mode: "string" as const }),
  },
  table => [
    uniqueIndex("of_webhook_events_provider_event_uq").on(
      table.providerEventId
    ),
    index("of_webhook_events_item_idx").on(table.itemId),
    index("of_webhook_events_received_idx").on(table.receivedAt),
  ]
);

export const openFinanceSyncRuns = mysqlTable(
  "open_finance_sync_runs",
  {
    id: int().autoincrement().notNull().primaryKey(),
    connectionId: int("connection_id").notNull(),
    trigger: mysqlEnum("trigger", ["manual", "webhook", "scheduled"])
      .default("manual")
      .notNull(),
    status: mysqlEnum("status", ["running", "success", "failed"])
      .default("running")
      .notNull(),
    accountsImported: int("accounts_imported").default(0).notNull(),
    transactionsImported: int("transactions_imported").default(0).notNull(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { mode: "string" as const })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    completedAt: timestamp("completed_at", { mode: "string" as const }),
  },
  table => [
    index("of_sync_runs_connection_idx").on(table.connectionId),
    index("of_sync_runs_started_idx").on(table.startedAt),
  ]
);

export type OpenFinanceConnection = typeof openFinanceConnections.$inferSelect;
export type InsertOpenFinanceConnection =
  typeof openFinanceConnections.$inferInsert;
export type OpenFinanceAccount = typeof openFinanceAccounts.$inferSelect;
export type InsertOpenFinanceAccount = typeof openFinanceAccounts.$inferInsert;
export type OpenFinanceTransaction =
  typeof openFinanceTransactions.$inferSelect;
export type InsertOpenFinanceTransaction =
  typeof openFinanceTransactions.$inferInsert;
export type OpenFinanceWebhookEvent =
  typeof openFinanceWebhookEvents.$inferSelect;
export type InsertOpenFinanceWebhookEvent =
  typeof openFinanceWebhookEvents.$inferInsert;
export type OpenFinanceSyncRun = typeof openFinanceSyncRuns.$inferSelect;
export type InsertOpenFinanceSyncRun = typeof openFinanceSyncRuns.$inferInsert;
