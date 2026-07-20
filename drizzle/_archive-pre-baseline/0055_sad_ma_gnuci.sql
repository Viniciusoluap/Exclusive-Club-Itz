ALTER TABLE `expense_records` ADD `source_type` enum('transfer','fee','bill','manual') DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE `expense_records` ADD `manually_classified` int DEFAULT 0;