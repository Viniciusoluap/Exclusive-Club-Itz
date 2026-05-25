ALTER TABLE `inspection_charges` MODIFY COLUMN `payment_status` enum('pending','paid','overdue','partiallyPaid','cancelled') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `inspection_charges` ADD `amount_paid` decimal(10,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` varchar(255);