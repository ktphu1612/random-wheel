import { NextResponse } from "next/server";
import { audit } from "../../../../../../lib/data";
import { getD1, makeId, requireAdmin } from "../../../../../../lib/security";
import type { CampaignRecord, PrizeRecord } from "../../../../../../lib/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Bạn chưa đăng nhập." }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json()) as { action?: string };
  const db = getD1();
  const campaign = await db
    .prepare("SELECT * FROM campaigns WHERE id = ?")
    .bind(id)
    .first<CampaignRecord>();
  if (!campaign) {
    return NextResponse.json({ error: "Không tìm thấy vòng quay." }, { status: 404 });
  }
  if (body.action === "duplicate") {
    const newId = makeId("cmp");
    const newSlug = `${campaign.slug}-ban-sao-${Date.now().toString().slice(-4)}`;
    const prizes = (
      await db
        .prepare("SELECT * FROM prizes WHERE campaign_id = ? ORDER BY position")
        .bind(id)
        .all<PrizeRecord>()
    ).results;
    const statements = [
      db
        .prepare(
          "INSERT INTO campaigns (id, name, slug, description, status, starts_at, ends_at, default_spins) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)",
        )
        .bind(
          newId,
          `${campaign.name} — Bản sao`,
          newSlug,
          campaign.description,
          campaign.starts_at,
          campaign.ends_at,
          campaign.default_spins,
        ),
      ...prizes.map((prize) =>
        db
          .prepare(
            "INSERT INTO prizes (id, campaign_id, name, color, image_url, quantity, remaining, probability, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            makeId("prz"),
            newId,
            prize.name,
            prize.color,
            prize.image_url,
            prize.quantity,
            prize.quantity,
            prize.probability,
            prize.position,
          ),
      ),
    ];
    await db.batch(statements);
    await audit("campaign.duplicated", "campaign", newId, { sourceId: id });
    return NextResponse.json({ ok: true, id: newId });
  }
  const allowed: Record<string, string> = {
    activate: "active",
    pause: "paused",
    end: "ended",
    draft: "draft",
  };
  const next = body.action ? allowed[body.action] : undefined;
  if (!next) {
    return NextResponse.json({ error: "Thao tác không hợp lệ." }, { status: 400 });
  }
  if (next === "active") {
    const prizes = (
      await db
        .prepare("SELECT probability, remaining FROM prizes WHERE campaign_id = ?")
        .bind(id)
        .all<{ probability: number; remaining: number }>()
    ).results;
    const total = prizes.reduce((sum, prize) => sum + prize.probability, 0);
    if (!prizes.length || Math.abs(total - 100) > 0.01) {
      return NextResponse.json(
        { error: "Cần có phần thưởng với tổng xác suất bằng 100%." },
        { status: 400 },
      );
    }
    if (!prizes.some((prize) => prize.remaining > 0)) {
      return NextResponse.json(
        { error: "Không còn phần thưởng để mở vòng quay." },
        { status: 400 },
      );
    }
  }
  await db
    .prepare(
      "UPDATE campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(next, id)
    .run();
  await audit(`campaign.${body.action}`, "campaign", id, {
    from: campaign.status,
    to: next,
  });
  return NextResponse.json({ ok: true });
}
