ALTER TABLE `subscription_charges` ADD `net_value` decimal(10,2);--> statement-breakpoint
ALTER TABLE `subscription_charges` ADD `external_reference` varchar(255);--> statement-breakpoint
ALTER TABLE `subscription_charges` ADD `billing_type` varchar(20);