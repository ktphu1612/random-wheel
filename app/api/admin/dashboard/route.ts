import { NextResponse } from "next/server";
import { ensureSeedData, resolvedStatus } from "../../../../lib/data";
import type { CampaignRecord } from "../../../../lib/types";
import { getD1, requireAdmin } from "../../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Bạn chưa đăng nhập." }, { status: 401 });
  }
  try {
    await ensureSeedData();
    const db = getD1();
    const campaigns = (
      await db
        .prepare("SELECT * FROM campaigns ORDER BY created_at DESC")
        .all<CampaignRecord>()
    ).results;
    const results = await Promise.all(
      campaigns.map(async (campaign) => {
        const [prizes, deviceSummary, spinSummary, pendingSummary] =
          await Promise.all([
            db
              .prepare(
                "SELECT * FROM prizes WHERE campaign_id = ? ORDER BY position, created_at",
              )
              .bind(campaign.id)
              .all(),
            db
              .prepare(
                "SELECT COUNT(*) AS total FROM access_codes WHERE campaign_id = ? AND kind = 'device'",
              )
              .bind(campaign.id)
              .first<{ total: number }>(),
            db
              .prepare(
                "SELECT COUNT(*) AS total FROM spins WHERE campaign_id = ?",
              )
              .bind(campaign.id)
              .first<{ total: number }>(),
            db
              .prepare(
                "SELECT COUNT(*) AS total FROM spins WHERE campaign_id = ? AND fulfillment_status = 'pending'",
              )
              .bind(campaign.id)
              .first<{ total: number }>(),
          ]);
        const prizeRows = prizes.results as Array<{ remaining: number }>;
        return {
          ...campaign,
          status: resolvedStatus(
            campaign,
            prizeRows.reduce((sum, prize) => sum + prize.remaining, 0),
          ),
          prizes: prizes.results,
          deviceCount: deviceSummary?.total ?? 0,
          spinCount: spinSummary?.total ?? 0,
          pendingCount: pendingSummary?.total ?? 0,
        };
      }),
    );
    const totals = {
      campaigns: results.length,
      active: results.filter((item) => item.status === "active").length,
      spins: results.reduce((sum, item) => sum + item.spinCount, 0),
      pending: results.reduce((sum, item) => sum + item.pendingCount, 0),
    };
    return NextResponse.json({ campaigns: results, totals });
  } catch {
    return NextResponse.json(
      { error: "Chưa thể tải dữ liệu quản trị." },
      { status: 503 },
    );
  }
}
