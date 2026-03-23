CREATE TABLE `pix_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`asaas_charge_id` varchar(255) NOT NULL,
	`subscription_charge_id` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE INDEX `pix_alloc_asaas_idx` ON `pix_allocations` (`asaas_charge_id`);--> statement-breakpoint
CREATE INDEX `pix_alloc_charge_idx` ON `pix_allocations` (`subscription_charge_id`);