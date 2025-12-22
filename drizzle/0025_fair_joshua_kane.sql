CREATE TABLE `inspection_charges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inspection_id` int NOT NULL,
	`client_email` varchar(320) NOT NULL,
	`vessel_name` text NOT NULL,
	`failed_items` text NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`due_date` timestamp NOT NULL,
	`asaas_charge_id` varchar(255),
	`payment_status` enum('pending','paid','overdue','cancelled') NOT NULL DEFAULT 'pending',
	`receipt_url` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspection_charges_id` PRIMARY KEY(`id`)
);
