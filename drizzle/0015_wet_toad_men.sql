CREATE TABLE `fuel_budget` (
	`id` int AUTO_INCREMENT NOT NULL,
	`month_year` varchar(7) NOT NULL,
	`total_budget` int NOT NULL DEFAULT 0,
	`total_spent` int NOT NULL DEFAULT 0,
	`total_received` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fuel_budget_id` PRIMARY KEY(`id`),
	CONSTRAINT `fuel_budget_month_year_unique` UNIQUE(`month_year`)
);
--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `asaas_charge_id` varchar(100);--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `payment_status` enum('pending','paid','cancelled','overdue') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `paid_at` timestamp;--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `due_date` timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `receipt_url` text;--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `recorded_by` varchar(320) NOT NULL;