CREATE TABLE `client_quotas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`vessel_id` int NOT NULL,
	`quota_number` int NOT NULL,
	`quota_type` enum('full','half') NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_quotas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vessel_id` int NOT NULL,
	`vessel_name` text NOT NULL,
	`start_date` bigint NOT NULL,
	`end_date` bigint NOT NULL,
	`description` text NOT NULL,
	`status` enum('scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `maintenances_id` PRIMARY KEY(`id`)
);
