CREATE TABLE `unclassified_charges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`asaas_payment_id` varchar(255) NOT NULL,
	`asaas_customer_id` varchar(255) NOT NULL,
	`asaas_customer_name` varchar(255),
	`asaas_customer_email` varchar(320),
	`asaas_customer_cpf_cnpj` varchar(20),
	`description` text,
	`value` decimal(10,2) NOT NULL,
	`due_date` timestamp NOT NULL,
	`paid_date` timestamp,
	`status` enum('pending','paid','overdue','cancelled') NOT NULL DEFAULT 'pending',
	`classified` tinyint NOT NULL DEFAULT 0,
	`classified_at` timestamp,
	`classified_by` int,
	`linked_client_id` int,
	`linked_subscription_id` int,
	`linked_charge_id` int,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	CONSTRAINT `unclassified_charges_asaas_payment_id_unique` UNIQUE(`asaas_payment_id`)
);
--> statement-breakpoint
CREATE INDEX `asaas_payment_id` ON `unclassified_charges` (`asaas_payment_id`);--> statement-breakpoint
CREATE INDEX `classified` ON `unclassified_charges` (`classified`);