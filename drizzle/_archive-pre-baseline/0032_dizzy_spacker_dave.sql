CREATE TABLE `asaas_customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_email` varchar(320) NOT NULL,
	`asaas_customer_id` varchar(100) NOT NULL,
	`cpf_cnpj` varchar(18),
	`name` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `asaas_customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `asaas_customers_client_email_unique` UNIQUE(`client_email`),
	CONSTRAINT `asaas_customers_asaas_customer_id_unique` UNIQUE(`asaas_customer_id`)
);
--> statement-breakpoint
CREATE TABLE `asaas_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`charge_type` enum('fuel','inspection','repair','booking','monthly') NOT NULL,
	`charge_id` int NOT NULL,
	`asaas_payment_id` varchar(100) NOT NULL,
	`asaas_customer_id` varchar(100) NOT NULL,
	`value` decimal(10,2) NOT NULL,
	`net_value` decimal(10,2),
	`status` enum('pending','confirmed','received','overdue','refunded','cancelled','failed') NOT NULL DEFAULT 'pending',
	`billing_type` varchar(20) NOT NULL,
	`due_date` timestamp NOT NULL,
	`payment_date` timestamp,
	`pix_qr_code` text,
	`pix_copy_paste` text,
	`pix_expiration_date` timestamp,
	`invoice_url` text,
	`bank_slip_url` text,
	`description` text,
	`external_reference` varchar(255),
	`client_email` varchar(320) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `asaas_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `asaas_payments_asaas_payment_id_unique` UNIQUE(`asaas_payment_id`)
);
--> statement-breakpoint
CREATE TABLE `payment_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payment_id` int NOT NULL,
	`asaas_payment_id` varchar(100),
	`action` varchar(50) NOT NULL,
	`old_status` varchar(30),
	`new_status` varchar(30),
	`details` text,
	`source` varchar(30) NOT NULL,
	`performed_by` varchar(320),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_reconciliations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`run_date` timestamp NOT NULL DEFAULT (now()),
	`total_checked` int NOT NULL DEFAULT 0,
	`total_divergent` int NOT NULL DEFAULT 0,
	`total_fixed` int NOT NULL DEFAULT 0,
	`status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`details` text,
	`run_by` varchar(320),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_reconciliations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(50) NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`payload` text NOT NULL,
	`headers` text,
	`processed` boolean NOT NULL DEFAULT false,
	`processed_at` timestamp,
	`error_message` text,
	`retry_count` int NOT NULL DEFAULT 0,
	`related_payment_id` int,
	`ip_address` varchar(45),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_logs_id` PRIMARY KEY(`id`)
);
