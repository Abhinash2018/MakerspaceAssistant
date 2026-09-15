CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`net_id` text NOT NULL,
	`photo_key` text,
	`photo_consent` integer NOT NULL,
	`consent_version` text NOT NULL,
	`created_at` text NOT NULL
);
