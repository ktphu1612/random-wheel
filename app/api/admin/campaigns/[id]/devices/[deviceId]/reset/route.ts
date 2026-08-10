import { NextResponse } from "next/server";
import { audit } from "../../../../../../../../lib/data";
import { remainingDeviceSpins } from "../../../../../../../../lib/device-policy";
import { getD1, requireAdmin } from "../../../../../../../../lib/security";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; deviceId: string }> },
) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Bạn chưa đăng nhập." }, { status: 401 });
  }
  const { id, deviceId } = await params;
  const updated = await getD1()
    .prepare(
      "UPDATE access_codes SET spins_limit = spins_used + 1 WHERE id = ? AND campaign_id = ? AND kind = 'device' RETURNING spins_limit, spins_used",
    )
    .bind(deviceId, id)
    .first<{ spins_limit: number; spins_used: number }>();
  if (!updated) {
    return NextResponse.json(
      { error: "Không tìm thấy thiết bị." },
      { status: 404 },
    );
  }
  const spinsRemaining = remainingDeviceSpins(
    updated.spins_limit,
    updated.spins_used,
  );
  await audit("device.spin_reset", "campaign", id, {
    deviceId,
    spinsRemaining,
  });
  return NextResponse.json({ ok: true, spinsRemaining });
}