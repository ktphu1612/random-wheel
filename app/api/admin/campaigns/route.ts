import { NextResponse } from "next/server";
import { audit } from "../../../../lib/data";
import { getD1, makeId, requireAdmin } from "../../../../lib/security";

const RESERVED_SLUGS = new Set(["admin", "api"]);

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Bạn chưa đăng nhập." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      startsAt?: string;
      endsAt?: string;
    };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Vui lòng nhập tên vòng quay." }, { status: 400 });
    }
    const startsAt = body.startsAt
      ? new Date(body.startsAt).toISOString()
      : new Date().toISOString();
    const endsAt = body.endsAt
      ? new Date(body.endsAt).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    if (new Date(endsAt) <= new Date(startsAt)) {
      return NextResponse.json(
        { error: "Thời gian kết thúc phải sau thời gian bắt đầu." },
        { status: 400 },
      );
    }
    const db = getD1();
    const id = makeId("cmp");
    let slug = slugify(name) || `vong-quay-${Date.now()}`;
    if (RESERVED_SLUGS.has(slug)) slug = `vong-quay-${slug}`;
    const existing = await db
      .prepare("SELECT id FROM campaigns WHERE slug = ?")
      .bind(slug)
      .first();
    if (existing) slug = `${slug}-${Date.now().toString().slice(-5)}`;
    await db
      .prepare(
        "INSERT INTO campaigns (id, name, slug, description, status, starts_at, ends_at) VALUES (?, ?, ?, ?, 'draft', ?, ?)",
      )
      .bind(
        id,
        name,
        slug,
        body.description?.trim() ?? "",
        startsAt,
        endsAt,
      )
      .run();
    await audit("campaign.created", "campaign", id, { name, slug });
    return NextResponse.json({ ok: true, id, slug }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Không thể tạo vòng quay. Tên hoặc đường dẫn có thể đã tồn tại." },
      { status: 409 },
    );
  }
}
