import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships Vietnamese landing, admin and participant surfaces", async () => {
  const [home, admin, wheel, layout] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/admin/admin-dashboard.tsx", root), "utf8"),
    readFile(
      new URL("app/vong-quay/[slug]/wheel-experience.tsx", root),
      "utf8",
    ),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);
  assert.match(home, /Mỗi lượt quay/);
  assert.match(home, /MAYMAN2026/);
  assert.match(admin, /Tạo vòng quay/);
  assert.match(admin, /Phần thưởng & xác suất/);
  assert.match(wheel, /Kết quả của bạn/);
  assert.match(layout, /lang="vi"/);
  assert.doesNotMatch(`${home}${admin}${wheel}`, /codex-preview|SkeletonPreview/);
});

test("keeps durable state and server-side spin protections configured", async () => {
  const [hosting, schema, spinRoute, migration] = await Promise.all([
    readFile(new URL(".openai/hosting.json", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(
      new URL("app/api/public/campaigns/[slug]/spin/route.ts", root),
      "utf8",
    ),
    readFile(
      new URL("drizzle/0000_ordinary_gunslinger.sql", root),
      "utf8",
    ),
  ]);
  assert.match(hosting, /"d1":\s*"DB"/);
  assert.match(schema, /access_codes/);
  assert.match(schema, /spins_request_uq/);
  assert.match(spinRoute, /requestId/);
  assert.match(spinRoute, /choosePrize/);
  assert.match(spinRoute, /remaining = remaining - 1/);
  assert.match(spinRoute, /remaining > 0 RETURNING remaining/);
  assert.match(spinRoute, /spins_used < spins_limit RETURNING/);
  assert.doesNotMatch(migration, /CREATE TRIGGER/);
});

test("removes the starter preview and includes a social card", async () => {
  await access(new URL("public/og.png", root));
  await assert.rejects(
    access(new URL("app/_sites-preview/SkeletonPreview.tsx", root)),
  );
  const packageJson = await readFile(new URL("package.json", root), "utf8");
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
