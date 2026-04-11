CREATE TABLE `expense_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cost_center` enum('salary','rent','pro_labore','fuel_operational','repair','operational','other') NOT NULL,
	`description` text NOT NULL,
	`recipient_name` varchar(255),
	`value` decimal(10,2) NOT NULL,
	`due_date` varchar(10) NOT NULL,
	`paid_date` varchar(10),
	`status` enum('pending','paid','overdue','cancelled') NOT NULL DEFAULT 'pending',
	`asaas_payment_id` varchar(255),
	`notes` text,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expense_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `er_cost_center` ON `expense_records` (`cost_center`);--> statement-breakpoint
CREATE INDEX `er_status` ON `expense_records` (`status`);--> statement-breakpoint
CREATE INDEX `er_due_date` ON `expense_records` (`due_date`);