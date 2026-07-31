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
    status?: "active" | "blocked" | "revoked";
    spinsLimit?: number;
  };
  const db = getD1();
  await db
    .prepare(
      "UPDATE access_codes SET status = COALESCE(?, status), spins_limit = COALESCE(?, spins_limit) WHERE id = ?",
    )
    .bind(
      body.status ?? null,
      body.spinsLimit
        ? Math.max(1, Math.min(100, Number(body.spinsLimit)))
        : null,
      id,
    )
    .run();
  await audit("code.updated", "access_code", id, body);
  return NextResponse.json({ ok: true });
}
