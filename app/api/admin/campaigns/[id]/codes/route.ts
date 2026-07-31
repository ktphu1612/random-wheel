import { NextResponse } from "next/server";
import { audit } from "../../../../../../lib/data";
import {
  getD1,
  makeId,
  randomCode,
  requireAdmin,
  sha256,
} from "../../../../../../lib/security";
import type { CampaignRecord } from "../../../../../../lib/types";

type ImportRow = {
  code?: string;
  participantName?: string;
  contact?: string;
  spinsLimit?: number;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Bạn chưa đăng nhập." }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json()) as {
    mode?: "generate" | "import";
    count?: number;
    rows?: ImportRow[];
  };
  const db = getD1();
  const campaign = await db
    .prepare("SELECT * FROM campaigns WHERE id = ?")
    .bind(id)
    .first<CampaignRecord>();
  if (!campaign) {
    return NextResponse.json({ error: "Không tìm thấy vòng quay." }, { status: 404 });
  }
  const rows: ImportRow[] =
    body.mode === "import"
      ? (body.rows ?? []).slice(0, 1000)
      : Array.from(
          { length: Math.max(1, Math.min(500, Number(body.count) || 1)) },
          () => ({ code: randomCode() }),
        );
  if (!rows.length) {
    return NextResponse.json({ error: "Không có mã để nhập." }, { status: 400 });
  }
  const prepared = await Promise.all(
    rows.map(async (row) => {
      const code = (row.code?.trim().toUpperCase() || randomCode()).replace(/\s/g, "");
      return {
        id: makeId("cod"),
        code,
        hash: await sha256(code),
        hint:
          code.length <= 8
            ? `${code.slice(0, 2)}••••${code.slice(-2)}`
            : `${code.slice(0, 4)}••••${code.slice(-4)}`,
        participantName: row.participantName?.trim() || null,
        contact: row.contact?.trim() || null,
        spinsLimit: Math.max(
          1,
          Math.min(100, Number(row.spinsLimit) || campaign.default_spins),
        ),
      };
    }),
  );
  try {
    await db.batch(
      prepared.map((item) =>
        db
          .prepare(
            "INSERT INTO access_codes (id, campaign_id, code_hash, code_hint, participant_name, contact, spins_limit) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            item.id,
            id,
            item.hash,
            item.hint,
            item.participantName,
            item.contact,
            item.spinsLimit,
          ),
      ),
    );
    await audit("codes.created", "campaign", id, { count: prepared.length });
    return NextResponse.json({
      ok: true,
      created: prepared.map(({ code, participantName, contact, spinsLimit }) => ({
        code,
        participantName,
        contact,
        spinsLimit,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "Có mã bị trùng. Hãy kiểm tra lại danh sách nhập." },
      { status: 409 },
    );
  }
}
