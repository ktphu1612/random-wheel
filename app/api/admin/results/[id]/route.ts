import { NextResponse } from "next/server";
import { audit } from "../../../../../lib/data";
import { getD1, requireAdmin } from "../../../../../lib/security";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Bạn chưa đăng nhập." }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json()) as {
    fulfilled?: boolean;
    note?: string;
  };
  const status = body.fulfilled ? "fulfilled" : "pending";
  await getD1()
    .prepare(
      "UPDATE spins SET fulfillment_status = ?, fulfilled_at = ?, fulfillment_note = ? WHERE id = ?",
    )
    .bind(
      status,
      body.fulfilled ? new Date().toISOString() : null,
      body.note?.trim() || null,
      id,
    )
    .run();
  await audit("spin.fulfillment_updated", "spin", id, { status });
  return NextResponse.json({ ok: true });
}
