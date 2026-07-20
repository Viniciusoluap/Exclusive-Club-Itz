CREATE TABLE `subscription_charges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subscription_id` int NOT NULL,
	`asaas_payment_id` varchar(64),
	`value` decimal(10,2) NOT NULL,
	`due_date` timestamp NOT NULL,
	`paid_date` timestamp,
	`status` enum('pending','paid','overdue','cancelled') NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`type` enum('monthly','quota_sale') NOT NULL,
	`value` decimal(10,2) NOT NULL,
	`due_day` int NOT NULL,
	`start_date` timestamp NOT NULL,
	`end_date` timestamp,
	`status` enum('active','paused','cancelled') NOT NULL DEFAULT 'active',
	`yearly_adjustment` enum('manual','ipca','igpm') NOT NULL DEFAULT 'manual',
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
