CREATE TABLE `face_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`purpose` text NOT NULL,
	`direction` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_by` text,
	`body_hash` text
);
--> statement-breakpoint
CREATE TABLE `cleanup_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_success_at` integer NOT NULL,
	`object_cursor` text
);
--> statement-breakpoint
CREATE TABLE `verification_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL,
	`session_id` text,
	`consumed_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_grants_code_hash_unique` ON `verification_grants` (`code_hash`);--> statement-breakpoint
CREATE TABLE `pairing_codes` (
	`hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `face_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`net_id_hash` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consent_version` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `face_profiles_net_id_hash_unique` ON `face_profiles` (`net_id_hash`);--> statement-breakpoint
CREATE INDEX `idx_profiles_expiry` ON `face_profiles` (`expires_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_expiry` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`csrf` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `visits` ADD `expires_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `visits` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `visits` ADD `method` text DEFAULT 'legacy-unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `visits` ADD `profile_id` text;--> statement-breakpoint
CREATE INDEX `idx_visits_expiry` ON `visits` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_visits_profile_time` ON `visits` (`profile_id`,`created_at`);