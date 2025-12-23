ALTER TABLE `inspection_charges` MODIFY COLUMN `inspection_id` int;--> statement-breakpoint
ALTER TABLE `inspection_charges` MODIFY COLUMN `failed_items` text;--> statement-breakpoint
ALTER TABLE `inspection_charges` ADD `charge_type` enum('inspection','repair') NOT NULL;--> statement-breakpoint
ALTER TABLE `inspection_charges` ADD `vessel_id` int;--> statement-breakpoint
ALTER TABLE `inspection_charges` ADD `description` text;