ALTER TABLE `subscription_charges` MODIFY COLUMN `status` enum('pending','paid','overdue','cancelled','partial') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `subscription_charges` ADD `amount_paid` decimal(10,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_charges` ADD `payment_links` text;