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
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `due_date_change_requests_id` PRIMARY KEY(`id`)
);
