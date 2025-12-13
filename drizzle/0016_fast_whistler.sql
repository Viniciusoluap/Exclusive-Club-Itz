ALTER TABLE `fuel_records` ADD `sync_status` enum('pending','synced','failed','manual') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `sync_error` text;--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `last_sync_attempt` timestamp;--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `manual_payment_note` text;