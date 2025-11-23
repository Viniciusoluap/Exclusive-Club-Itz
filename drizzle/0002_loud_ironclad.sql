ALTER TABLE `allowed_clients` ADD `quota_type` enum('full','half') DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE `allowed_clients` ADD `quota_count` int DEFAULT 1 NOT NULL;