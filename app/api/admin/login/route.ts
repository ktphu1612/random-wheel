import { NextResponse } from "next/server";
import {
  checkRateLimit,
  requestFingerprint,
  sessionCookie,
  signToken,
  verifyAdminPassword,
} from "../../../../lib/security";

export async function POST(request: Request) {
  try {
    const allowed = await checkRateLimit(
      `admin-login:${requestFingerprint(request)}`,
      8,
      15 * 60,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Đăng nhập bị tạm khóa trong ít phút." },
        { status: 429 },
      );
    }
    const body = (await request.json()) as { password?: string };
    if (!(await verifyAdminPassword(body.password ?? ""))) {
      return NextResponse.json(
        { error: "Mật khẩu quản trị không đúng." },
        { status: 401 },
      );
    }
    const maxAge = 12 * 60 * 60;
    const token = await signToken({
      role: "admin",
      exp: Date.now() + maxAge * 1000,
    });
    const response = NextResponse.json({ ok: true });
    response.headers.set(
      "Set-Cookie",
      sessionCookie(request, "qt_admin", token, maxAge),
    );
    return response;
  } catch {
    return NextResponse.json(
      { error: "Chưa thể đăng nhập. Vui lòng thử lại." },
      { status: 503 },
    );
  }
}
