import { NextResponse } from "next/server";
import { audit } from "../../../../../lib/data";
import type { CampaignRecord } from "../../../../../lib/types";
import { getD1, makeId, requireAdmin } from "../../../../../lib/security";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Bạn chưa đăng nhập." }, { status: 401 });
  }
  const { id } = await params;
  const db = getD1();
  const [campaign, prizes, codes, spins, auditRows] = await Promise.all([
    db.prepare("SELECT * FROM campaigns WHERE id = ?").bind(id).first(),
    db
      .prepare("SELECT * FROM prizes WHERE campaign_id = ? ORDER BY position")
      .bind(id)
      .all(),
    db
      .prepare(
        "SELECT id, code_hint, participant_name, contact, spins_limit, spins_used, status, created_at FROM access_codes WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 500",
      )
      .bind(id)
      .all(),
    db
      .prepare(
        "SELECT s.*, a.code_hint, a.participant_name FROM spins s JOIN access_codes a ON a.id = s.access_code_id WHERE s.campaign_id = ? ORDER BY s.created_at DESC LIMIT 1000",
      )
      .bind(id)
      .all(),
    db
      .prepare(
        "SELECT * FROM audit_logs WHERE entity_id = ? ORDER BY created_at DESC LIMIT 100",
      )
      .bind(id)
      .all(),
  ]);
  if (!campaign) {
    return NextResponse.json({ error: "Không tìm thấy vòng quay." }, { status: 404 });
  }
  return NextResponse.json({
    campaign,
    prizes: prizes.results,
    codes: codes.results,
    spins: spins.results,
    audit: auditRows.results,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Bạn chưa đăng nhập." }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      startsAt?: string;
      endsAt?: string;
      defaultSpins?: number;
      prizes?: Array<{
        id?: string;
        name: string;
        color: string;
        imageUrl?: string | null;
        quantity: number;
        probability: number;
      }>;
    };
    const db = getD1();
    const campaign = await db
      .prepare("SELECT * FROM campaigns WHERE id = ?")
      .bind(id)
      .first<CampaignRecord>();
    if (!campaign) {
      return NextResponse.json({ error: "Không tìm thấy vòng quay." }, { status: 404 });
    }
    if (body.startsAt && body.endsAt && new Date(body.endsAt) <= new Date(body.startsAt)) {
      return NextResponse.json(
        { error: "Thời gian kết thúc phải sau thời gian bắt đầu." },
        { status: 400 },
      );
    }
    if (body.prizes) {
      if (campaign.status === "active") {
        return NextResponse.json(
          { error: "Hãy tạm dừng vòng quay trước khi sửa phần thưởng." },
          { status: 409 },
        );
      }
      const total = body.prizes.reduce(
        (sum, prize) => sum + Number(prize.probability || 0),
        0,
      );
      if (Math.abs(total - 100) > 0.01) {
        return NextResponse.json(
          { error: "Tổng xác suất phần thưởng phải bằng 100%." },
          { status: 400 },
        );
      }
      const existingPrizes = (
        await db
          .prepare("SELECT id, quantity, remaining FROM prizes WHERE campaign_id = ?")
          .bind(id)
          .all<{ id: string; quantity: number; remaining: number }>()
      ).results;
      const statements = body.prizes.map((prize, index) => {
        const existing = existingPrizes.find((item) => item.id === prize.id);
        const quantity = Math.max(0, Math.floor(Number(prize.quantity) || 0));
        const awarded = existing
          ? Math.max(0, existing.quantity - existing.remaining)
          : 0;
        const remaining = Math.max(0, quantity - awarded);
        if (existing) {
          return db
            .prepare(
              "UPDATE prizes SET name = ?, color = ?, image_url = ?, quantity = ?, remaining = ?, probability = ?, position = ? WHERE id = ? AND campaign_id = ?",
            )
            .bind(
              prize.name.trim(),
              prize.color,
              prize.imageUrl ?? null,
              quantity,
              remaining,
              Number(prize.probability),
              index,
              existing.id,
              id,
            );
        }
        return db
          .prepare(
            "INSERT INTO prizes (id, campaign_id, name, color, image_url, quantity, remaining, probability, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            makeId("prz"),
            id,
            prize.name.trim(),
            prize.color,
            prize.imageUrl ?? null,
            quantity,
            quantity,
            Number(prize.probability),
            index,
          );
      });
      if (statements.length) await db.batch(statements);
    }
    await db
      .prepare(
        "UPDATE campaigns SET name = ?, description = ?, starts_at = ?, ends_at = ?, default_spins = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .bind(
        body.name?.trim() || campaign.name,
        body.description?.trim() ?? campaign.description,
        body.startsAt ? new Date(body.startsAt).toISOString() : campaign.starts_at,
        body.endsAt ? new Date(body.endsAt).toISOString() : campaign.ends_at,
        Math.max(1, Math.min(100, Number(body.defaultSpins) || campaign.default_spins)),
        id,
      )
      .run();
    await audit("campaign.updated", "campaign", id, {
      fields: Object.keys(body),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Không thể lưu thay đổi." },
      { status: 500 },
    );
  }
}
