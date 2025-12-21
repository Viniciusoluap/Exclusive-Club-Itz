CREATE TABLE `fuel_purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`month_year` varchar(7) NOT NULL,
	`liters_purchased` int NOT NULL,
	`amount_paid` int NOT NULL,
	`price_per_liter` int NOT NULL,
	`purchased_at` timestamp NOT NULL DEFAULT (now()),
	`purchased_by` int,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fuel_purchases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `fuel_budget` ADD `stock_liters` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `fuel_budget` ADD `last_price_per_liter` int DEFAULT 0 NOT NULL;