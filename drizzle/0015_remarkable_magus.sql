ALTER TABLE `fuel_records` ADD `asaas_charge_id` varchar(100);--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `asaas_customer_id` varchar(100);--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `payment_status` enum('pending','paid','cancelled','overdue') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `payment_url` text;--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `paid_at` timestamp;