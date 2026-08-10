DROP INDEX `spins_request_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `spins_device_request_uq` ON `spins` (`access_code_id`,`request_id`);--> statement-breakpoint
ALTER TABLE `access_codes` ADD `kind` text DEFAULT 'code' NOT NULL;--> statement-breakpoint
CREATE INDEX `access_codes_campaign_kind_idx` ON `access_codes` (`campaign_id`,`kind`);