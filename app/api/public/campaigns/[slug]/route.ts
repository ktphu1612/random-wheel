import { NextResponse } from "next/server";
import {
  createCampaignDevice,
  getCampaignBySlug,
  getCampaignDevice,
} from "../../../../../lib/data";
import {
  DEVICE_COOKIE_MAX_AGE,
  deviceCookieName,
  matchesDeviceSession,
  type DeviceSession,
} from "../../../../../lib/device-policy";
import {
  cookieValue,
  getD1,
  sessionCookie,
  signToken,
  verifyToken,
} from "../../../../../lib/security";

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

    const cookieName = deviceCookieName(data.campaign.id);
    const session = await verifyToken<DeviceSession>(
      cookieValue(request, cookieName),
    );
    let device = matchesDeviceSession(session, data.campaign.id)
      ? await getCampaignDevice(data.campaign.id, session!.deviceId)
      : null;
    let token: string | null = null;

    if (!device) {
      device = await createCampaignDevice(data.campaign.id);
      if (!device) throw new Error("DEVICE_CREATE_FAILED");
      token = await signToken({
        campaignId: data.campaign.id,
        deviceId: device.id,
        exp: Date.now() + DEVICE_COOKIE_MAX_AGE * 1000,
      });
    }

    const history = (
      await getD1()
        .prepare(
          "SELECT id, prize_id, prize_name, fulfillment_status, created_at FROM spins WHERE access_code_id = ? ORDER BY created_at DESC",
        )
        .bind(device.id)
        .all()
    ).results;
    const response = NextResponse.json({
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
      device: {
        id: device.id,
        code_hint: device.code_hint,
        spins_limit: device.spins_limit,
        spins_used: device.spins_used,
        created_at: device.created_at,
      },
      history,
    });
    if (token) {
      response.headers.set(
        "Set-Cookie",
        sessionCookie(
          request,
          cookieName,
          token,
          DEVICE_COOKIE_MAX_AGE,
        ),
      );
    }
    return response;
  } catch {
    return NextResponse.json(
      { error: "Chưa thể tải vòng quay. Vui lòng thử lại." },
      { status: 503 },
    );
  }
}