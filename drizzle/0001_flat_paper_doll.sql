CREATE TABLE `allowed_clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` text NOT NULL,
	`phone` varchar(20),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `allowed_clients_id` PRIMARY KEY(`id`),
	CONSTRAINT `allowed_clients_email_unique` UNIQUE(`email`)
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
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vessels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` enum('lancha','jetski') NOT NULL,
	`description` text,
	`image_url` text,
	`capacity` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vessels_id` PRIMARY KEY(`id`)
);
