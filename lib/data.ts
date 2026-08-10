import type {
  AccessCodeRecord,
  CampaignRecord,
  CampaignStatus,
  DeviceRecord,
  PrizeRecord,
} from "./types";
import { deviceLabel } from "./device-policy";
import { getD1, makeId, sha256 } from "./security";

export function resolvedStatus(
  campaign: CampaignRecord,
  remaining: number,
): CampaignStatus {
  if (campaign.status === "draft" || campaign.status === "paused") {
    return campaign.status;
  }
  if (campaign.status === "ended") return "ended";
  const now = Date.now();
  if (now < new Date(campaign.starts_at).getTime()) return "scheduled";
  if (now > new Date(campaign.ends_at).getTime()) return "ended";
  if (remaining <= 0) return "sold_out";
  return "active";
}

export async function ensureSeedData() {
  const db = getD1();
  const row = await db
    .prepare("SELECT id FROM campaigns LIMIT 1")
    .first<{ id: string }>();
  if (row) return;

  const campaignId = "cmp_demo_mua_he";
  const startsAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const codeHash = await sha256("MAYMAN2026");
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO campaigns (id, name, slug, description, status, starts_at, ends_at, default_spins) VALUES (?, ?, ?, ?, 'active', ?, ?, 2)",
      )
      .bind(
        campaignId,
        "Mùa hè may mắn",
        "mua-he-may-man",
        "Vòng quay tri ân với những phần quà tươi vui dành cho bạn.",
        startsAt,
        endsAt,
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO prizes (id, campaign_id, name, color, quantity, remaining, probability, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind("prz_demo_1", campaignId, "Voucher 500K", "#FF5A36", 2, 2, 10, 0),
    db
      .prepare(
        "INSERT OR IGNORE INTO prizes (id, campaign_id, name, color, quantity, remaining, probability, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind("prz_demo_2", campaignId, "Bình giữ nhiệt", "#FFC857", 8, 8, 30, 1),
    db
      .prepare(
        "INSERT OR IGNORE INTO prizes (id, campaign_id, name, color, quantity, remaining, probability, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind("prz_demo_3", campaignId, "Túi tote", "#66C3A5", 15, 15, 35, 2),
    db
      .prepare(
        "INSERT OR IGNORE INTO prizes (id, campaign_id, name, color, quantity, remaining, probability, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind("prz_demo_4", campaignId, "Móc khóa vui", "#4E7CFF", 25, 25, 25, 3),
    db
      .prepare(
        "INSERT OR IGNORE INTO access_codes (id, campaign_id, code_hash, code_hint, participant_name, spins_limit) VALUES (?, ?, ?, ?, ?, 2)",
      )
      .bind(
        "cod_demo_1",
        campaignId,
        codeHash,
        "MAYM••••2026",
        "Khách trải nghiệm",
      ),
  ]);
}

export async function getCampaignBySlug(slug: string) {
  await ensureSeedData();
  const db = getD1();
  const campaign = await db
    .prepare("SELECT * FROM campaigns WHERE slug = ?")
    .bind(slug)
    .first<CampaignRecord>();
  if (!campaign) return null;
  const prizes = (
    await db
      .prepare(
        "SELECT * FROM prizes WHERE campaign_id = ? ORDER BY position, created_at",
      )
      .bind(campaign.id)
      .all<PrizeRecord>()
  ).results;
  const remaining = prizes.reduce((total, prize) => total + prize.remaining, 0);
  return {
    campaign,
    prizes,
    status: resolvedStatus(campaign, remaining),
    remaining,
  };
}

export async function getCampaignDevice(campaignId: string, deviceId: string) {
  return getD1()
    .prepare(
      "SELECT * FROM access_codes WHERE id = ? AND campaign_id = ? AND kind = 'device'",
    )
    .bind(deviceId, campaignId)
    .first<DeviceRecord>();
}

export async function createCampaignDevice(campaignId: string) {
  const id = makeId("dev");
  return getD1()
    .prepare(
      "INSERT INTO access_codes (id, campaign_id, kind, code_hash, code_hint, spins_limit) VALUES (?, ?, 'device', ?, ?, 1) RETURNING *",
    )
    .bind(id, campaignId, await sha256(id), deviceLabel(id))
    .first<DeviceRecord>();
}

export function choosePrize(prizes: PrizeRecord[]) {
  const available = prizes.filter(
    (prize) => prize.remaining > 0 && prize.probability > 0,
  );
  const totalWeight = available.reduce(
    (total, prize) => total + prize.probability,
    0,
  );
  if (!available.length || totalWeight <= 0) return null;
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  let pointer = (random[0] / 0xffffffff) * totalWeight;
  for (const prize of available) {
    pointer -= prize.probability;
    if (pointer <= 0) return prize;
  }
  return available.at(-1) ?? null;
}

export async function audit(
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  await getD1()
    .prepare(
      "INSERT INTO audit_logs (id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(makeId("log"), action, entityType, entityId, JSON.stringify(details))
    .run();
}
