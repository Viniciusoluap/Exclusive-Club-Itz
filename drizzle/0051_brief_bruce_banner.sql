CREATE TABLE `bpo_charges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`asaas_charge_id` varchar(64),
	`asaas_customer_id` varchar(64),
	`client_id` int,
	`client_name` varchar(255),
	`client_email` varchar(320),
	`value` decimal(10,2) NOT NULL,
	`net_value` decimal(10,2),
	`amount_paid` decimal(10,2) DEFAULT '0',
	`due_date` varchar(10) NOT NULL,
	`paid_date` varchar(10),
	`status` enum('pending','received','confirmed','overdue','refunded','receivedInCash','awaitingChargeback','detached','partiallyPaid') NOT NULL DEFAULT 'pending',
	`type` enum('monthly','quota_sale','fuel','repair','other') DEFAULT 'other',
	`billing_type` varchar(32),
	`description` text,
	`external_reference` varchar(255),
	`payment_link` text,
	`invoice_url` text,
	`bank_slip_url` text,
	`synced_at` timestamp,
	`source` enum('asaas_import','asaas_webhook','manual','system') DEFAULT 'system',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bpo_charges_id` PRIMARY KEY(`id`),
	CONSTRAINT `bpo_charges_asaas_charge_id_unique` UNIQUE(`asaas_charge_id`)
);
--> statement-breakpoint
CREATE INDEX `bpo_charges_asaas_charge_id_idx` ON `bpo_charges` (`asaas_charge_id`);--> statement-breakpoint
CREATE INDEX `bpo_charges_client_id_idx` ON `bpo_charges` (`client_id`);--> statement-breakpoint
CREATE INDEX `bpo_charges_due_date_idx` ON `bpo_charges` (`due_date`);--> statement-breakpoint
CREATE INDEX `bpo_charges_status_idx` ON `bpo_charges` (`status`);