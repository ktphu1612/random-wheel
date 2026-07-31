import { NextResponse } from "next/server";
import { choosePrize, getCampaignBySlug } from "../../../../../../lib/data";
import type { AccessCodeRecord, SpinRecord } from "../../../../../../lib/types";
import {
  checkRateLimit,
  cookieValue,
  getD1,
  makeId,
  requestFingerprint,
  verifyToken,
} from "../../../../../../lib/security";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const data = await getCampaignBySlug(slug);
    if (!data) {
      return NextResponse.json({ error: "Vòng quay không tồn tại." }, { status: 404 });
    }
    const session = await verifyToken<{
      campaignId: string;
      codeId: string;
      exp: number;
    }>(
      cookieValue(
        request,
        `qt_player_${data.campaign.id.slice(-12)}`,
      ),
    );
    if (!session || session.campaignId !== data.campaign.id) {
      return NextResponse.json(
        { error: "Vui lòng nhập mã tham gia trước." },
        { status: 401 },
      );
    }
    const allowed = await checkRateLimit(
      `spin:${session.codeId}:${requestFingerprint(request)}`,
      12,
      60,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Bạn đang thao tác quá nhanh. Hãy thử lại sau một phút." },
        { status: 429 },
      );
    }
    if (data.status !== "active") {
      const messages: Record<string, string> = {
        draft: "Vòng quay chưa được mở.",
        scheduled: "Vòng quay chưa đến thời gian bắt đầu.",
        paused: "Vòng quay đang tạm dừng.",
        ended: "Vòng quay đã kết thúc.",
        sold_out: "Tất cả phần thưởng đã được trao.",
      };
      return NextResponse.json(
        { error: messages[data.status] ?? "Vòng quay chưa sẵn sàng." },
        { status: 409 },
      );
    }

    const body = (await request.json()) as { requestId?: string };
    const requestId = body.requestId?.trim();
    if (!requestId || requestId.length > 100) {
      return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
    }
    const db = getD1();
    const previous = await db
      .prepare("SELECT * FROM spins WHERE request_id = ?")
      .bind(requestId)
      .first<SpinRecord>();
    if (previous) {
      return NextResponse.json({
        result: previous,
        idempotent: true,
      });
    }
    const code = await db
      .prepare("SELECT * FROM access_codes WHERE id = ? AND campaign_id = ?")
      .bind(session.codeId, data.campaign.id)
      .first<AccessCodeRecord>();
    if (!code || code.status !== "active") {
      return NextResponse.json(
        { error: "Mã tham gia đã bị khóa hoặc thu hồi." },
        { status: 403 },
      );
    }
    if (code.spins_used >= code.spins_limit) {
      return NextResponse.json(
        { error: "Bạn đã sử dụng hết lượt quay." },
        { status: 409 },
      );
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const fresh = await getCampaignBySlug(slug);
      const prize = fresh ? choosePrize(fresh.prizes) : null;
      if (!prize) {
        return NextResponse.json(
          { error: "Tất cả phần thưởng đã được trao." },
          { status: 409 },
        );
      }
      const spinId = makeId("spn");
      const reservation = await db
        .prepare(
          "UPDATE prizes SET remaining = remaining - 1 WHERE id = ? AND campaign_id = ? AND remaining > 0 RETURNING remaining",
        )
        .bind(prize.id, data.campaign.id)
        .all<{ remaining: number }>();
      if (!reservation.results.length) continue;

      const consumption = await db
        .prepare(
          "UPDATE access_codes SET spins_used = spins_used + 1 WHERE id = ? AND campaign_id = ? AND status = 'active' AND spins_used < spins_limit RETURNING spins_limit, spins_used",
        )
        .bind(code.id, data.campaign.id)
        .all<{ spins_limit: number; spins_used: number }>();
      if (!consumption.results.length) {
        await db
          .prepare(
            "UPDATE prizes SET remaining = remaining + 1 WHERE id = ? AND campaign_id = ?",
          )
          .bind(prize.id, data.campaign.id)
          .run();
        return NextResponse.json(
          { error: "Bạn đã sử dụng hết lượt quay." },
          { status: 409 },
        );
      }
      try {
        await db
          .prepare(
            "INSERT INTO spins (id, campaign_id, access_code_id, prize_id, request_id, prize_name) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(
            spinId,
            data.campaign.id,
            code.id,
            prize.id,
            requestId,
            prize.name,
          )
          .run();
        const updatedCode = consumption.results[0];
        return NextResponse.json({
          result: {
            id: spinId,
            prizeId: prize.id,
            prizeName: prize.name,
            color: prize.color,
            createdAt: new Date().toISOString(),
          },
          spinsRemaining: updatedCode
            ? Math.max(0, updatedCode.spins_limit - updatedCode.spins_used)
            : 0,
        });
      } catch (error) {
        await db.batch([
          db
            .prepare(
              "UPDATE prizes SET remaining = remaining + 1 WHERE id = ? AND campaign_id = ?",
            )
            .bind(prize.id, data.campaign.id),
          db
            .prepare(
              "UPDATE access_codes SET spins_used = MAX(0, spins_used - 1) WHERE id = ? AND campaign_id = ?",
            )
            .bind(code.id, data.campaign.id),
        ]);
        const message = error instanceof Error ? error.message : "";
        if (message.includes("UNIQUE") || message.includes("request")) {
          const existing = await db
            .prepare("SELECT * FROM spins WHERE request_id = ?")
            .bind(requestId)
            .first<SpinRecord>();
          if (existing) return NextResponse.json({ result: existing, idempotent: true });
        }
        throw error;
      }
    }
    return NextResponse.json(
      { error: "Phần thưởng vừa hết. Vui lòng thử lại." },
      { status: 409 },
    );
  } catch {
    return NextResponse.json(
      { error: "Chưa thể ghi nhận lượt quay. Vui lòng thử lại." },
      { status: 503 },
    );
  }
}
