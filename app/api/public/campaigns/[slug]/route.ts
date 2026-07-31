import { NextResponse } from "next/server";
import { getCampaignBySlug } from "../../../../../lib/data";
import { cookieValue, verifyToken } from "../../../../../lib/security";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const data = await getCampaignBySlug(slug);
    if (!data) {
      return NextResponse.json(
        { error: "Không tìm thấy vòng quay." },
        { status: 404 },
      );
    }
    const cookieName = `qt_player_${data.campaign.id.slice(-12)}`;
    const session = await verifyToken<{
      campaignId: string;
      codeId: string;
      exp: number;
    }>(cookieValue(request, cookieName));
    let participant = null;
    let history: unknown[] = [];
    if (session?.campaignId === data.campaign.id) {
      const codeId = session.codeId;
      const { getD1 } = await import("../../../../../lib/security");
      const db = getD1();
      participant = await db
        .prepare(
          "SELECT id, code_hint, participant_name, spins_limit, spins_used, status FROM access_codes WHERE id = ? AND campaign_id = ?",
        )
        .bind(codeId, data.campaign.id)
        .first();
      if (participant) {
        history = (
          await db
            .prepare(
              "SELECT id, prize_id, prize_name, fulfillment_status, created_at FROM spins WHERE access_code_id = ? ORDER BY created_at DESC",
            )
            .bind(codeId)
            .all()
        ).results;
      }
    }
    return NextResponse.json({
      campaign: {
        id: data.campaign.id,
        name: data.campaign.name,
        slug: data.campaign.slug,
        description: data.campaign.description,
        startsAt: data.campaign.starts_at,
        endsAt: data.campaign.ends_at,
        status: data.status,
        remaining: data.remaining,
      },
      prizes: data.prizes.map((prize) => ({
        id: prize.id,
        name: prize.name,
        color: prize.color,
        imageUrl: prize.image_url,
        remaining: prize.remaining,
      })),
      participant,
      history,
    });
  } catch {
    return NextResponse.json(
      { error: "Chưa thể tải vòng quay. Vui lòng thử lại." },
      { status: 503 },
    );
  }
}
