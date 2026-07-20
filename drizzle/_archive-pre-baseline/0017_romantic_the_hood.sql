CREATE TABLE `fuel_budget` (
	`id` int AUTO_INCREMENT NOT NULL,
	`month_year` varchar(7) NOT NULL,
	`total_budget` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fuel_budget_id` PRIMARY KEY(`id`),
	CONSTRAINT `fuel_budget_month_year_unique` UNIQUE(`month_year`)
);
