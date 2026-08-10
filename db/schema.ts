import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("draft"),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    defaultSpins: integer("default_spins").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("campaigns_slug_uq").on(table.slug)],
);

export const prizes = sqliteTable(
  "prizes",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    imageUrl: text("image_url"),
    quantity: integer("quantity").notNull(),
    remaining: integer("remaining").notNull(),
    probability: real("probability").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("prizes_campaign_idx").on(table.campaignId)],
);

export const accessCodes = sqliteTable(
  "access_codes",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("code"),
    codeHash: text("code_hash").notNull(),
    codeHint: text("code_hint").notNull(),
    participantName: text("participant_name"),
    contact: text("contact"),
    spinsLimit: integer("spins_limit").notNull(),
    spinsUsed: integer("spins_used").notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("access_codes_campaign_hash_uq").on(
      table.campaignId,
      table.codeHash,
    ),
    index("access_codes_campaign_idx").on(table.campaignId),
    index("access_codes_campaign_kind_idx").on(table.campaignId, table.kind),
  ],
);

export const spins = sqliteTable(
  "spins",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    accessCodeId: text("access_code_id")
      .notNull()
      .references(() => accessCodes.id, { onDelete: "cascade" }),
    prizeId: text("prize_id")
      .notNull()
      .references(() => prizes.id),
    requestId: text("request_id").notNull(),
    prizeName: text("prize_name").notNull(),
    fulfillmentStatus: text("fulfillment_status")
      .notNull()
      .default("pending"),
    fulfilledAt: text("fulfilled_at"),
    fulfillmentNote: text("fulfillment_note"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("spins_device_request_uq").on(
      table.accessCodeId,
      table.requestId,
    ),
    index("spins_campaign_idx").on(table.campaignId),
    index("spins_code_idx").on(table.accessCodeId),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    details: text("details").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("audit_entity_idx").on(table.entityType, table.entityId)],
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    attempts: integer("attempts").notNull().default(0),
    windowStartedAt: text("window_started_at").notNull(),
  },
);
