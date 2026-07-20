CREATE TABLE `excluded_asaas_charges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`asaas_charge_id` varchar(255) NOT NULL,
	`excluded_by` varchar(320) NOT NULL,
	`excluded_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`reason` text,
	CONSTRAINT `excluded_asaas_charges_asaas_charge_id_unique` UNIQUE(`asaas_charge_id`)
);
--> statement-breakpoint
CREATE INDEX `asaas_charge_id` ON `excluded_asaas_charges` (`asaas_charge_id`);