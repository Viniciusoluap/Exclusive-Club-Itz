ALTER TABLE `fuel_records` ADD `recorded_by` int;--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `recorded_at` timestamp DEFAULT (now()) NOT NULL;