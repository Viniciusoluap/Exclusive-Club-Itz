DROP TABLE `asaas_customers`;--> statement-breakpoint
DROP TABLE `asaas_payments`;--> statement-breakpoint
DROP TABLE `payment_audit_logs`;--> statement-breakpoint
DROP TABLE `payment_reconciliations`;--> statement-breakpoint
DROP TABLE `webhook_logs`;--> statement-breakpoint
ALTER TABLE `allowed_clients` DROP INDEX `allowed_clients_email_unique`;--> statement-breakpoint
ALTER TABLE `employees` DROP INDEX `employees_email_unique`;--> statement-breakpoint
ALTER TABLE `fuel_budget` DROP INDEX `fuel_budget_month_year_unique`;--> statement-breakpoint
ALTER TABLE `system_settings` DROP INDEX `system_settings_key_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `allowed_clients` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `bookings` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `client_quotas` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `due_date_change_requests` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `employees` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `fuel_budget` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `fuel_purchases` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `fuel_records` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `inspection_charges` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `inspections` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `maintenances` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `reviews` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `system_settings` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `users` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `vessels` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `allowed_clients` MODIFY COLUMN `is_active` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `allowed_clients` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `bookings` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `client_quotas` MODIFY COLUMN `is_active` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `client_quotas` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `due_date_change_requests` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `employees` MODIFY COLUMN `is_active` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `employees` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `fuel_budget` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `fuel_purchases` MODIFY COLUMN `purchased_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `fuel_purchases` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `fuel_records` MODIFY COLUMN `recorded_by` varchar(320) NOT NULL DEFAULT 'system@exclusive.club';--> statement-breakpoint
ALTER TABLE `fuel_records` MODIFY COLUMN `recorded_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `fuel_records` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `inspection_charges` MODIFY COLUMN `charge_type` enum('inspection','repair') NOT NULL DEFAULT 'inspection';--> statement-breakpoint
ALTER TABLE `inspection_charges` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `inspections` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `maintenances` MODIFY COLUMN `description` text NOT NULL;--> statement-breakpoint
ALTER TABLE `maintenances` MODIFY COLUMN `created_by` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `maintenances` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `reviews` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `system_settings` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `vessels` MODIFY COLUMN `is_active` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `vessels` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `due_date` timestamp DEFAULT 'CURRENT_TIMESTAMP' NOT NULL;--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `receipt_url` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `is_approved` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `fuel_purchases` ADD CONSTRAINT `fuel_purchases_purchased_by_users_id_fk` FOREIGN KEY (`purchased_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `allowed_clients_email_unique` ON `allowed_clients` (`email`);--> statement-breakpoint
CREATE INDEX `email` ON `employees` (`email`);--> statement-breakpoint
CREATE INDEX `month_year` ON `fuel_budget` (`month_year`);--> statement-breakpoint
CREATE INDEX `key` ON `system_settings` (`key`);--> statement-breakpoint
CREATE INDEX `users_openId_unique` ON `users` (`openId`);