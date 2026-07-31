CREATE TABLE `access_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`code_hint` text NOT NULL,
	`participant_name` text,
	`contact` text,
	`spins_limit` integer NOT NULL,
	`spins_used` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_codes_campaign_hash_uq` ON `access_codes` (`campaign_id`,`code_hash`);--> statement-breakpoint
CREATE INDEX `access_codes_campaign_idx` ON `access_codes` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`default_spins` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_slug_uq` ON `campaigns` (`slug`);--> statement-breakpoint
CREATE TABLE `prizes` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`image_url` text,
	`quantity` integer NOT NULL,
	`remaining` integer NOT NULL,
	`probability` real NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prizes_campaign_idx` ON `prizes` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_started_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spins` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`access_code_id` text NOT NULL,
	`prize_id` text NOT NULL,
	`request_id` text NOT NULL,
	`prize_name` text NOT NULL,
	`fulfillment_status` text DEFAULT 'pending' NOT NULL,
	`fulfilled_at` text,
	`fulfillment_note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`access_code_id`) REFERENCES `access_codes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prize_id`) REFERENCES `prizes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spins_request_uq` ON `spins` (`request_id`);--> statement-breakpoint
CREATE INDEX `spins_campaign_idx` ON `spins` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `spins_code_idx` ON `spins` (`access_code_id`);--> statement-breakpoint
CREATE TRIGGER `spins_before_insert_inventory`
BEFORE INSERT ON `spins`
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM access_codes
      WHERE id = NEW.access_code_id
        AND campaign_id = NEW.campaign_id
        AND status = 'active'
    )
    THEN RAISE(ABORT, 'INVALID_CODE')
  END;

  SELECT CASE
    WHEN (
      SELECT spins_used >= spins_limit
      FROM access_codes
      WHERE id = NEW.access_code_id
    )
    THEN RAISE(ABORT, 'NO_SPINS')
  END;

  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM prizes
      WHERE id = NEW.prize_id
        AND campaign_id = NEW.campaign_id
        AND remaining > 0
    )
    THEN RAISE(ABORT, 'NO_STOCK')
  END;

  UPDATE prizes
  SET remaining = remaining - 1
  WHERE id = NEW.prize_id
    AND campaign_id = NEW.campaign_id
    AND remaining > 0;

  UPDATE access_codes
  SET spins_used = spins_used + 1
  WHERE id = NEW.access_code_id
    AND campaign_id = NEW.campaign_id
    AND status = 'active'
    AND spins_used < spins_limit;
END;
