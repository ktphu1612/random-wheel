import { NextResponse } from "next/server";
import { clearCookie } from "../../../../lib/security";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearCookie(request, "qt_admin"));
  return response;
}
