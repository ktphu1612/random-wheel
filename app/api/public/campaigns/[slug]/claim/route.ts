import { NextResponse } from "next/server";
import { getAccessCode, getCampaignBySlug } from "../../../../../../lib/data";
import {
  checkRateLimit,
  requestFingerprint,
  sessionCookie,
  signToken,
} from "../../../../../../lib/security";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const allowed = await checkRateLimit(
      `claim:${requestFingerprint(request)}`,
      12,
      10 * 60,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Bạn đã thử quá nhiều lần. Hãy đợi vài phút." },
        { status: 429 },
      );
    }
    const { slug } = await params;
    const body = (await request.json()) as { code?: string };
    const data = await getCampaignBySlug(slug);
    if (!data) {
      return NextResponse.json({ error: "Vòng quay không tồn tại." }, { status: 404 });
    }
    const code = await getAccessCode(data.campaign.id, body.code ?? "");
    if (!code || code.status !== "active") {
      return NextResponse.json(
        { error: "Mã không hợp lệ hoặc đã bị khóa." },
        { status: 401 },
      );
    }
    const maxAge = 7 * 24 * 60 * 60;
    const token = await signToken({
      campaignId: data.campaign.id,
      codeId: code.id,
      exp: Date.now() + maxAge * 1000,
    });
    const response = NextResponse.json({
      ok: true,
      participant: {
        id: code.id,
        code_hint: code.code_hint,
        participant_name: code.participant_name,
        spins_limit: code.spins_limit,
        spins_used: code.spins_used,
        status: code.status,
      },
    });
    response.headers.set(
      "Set-Cookie",
      sessionCookie(
        request,
        `qt_player_${data.campaign.id.slice(-12)}`,
        token,
        maxAge,
      ),
    );
    return response;
  } catch {
    return NextResponse.json(
      { error: "Chưa thể xác nhận mã. Vui lòng thử lại." },
      { status: 503 },
    );
  }
}
