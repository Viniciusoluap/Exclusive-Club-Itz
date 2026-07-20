CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(20),
	`vessel_ids` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `fuel_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`booking_id` int NOT NULL,
	`vessel_id` int NOT NULL,
	`vessel_name` text NOT NULL,
	`client_email` varchar(320) NOT NULL,
	`client_name` text NOT NULL,
	`liters` int NOT NULL,
	`price_per_liter` int NOT NULL,
	`total_amount` int NOT NULL,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fuel_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inspections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`booking_id` int,
	`vessel_id` int NOT NULL,
	`vessel_name` text NOT NULL,
	`vessel_type` enum('lancha','jetski') NOT NULL,
	`client_name` text NOT NULL,
	`inspection_data` text NOT NULL,
	`observations` text,
	`status` enum('approved','rejected') NOT NULL,
	`inspected_by` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inspections_id` PRIMARY KEY(`id`)
);
