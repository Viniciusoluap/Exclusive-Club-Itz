CREATE TABLE `fuel_record_containers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fuel_record_id` int NOT NULL,
	`gallon_number` int NOT NULL,
	`liters_initial` int NOT NULL,
	`weight_full` int NOT NULL,
	`weight_after` int NOT NULL,
	`weight_consumed` int NOT NULL,
	`liters_used` int NOT NULL,
	`photo_before_url` text NOT NULL,
	`photo_after_url` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE INDEX `fuel_record_id_idx` ON `fuel_record_containers` (`fuel_record_id`);