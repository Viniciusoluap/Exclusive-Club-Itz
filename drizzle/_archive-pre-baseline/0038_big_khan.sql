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
	`drive_file_url` text
);
