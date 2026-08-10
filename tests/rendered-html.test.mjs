import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships Vietnamese landing, admin and participant surfaces", async () => {
  const [home, admin, wheel, wheelPage, layout] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/admin/admin-dashboard.tsx", root), "utf8"),
    readFile(
      new URL("app/vong-quay/[slug]/wheel-experience.tsx", root),
      "utf8",
    ),
    readFile(new URL("app/vong-quay/[slug]/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);
  assert.match(home, /Mỗi lượt quay/);
  assert.doesNotMatch(home, /MAYMAN2026|Mã trải nghiệm/);
  assert.match(admin, /Tạo vòng quay/);
  assert.match(admin, /Phần thưởng & xác suất/);
  assert.match(wheel, /Kết quả của bạn/);
  assert.doesNotMatch(wheel, /Nhập mã của bạn|access-code|claim/);
  assert.match(wheel, /Bạn đã hết lượt quay\./);
  assert.match(admin, /Thiết bị/);
  assert.match(admin, /Reset lượt/);
  assert.doesNotMatch(admin, /Tạo mã|Nhập CSV|Lượt mặc định mỗi mã/);
  assert.match(wheel, /wheel-label-anchor/);
  assert.match(wheel, /flipLabel/);
  assert.doesNotMatch(wheelPage, /Nh\u1eadp m\u00e3 tham gia/);
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
  assert.match(schema, /spins_device_request_uq/);
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

test("distinguishes devices and scopes retries to one device", async () => {
  const schema = await readFile(new URL("db/schema.ts", root), "utf8");
  assert.match(schema, /kind: text\("kind"\).*default\("code"\)/s);
  assert.match(schema, /access_codes_campaign_kind_idx/);
  assert.match(schema, /spins_device_request_uq/);
  assert.doesNotMatch(schema, /spins_request_uq/);
});
test("creates a device session without an access-code claim", async () => {
  const route = await readFile(
    new URL("app/api/public/campaigns/[slug]/route.ts", root),
    "utf8",
  );
  const data = await readFile(new URL("lib/data.ts", root), "utf8");
  assert.match(data, /kind = 'device'/);
  assert.match(route, /deviceCookieName/);
  assert.match(route, /DEVICE_COOKIE_MAX_AGE/);
  assert.match(route, /Set-Cookie/);
  assert.match(route, /device:/);
  await assert.rejects(
    access(new URL("app/api/public/campaigns/[slug]/claim/route.ts", root)),
  );
});
test("enforces device ownership and device-scoped retries", async () => {
  const spinRoute = await readFile(
    new URL("app/api/public/campaigns/[slug]/spin/route.ts", root),
    "utf8",
  );
  assert.match(spinRoute, /deviceCookieName/);
  assert.match(spinRoute, /kind = 'device'/);
  assert.match(
    spinRoute,
    /request_id = \? AND campaign_id = \? AND access_code_id = \?/,
  );
  assert.match(spinRoute, /spins_used < spins_limit RETURNING/);
  assert.doesNotMatch(spinRoute, /Vui lòng nhập mã tham gia/);
});
test("lists devices and exposes an authenticated non-stacking reset", async () => {
  const [dashboardRoute, detailRoute, resetRoute] = await Promise.all([
    readFile(new URL("app/api/admin/dashboard/route.ts", root), "utf8"),
    readFile(new URL("app/api/admin/campaigns/[id]/route.ts", root), "utf8"),
    readFile(
      new URL(
        "app/api/admin/campaigns/[id]/devices/[deviceId]/reset/route.ts",
        root,
      ),
      "utf8",
    ),
  ]);
  assert.match(dashboardRoute, /deviceCount/);
  assert.match(dashboardRoute, /kind = 'device'/);
  assert.match(detailRoute, /devices:/);
  assert.match(detailRoute, /kind = 'device'/);
  assert.match(resetRoute, /requireAdmin/);
  assert.match(resetRoute, /spins_limit = spins_used \+ 1/);
});
test("keeps scripts portable and removes obsolete code helpers", async () => {
  const [packageJson, security, data, eslintConfig] = await Promise.all([
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("lib/security.ts", root), "utf8"),
    readFile(new URL("lib/data.ts", root), "utf8"),
    readFile(new URL("eslint.config.mjs", root), "utf8"),
  ]);
  assert.doesNotMatch(packageJson, /WRANGLER_LOG_PATH=/);
  assert.match(packageJson, /--experimental-strip-types --test/);
  assert.doesNotMatch(security, /randomCode/);
  assert.doesNotMatch(data, /getAccessCode|MAYMAN2026/);
  assert.match(eslintConfig, /\.worktrees\/\*\*/);
});
