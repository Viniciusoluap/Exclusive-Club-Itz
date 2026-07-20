CREATE TABLE `gallon_stock` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gallon_number` int NOT NULL,
	`stock_liters` int NOT NULL DEFAULT 0,
	`last_price_per_liter` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE `fuel_purchases` ADD `gallon_number` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `fuel_records` ADD `gallon_number` int DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `gallon_number_idx` ON `gallon_stock` (`gallon_number`);