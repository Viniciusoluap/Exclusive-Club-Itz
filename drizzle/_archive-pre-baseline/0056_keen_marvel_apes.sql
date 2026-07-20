CREATE TABLE `asaas_customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_email` varchar(320) NOT NULL,
	`asaas_customer_id` varchar(100) NOT NULL,
	`cpf_cnpj` varchar(18),
	`name` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `asaas_customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `asaas_customers_email_unique` ON `asaas_customers` (`client_email`);--> statement-breakpoint
CREATE INDEX `asaas_customers_customer_id_idx` ON `asaas_customers` (`asaas_customer_id`);