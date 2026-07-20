CREATE TABLE `allowed_clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` text NOT NULL,
	`phone` varchar(20),
	`cpf_cnpj` varchar(18),
	`rg` varchar(30),
	`address` varchar(255),
	`neighborhood` varchar(100),
	`city` varchar(100),
	`state` varchar(2),
	`zip_code` varchar(10),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`contract_url` text,
	`contract2_url` text,
	`document_url` text,
	CONSTRAINT `allowed_clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
CREATE TABLE `backup_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`started_at` timestamp NOT NULL,
	`completed_at` timestamp,
	`status` enum('running','success','failed') NOT NULL,
	`file_name` text,
	`file_size_bytes` bigint,
	`duration_seconds` int,
	`error_message` text,
	`drive_file_id` text,
	`drive_file_url` text,
	`local_file_path` text,
	`s3_url` text,
	CONSTRAINT `backup_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_email` varchar(320) NOT NULL,
	`client_name` text NOT NULL,
	`vessel_id` int NOT NULL,
	`vessel_name` text NOT NULL,
	`booking_date` bigint NOT NULL,
	`status` enum('pending','confirmed','used','cancelled') NOT NULL DEFAULT 'confirmed',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
	`status` enum('pending','received','confirmed','overdue','refunded','receivedInCash','awaitingChargeback','detached','partiallyPaid','cancelled') NOT NULL DEFAULT 'pending',
	`type` enum('monthly','quota_sale','fuel','repair','inspection','other') DEFAULT 'other',
	`classified_by` enum('auto','manual','unclassified') DEFAULT 'unclassified',
	`billing_type` varchar(32),
	`description` text,
	`external_reference` varchar(255),
	`payment_link` text,
	`invoice_url` text,
	`bank_slip_url` text,
	`payment_links` text,
	`receipt_url` text,
	`synced_at` timestamp,
	`source` enum('asaas_import','asaas_webhook','manual','system') DEFAULT 'system',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bpo_charges_id` PRIMARY KEY(`id`),
	CONSTRAINT `bpo_charges_asaas_charge_id_unique` UNIQUE(`asaas_charge_id`)
);
--> statement-breakpoint
CREATE TABLE `client_quotas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`vessel_id` int NOT NULL,
	`quota_type` enum('full','half') NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`quota_number` int NOT NULL,
	CONSTRAINT `client_quotas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `due_date_change_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`charge_id` int NOT NULL,
	`client_email` varchar(320) NOT NULL,
	`old_due_date` timestamp NOT NULL,
	`new_due_date` timestamp NOT NULL,
	`reason` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`admin_response` text,
	`processed_by` varchar(320),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `due_date_change_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(20),
	`vessel_ids` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `email` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `expense_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cost_center` enum('salary','rent','pro_labore','fuel_operational','repair','operational','withdrawal','other') NOT NULL,
	`description` text NOT NULL,
	`recipient_name` varchar(255),
	`value` decimal(10,2) NOT NULL,
	`due_date` varchar(10) NOT NULL,
	`paid_date` varchar(10),
	`status` enum('pending','paid','overdue','cancelled') NOT NULL DEFAULT 'pending',
	`asaas_payment_id` varchar(255),
	`source_type` enum('transfer','fee','bill','manual','withdrawal') DEFAULT 'manual',
	`manually_classified` int DEFAULT 0,
	`notes` text,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expense_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fuel_budget` (
	`id` int AUTO_INCREMENT NOT NULL,
	`month_year` varchar(7) NOT NULL,
	`total_budget` int NOT NULL DEFAULT 0,
	`total_spent` int NOT NULL DEFAULT 0,
	`total_received` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`stock_liters` int NOT NULL DEFAULT 0,
	`last_price_per_liter` int NOT NULL DEFAULT 0,
	CONSTRAINT `fuel_budget_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fuel_purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`month_year` varchar(7) NOT NULL,
	`liters_purchased` int NOT NULL,
	`amount_paid` int NOT NULL,
	`price_per_liter` int NOT NULL,
	`purchased_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`purchased_by` int,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`gallon_number` int NOT NULL DEFAULT 1,
	CONSTRAINT `fuel_purchases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fuel_record_containers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fuel_record_id` int NOT NULL,
	`gallon_number` int NOT NULL,
	`liters_initial` int NOT NULL,
	`weight_full` int NOT NULL,
	`weight_after` int NOT NULL,
	`weight_consumed` int NOT NULL,
	`liters_used` int NOT NULL,
	`photo_before_url` text NOT NULL,
	`photo_after_url` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `fuel_record_containers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fuel_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`booking_id` int,
	`vessel_id` int NOT NULL,
	`vessel_name` text NOT NULL,
	`client_email` varchar(320) NOT NULL,
	`client_name` text NOT NULL,
	`liters` int NOT NULL,
	`price_per_liter` int NOT NULL,
	`total_amount` int NOT NULL,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`asaas_charge_id` varchar(100),
	`payment_status` enum('pending','paid','cancelled','overdue') NOT NULL DEFAULT 'pending',
	`paid_at` timestamp,
	`due_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`receipt_url` text,
	`recorded_by` varchar(320) NOT NULL DEFAULT 'system@exclusive.club',
	`recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`asaas_customer_id` varchar(100),
	`payment_url` text,
	`sync_status` enum('pending','synced','failed','manual') NOT NULL DEFAULT 'pending',
	`sync_error` text,
	`last_sync_attempt` timestamp,
	`manual_payment_note` text,
	`liters_initial` int,
	`weight_full` int,
	`weight_after` int,
	`weight_consumed` int,
	`liters_calculated` int,
	`photo_before_url` text,
	`photo_after_url` text,
	`gallon_number` int NOT NULL DEFAULT 1,
	`is_operational` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `fuel_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gallon_stock` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gallon_number` int NOT NULL,
	`stock_liters` int NOT NULL DEFAULT 0,
	`last_price_per_liter` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gallon_stock_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inspection_charges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`charge_type` enum('inspection','repair') NOT NULL DEFAULT 'inspection',
	`inspection_id` int,
	`vessel_id` int,
	`client_email` varchar(320) NOT NULL,
	`vessel_name` text NOT NULL,
	`description` text,
	`failed_items` text,
	`amount` decimal(10,2) NOT NULL,
	`due_date` timestamp NOT NULL,
	`asaas_charge_id` varchar(255),
	`payment_status` enum('pending','paid','overdue','partiallyPaid','cancelled') NOT NULL DEFAULT 'pending',
	`amount_paid` decimal(10,2) NOT NULL DEFAULT '0.00',
	`receipt_url` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspection_charges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inspections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`booking_id` int,
	`vessel_id` int NOT NULL,
	`vessel_name` text NOT NULL,
	`vessel_type` enum('lancha','jetski') NOT NULL,
	`client_name` text NOT NULL,
	`client_email` varchar(320),
	`inspection_data` text NOT NULL,
	`observations` text,
	`status` enum('approved','rejected') NOT NULL,
	`inspected_by` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`reprovation_photos` text,
	CONSTRAINT `inspections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vessel_id` int NOT NULL,
	`vessel_name` text NOT NULL,
	`start_date` bigint NOT NULL,
	`end_date` bigint NOT NULL,
	`description` text NOT NULL,
	`status` enum('scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`created_by` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `maintenances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`booking_id` int NOT NULL,
	`client_email` varchar(320) NOT NULL,
	`client_name` text NOT NULL,
	`vessel_id` int NOT NULL,
	`vessel_name` text NOT NULL,
	`rating` int NOT NULL,
	`comment` text,
	`is_approved` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updated_by` varchar(320),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin','employee') NOT NULL DEFAULT 'user',
	`password_hash` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vessels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` enum('lancha','jetski') NOT NULL,
	`description` text,
	`image_url` text,
	`capacity` int,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`quota_count` int NOT NULL DEFAULT 6,
	`document_url` text,
	`extra_document_url` text,
	CONSTRAINT `vessels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event` varchar(100) NOT NULL,
	`asaas_payment_id` varchar(255),
	`payload` text,
	`processed` tinyint NOT NULL DEFAULT 0,
	`error` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `webhook_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `fuel_purchases` ADD CONSTRAINT `fuel_purchases_purchased_by_users_id_fk` FOREIGN KEY (`purchased_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `allowed_clients_email_unique` ON `allowed_clients` (`email`);--> statement-breakpoint
CREATE INDEX `asaas_customers_email_unique` ON `asaas_customers` (`client_email`);--> statement-breakpoint
CREATE INDEX `asaas_customers_customer_id_idx` ON `asaas_customers` (`asaas_customer_id`);--> statement-breakpoint
CREATE INDEX `bpo_charges_asaas_charge_id_idx` ON `bpo_charges` (`asaas_charge_id`);--> statement-breakpoint
CREATE INDEX `bpo_charges_client_id_idx` ON `bpo_charges` (`client_id`);--> statement-breakpoint
CREATE INDEX `bpo_charges_due_date_idx` ON `bpo_charges` (`due_date`);--> statement-breakpoint
CREATE INDEX `bpo_charges_status_idx` ON `bpo_charges` (`status`);--> statement-breakpoint
CREATE INDEX `er_cost_center` ON `expense_records` (`cost_center`);--> statement-breakpoint
CREATE INDEX `er_status` ON `expense_records` (`status`);--> statement-breakpoint
CREATE INDEX `er_due_date` ON `expense_records` (`due_date`);--> statement-breakpoint
CREATE INDEX `month_year` ON `fuel_budget` (`month_year`);--> statement-breakpoint
CREATE INDEX `fuel_record_id_idx` ON `fuel_record_containers` (`fuel_record_id`);--> statement-breakpoint
CREATE INDEX `gallon_number_idx` ON `gallon_stock` (`gallon_number`);--> statement-breakpoint
CREATE INDEX `key` ON `system_settings` (`key`);--> statement-breakpoint
CREATE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE INDEX `wl_event` ON `webhook_logs` (`event`);--> statement-breakpoint
CREATE INDEX `wl_asaas_payment_id` ON `webhook_logs` (`asaas_payment_id`);--> statement-breakpoint
CREATE INDEX `wl_created_at` ON `webhook_logs` (`created_at`);