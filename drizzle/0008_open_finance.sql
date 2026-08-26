-- OF-001: Open Finance domain tables.
-- Safe additive migration: no existing table is altered or deleted.

CREATE TABLE IF NOT EXISTS `open_finance_connections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `provider` enum('pluggy','belvo','celcoin') NOT NULL DEFAULT 'pluggy',
  `provider_item_id` varchar(128) NOT NULL,
  `client_user_id` varchar(128) NOT NULL,
  `institution_name` varchar(255),
  `status` enum('pending','connected','syncing','error','disconnected','consent_expired') NOT NULL DEFAULT 'pending',
  `error_code` varchar(100),
  `error_message` text,
  `last_synced_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `of_connections_provider_item_uq` (`provider`, `provider_item_id`),
  KEY `of_connections_user_id_idx` (`user_id`),
  KEY `of_connections_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `open_finance_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `connection_id` int NOT NULL,
  `provider_account_id` varchar(128) NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` varchar(50),
  `subtype` varchar(80),
  `number_masked` varchar(80),
  `currency_code` varchar(10) NOT NULL DEFAULT 'BRL',
  `balance` decimal(18,2) NOT NULL DEFAULT 0,
  `available_balance` decimal(18,2),
  `last_updated_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `of_accounts_provider_account_uq` (`provider_account_id`),
  KEY `of_accounts_connection_id_idx` (`connection_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `open_finance_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `connection_id` int NOT NULL,
  `provider_transaction_id` varchar(128) NOT NULL,
  `transaction_date` varchar(32) NOT NULL,
  `description` text NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `currency_code` varchar(10) NOT NULL DEFAULT 'BRL',
  `direction` enum('credit','debit','unknown') NOT NULL DEFAULT 'unknown',
  `merchant_name` varchar(255),
  `category` varchar(120),
  `status` varchar(50),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `of_transactions_provider_transaction_uq` (`provider_transaction_id`),
  KEY `of_transactions_account_date_idx` (`account_id`, `transaction_date`),
  KEY `of_transactions_connection_date_idx` (`connection_id`, `transaction_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `open_finance_webhook_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `provider_event_id` varchar(128) NOT NULL,
  `event` varchar(100) NOT NULL,
  `item_id` varchar(128),
  `client_user_id` varchar(128),
  `processed` tinyint NOT NULL DEFAULT 0,
  `error_message` text,
  `received_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `of_webhook_events_provider_event_uq` (`provider_event_id`),
  KEY `of_webhook_events_item_idx` (`item_id`),
  KEY `of_webhook_events_received_idx` (`received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `open_finance_sync_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `connection_id` int NOT NULL,
  `trigger` enum('manual','webhook','scheduled') NOT NULL DEFAULT 'manual',
  `status` enum('running','success','failed') NOT NULL DEFAULT 'running',
  `accounts_imported` int NOT NULL DEFAULT 0,
  `transactions_imported` int NOT NULL DEFAULT 0,
  `error_message` text,
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `of_sync_runs_connection_idx` (`connection_id`),
  KEY `of_sync_runs_started_idx` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
