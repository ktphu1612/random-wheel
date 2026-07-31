import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB?: D1Database;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
};

const encoder = new TextEncoder();

export function runtimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

export function getD1(): D1Database {
  const db = runtimeEnv().DB;
  if (!db) throw new Error("D1_UNAVAILABLE");
  return db;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signingKey(): Promise<CryptoKey> {
  const secret =
    runtimeEnv().SESSION_SECRET ??
    (process.env.NODE_ENV !== "production"
      ? "vong-quay-local-development-secret"
      : "");
  if (!secret) throw new Error("SESSION_SECRET_MISSING");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signToken(payload: Record<string, unknown>) {
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    encoder.encode(body),
  );
  return `${body}.${base64Url(new Uint8Array(signature))}`;
}

export async function verifyToken<T extends { exp?: number }>(
  token: string | null,
): Promise<T | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      decodeBase64Url(signature).buffer as ArrayBuffer,
      encoder.encode(body),
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(body)),
    ) as T;
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionCookie(
  request: Request,
  name: string,
  value: string,
  maxAge: number,
) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function clearCookie(request: Request, name: string) {
  return sessionCookie(request, name, "", 0);
}

export async function requireAdmin(request: Request) {
  const payload = await verifyToken<{ role: string; exp: number }>(
    cookieValue(request, "qt_admin"),
  );
  return payload?.role === "admin";
}

export async function verifyAdminPassword(value: string) {
  const expected =
    runtimeEnv().ADMIN_PASSWORD ??
    (process.env.NODE_ENV !== "production" ? "quaythuong-demo" : "");
  if (!expected || !value) return false;
  const [left, right] = await Promise.all([sha256(value), sha256(expected)]);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export function requestFingerprint(request: Request) {
  const forwarded =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "local";
  return forwarded.split(",")[0].trim();
}

export async function checkRateLimit(
  key: string,
  maximum: number,
  windowSeconds: number,
) {
  const db = getD1();
  const now = new Date();
  const existing = await db
    .prepare("SELECT attempts, window_started_at FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ attempts: number; window_started_at: string }>();
  const expired =
    !existing ||
    now.getTime() - new Date(existing.window_started_at).getTime() >
      windowSeconds * 1000;
  if (expired) {
    await db
      .prepare(
        "INSERT INTO rate_limits (key, attempts, window_started_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = 1, window_started_at = excluded.window_started_at",
      )
      .bind(key, now.toISOString())
      .run();
    return true;
  }
  if (existing.attempts >= maximum) return false;
  await db
    .prepare("UPDATE rate_limits SET attempts = attempts + 1 WHERE key = ?")
    .bind(key)
    .run();
  return true;
}

export function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function randomCode(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}
