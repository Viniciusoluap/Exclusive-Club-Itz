CREATE TABLE `client_quotas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`vessel_id` int NOT NULL,
	`quota_type` enum('full','half') NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_quotas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `allowed_clients` DROP COLUMN `quota_type`;--> statement-breakpoint
ALTER TABLE `allowed_clients` DROP COLUMN `quota_count`;