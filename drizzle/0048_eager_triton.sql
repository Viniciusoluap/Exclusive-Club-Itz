DROP INDEX `asaas_payment_id` ON `unclassified_charges`;--> statement-breakpoint
DROP INDEX `classified` ON `unclassified_charges`;--> statement-breakpoint
ALTER TABLE `unclassified_charges` MODIFY COLUMN `due_date` varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE `unclassified_charges` MODIFY COLUMN `paid_date` varchar(10);--> statement-breakpoint
ALTER TABLE `unclassified_charges` ADD `asaas_status` varchar(50) DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE `unclassified_charges` ADD `last_synced_at` timestamp DEFAULT 'CURRENT_TIMESTAMP' NOT NULL;--> statement-breakpoint
CREATE INDEX `uc_asaas_payment_id` ON `unclassified_charges` (`asaas_payment_id`);--> statement-breakpoint
CREATE INDEX `uc_classified` ON `unclassified_charges` (`classified`);--> statement-breakpoint
CREATE INDEX `uc_asaas_customer_id` ON `unclassified_charges` (`asaas_customer_id`);--> statement-breakpoint
CREATE INDEX `uc_status` ON `unclassified_charges` (`status`);--> statement-breakpoint
CREATE INDEX `uc_due_date` ON `unclassified_charges` (`due_date`);