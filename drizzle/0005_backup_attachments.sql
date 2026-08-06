CREATE TABLE `backup_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source_url` varchar(500) NOT NULL,
	`category` varchar(50) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`storage_url` text,
	`size_bytes` int,
	`status` enum('archived','failed') NOT NULL,
	`error_message` text,
	`archived_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backup_attachments_id` PRIMARY KEY(`id`),
	CONSTRAINT `backup_attachments_source_url_unique` UNIQUE(`source_url`)
);
