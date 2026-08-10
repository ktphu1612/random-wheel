# Device-Based Spin Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove access-code entry, grant one spin per browser per campaign, and let admin reset one selected device without deleting its history.

**Architecture:** Reuse `access_codes` as the device registry by adding a `kind` discriminator. A signed, campaign-scoped HttpOnly cookie points to a `kind = 'device'` row; existing `spins.access_code_id` relations remain intact. Device rules live in one dependency-free policy module so they can be tested with Node's built-in test runner before route changes.

**Tech Stack:** Next/vinext, React 19, Cloudflare Worker/D1, Drizzle ORM, TypeScript, Node `node:test`.

## Global Constraints

- One browser cookie gets one initial spin per campaign.
- Clearing cookies, private browsing, or another browser counts as another device.
- Admin reset preserves previous spins and sets exactly one spin available; repeated resets do not stack.
- The exhausted-state copy is exactly `Bạn đã hết lượt quay.`
- Preserve all existing access-code and spin history.
- Do not add dependencies or browser fingerprinting.
- Use TDD: every production behavior starts with a focused failing test.

## File Structure

- Create `lib/device-policy.ts`: pure cookie naming, device labeling, remaining-spin, reset, and session-match rules.
- Create `tests/device-policy.test.mjs`: executable business-rule tests.
- Modify `db/schema.ts`: distinguish legacy codes from devices and scope idempotency to a device.
- Generate `drizzle/0001_device_spin_limit.sql` and `drizzle/meta/0001_snapshot.json`; update `drizzle/meta/_journal.json`.
- Modify `lib/types.ts`, `lib/data.ts`, and `lib/security.ts`: device records and cleanup of obsolete code helpers.
- Modify public campaign and spin routes; delete the claim route.
- Modify admin dashboard/detail APIs and create a device-reset API; delete code-generation APIs.
- Modify participant/admin UI and landing copy.
- Modify `package.json`, `README.md`, and existing tests for portable verification and current behavior.

---

### Task 1: Encode Device Spin Rules

**Files:**
- Create: `lib/device-policy.ts`
- Create: `tests/device-policy.test.mjs`

**Interfaces:**
- Produces: `DEVICE_COOKIE_MAX_AGE`, `deviceCookieName(campaignId)`, `deviceLabel(deviceId)`, `remainingDeviceSpins(spinsLimit, spinsUsed)`, `resetDeviceSpinLimit(spinsUsed)`, `matchesDeviceSession(session, campaignId)`.

- [ ] **Step 1: Write the failing policy tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVICE_COOKIE_MAX_AGE,
  deviceCookieName,
  deviceLabel,
  matchesDeviceSession,
  remainingDeviceSpins,
  resetDeviceSpinLimit,
} from "../lib/device-policy.ts";

test("isolates device cookies by campaign", () => {
  assert.equal(deviceCookieName("cmp_alpha_123456789012"), "qt_device_123456789012");
  assert.notEqual(deviceCookieName("cmp_alpha_123456789012"), deviceCookieName("cmp_beta_123456789013"));
  assert.equal(DEVICE_COOKIE_MAX_AGE, 400 * 24 * 60 * 60);
});

test("shows a stable short device label", () => {
  assert.equal(deviceLabel("dev_abcdef1234567890"), "TB-34567890");
});

test("grants one initial spin and never reports a negative balance", () => {
  assert.equal(remainingDeviceSpins(1, 0), 1);
  assert.equal(remainingDeviceSpins(1, 1), 0);
  assert.equal(remainingDeviceSpins(1, 2), 0);
});

test("reset grants exactly one available spin without stacking", () => {
  assert.equal(resetDeviceSpinLimit(0), 1);
  assert.equal(resetDeviceSpinLimit(3), 4);
  assert.equal(resetDeviceSpinLimit(3), 4);
});

test("accepts a signed session only for its campaign", () => {
  const session = { campaignId: "cmp_a", deviceId: "dev_a", exp: Date.now() + 1000 };
  assert.equal(matchesDeviceSession(session, "cmp_a"), true);
  assert.equal(matchesDeviceSession(session, "cmp_b"), false);
  assert.equal(matchesDeviceSession(null, "cmp_a"), false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --experimental-strip-types --test tests/device-policy.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/device-policy.ts`.

- [ ] **Step 3: Add the minimal policy implementation**

```ts
export const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export type DeviceSession = {
  campaignId: string;
  deviceId: string;
  exp: number;
};

export function deviceCookieName(campaignId: string) {
  return `qt_device_${campaignId.slice(-12)}`;
}

export function deviceLabel(deviceId: string) {
  return `TB-${deviceId.slice(-8).toUpperCase()}`;
}

export function remainingDeviceSpins(spinsLimit: number, spinsUsed: number) {
  return Math.max(0, spinsLimit - spinsUsed);
}

export function resetDeviceSpinLimit(spinsUsed: number) {
  return spinsUsed + 1;
}

export function matchesDeviceSession(
  session: DeviceSession | null,
  campaignId: string,
) {
  return session?.campaignId === campaignId && Boolean(session.deviceId);
}
```

- [ ] **Step 4: Run the policy test and verify GREEN**

Run: `node --experimental-strip-types --test tests/device-policy.test.mjs`

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```powershell
git -c safe.directory=D:/lucky2 add lib/device-policy.ts tests/device-policy.test.mjs
git -c safe.directory=D:/lucky2 commit -m "test: define device spin policy"
```

---

### Task 2: Add the Device Discriminator and Scoped Idempotency

**Files:**
- Modify: `db/schema.ts`
- Modify: `tests/rendered-html.test.mjs`
- Create: `drizzle/0001_device_spin_limit.sql`
- Create: `drizzle/meta/0001_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `access_codes.kind` with values `code` or `device`.
- Produces: unique spin requests per `(access_code_id, request_id)` instead of globally per request ID.

- [ ] **Step 1: Add a failing schema contract test**

Append to `tests/rendered-html.test.mjs`:

```js
test("distinguishes devices and scopes retries to one device", async () => {
  const schema = await readFile(new URL("db/schema.ts", root), "utf8");
  assert.match(schema, /kind: text\("kind"\).*default\("code"\)/s);
  assert.match(schema, /access_codes_campaign_kind_idx/);
  assert.match(schema, /spins_device_request_uq/);
  assert.doesNotMatch(schema, /spins_request_uq/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/rendered-html.test.mjs`

Expected: FAIL because `kind` and `spins_device_request_uq` do not exist.

- [ ] **Step 3: Modify the Drizzle schema minimally**

In `accessCodes`, add:

```ts
kind: text("kind").notNull().default("code"),
```

Add the composite lookup index:

```ts
index("access_codes_campaign_kind_idx").on(table.campaignId, table.kind),
```

Replace the spin request index with:

```ts
uniqueIndex("spins_device_request_uq").on(
  table.accessCodeId,
  table.requestId,
),
```

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm.cmd run db:generate -- --name=device_spin_limit`

Expected generated SQL in `drizzle/0001_device_spin_limit.sql`:

```sql
ALTER TABLE `access_codes` ADD `kind` text DEFAULT 'code' NOT NULL;
CREATE INDEX `access_codes_campaign_kind_idx` ON `access_codes` (`campaign_id`,`kind`);
DROP INDEX `spins_request_uq`;
CREATE UNIQUE INDEX `spins_device_request_uq` ON `spins` (`access_code_id`,`request_id`);
```

Inspect `drizzle/meta/0001_snapshot.json` and confirm both indexes and the `kind` column match `db/schema.ts`.

- [ ] **Step 5: Run schema tests and build**

Run: `node --test tests/rendered-html.test.mjs`

Expected: PASS.

Run: `$env:WRANGLER_LOG_PATH='.wrangler/wrangler.log'; .\node_modules\.bin\vinext.cmd build`

Expected: build completes.

- [ ] **Step 6: Commit**

```powershell
git -c safe.directory=D:/lucky2 add db/schema.ts drizzle tests/rendered-html.test.mjs
git -c safe.directory=D:/lucky2 commit -m "feat: distinguish campaign devices"
```

---

### Task 3: Create Device Sessions Automatically

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/data.ts`
- Modify: `app/api/public/campaigns/[slug]/route.ts`
- Delete: `app/api/public/campaigns/[slug]/claim/route.ts`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Produces: `DeviceRecord` with existing access-code columns plus `kind: "device"`.
- Produces: public campaign JSON field `device` and a campaign-scoped signed cookie.
- Consumes: policy functions from Task 1.

- [ ] **Step 1: Write the failing public-session contract test**

Append to `tests/rendered-html.test.mjs`:

```js
test("creates a device session without an access-code claim", async () => {
  const route = await readFile(
    new URL("app/api/public/campaigns/[slug]/route.ts", root),
    "utf8",
  );
  assert.match(route, /kind = 'device'/);
  assert.match(route, /deviceCookieName/);
  assert.match(route, /DEVICE_COOKIE_MAX_AGE/);
  assert.match(route, /Set-Cookie/);
  assert.match(route, /device:/);
  await assert.rejects(
    access(new URL("app/api/public/campaigns/[slug]/claim/route.ts", root)),
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/rendered-html.test.mjs`

Expected: FAIL because the route still returns `participant` and the claim route exists.

- [ ] **Step 3: Add device record operations**

In `lib/types.ts`, add `kind` to `AccessCodeRecord` and expose:

```ts
export type DeviceRecord = AccessCodeRecord & { kind: "device" };
```

In `lib/data.ts`, remove `getAccessCode` and add:

```ts
export async function getCampaignDevice(campaignId: string, deviceId: string) {
  return getD1()
    .prepare(
      "SELECT * FROM access_codes WHERE id = ? AND campaign_id = ? AND kind = 'device'",
    )
    .bind(deviceId, campaignId)
    .first<DeviceRecord>();
}

export async function createCampaignDevice(campaignId: string) {
  const id = makeId("dev");
  return getD1()
    .prepare(
      "INSERT INTO access_codes (id, campaign_id, kind, code_hash, code_hint, spins_limit) VALUES (?, ?, 'device', ?, ?, 1) RETURNING *",
    )
    .bind(id, campaignId, await sha256(id), deviceLabel(id))
    .first<DeviceRecord>();
}
```

Import `DeviceRecord` and `deviceLabel` in `lib/data.ts`.

- [ ] **Step 4: Replace claim-based lookup in the public campaign route**

Use `deviceCookieName(campaign.id)` and `verifyToken<DeviceSession>()`. If the session matches and its device exists, reuse it. Otherwise create a device, sign:

```ts
{
  campaignId: data.campaign.id,
  deviceId: device.id,
  exp: Date.now() + DEVICE_COOKIE_MAX_AGE * 1000,
}
```

Return:

```ts
{
  campaign: { ... },
  prizes: [ ... ],
  device,
  history,
}
```

Set the cookie only when a new device is created:

```ts
response.headers.set(
  "Set-Cookie",
  sessionCookie(request, cookieName, token, DEVICE_COOKIE_MAX_AGE),
);
```

Delete `app/api/public/campaigns/[slug]/claim/route.ts`.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --experimental-strip-types --test tests/device-policy.test.mjs`

Run: `node --test tests/rendered-html.test.mjs`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git -c safe.directory=D:/lucky2 add lib app/api/public tests
git -c safe.directory=D:/lucky2 commit -m "feat: create campaign device sessions"
```

---

### Task 4: Enforce One Spin Per Device

**Files:**
- Modify: `app/api/public/campaigns/[slug]/spin/route.ts`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: signed `DeviceSession`, `deviceCookieName`, and `remainingDeviceSpins`.
- Produces: one guarded spin per available device entitlement.

- [ ] **Step 1: Write the failing spin-route contract test**

Replace the old code-session assertions in `tests/rendered-html.test.mjs` with:

```js
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
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/rendered-html.test.mjs`

Expected: FAIL because the route still reads a claim-issued `codeId` session.

- [ ] **Step 3: Switch the route to the device cookie**

- Verify `DeviceSession` for the current campaign.
- Load `access_codes` by `deviceId`, `campaign_id`, and `kind = 'device'`.
- Reject a missing device with `401` and `Không tìm thấy phiên thiết bị.`
- Keep the existing rate limit, prize reservation, guarded spin consumption, and compensation path.
- Scope every idempotency lookup to `request_id`, `campaign_id`, and `access_code_id`.
- Return `spinsRemaining` via `remainingDeviceSpins(updated.spins_limit, updated.spins_used)`.
- Change the exhausted message to `Bạn đã hết lượt quay.`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --experimental-strip-types --test tests/device-policy.test.mjs`

Run: `node --test tests/rendered-html.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git -c safe.directory=D:/lucky2 add -- 'app/api/public/campaigns/[slug]/spin/route.ts' tests/rendered-html.test.mjs
git -c safe.directory=D:/lucky2 commit -m "feat: limit spins by campaign device"
```

---

### Task 5: Replace Admin Codes with Devices and Reset

**Files:**
- Modify: `app/api/admin/dashboard/route.ts`
- Modify: `app/api/admin/campaigns/[id]/route.ts`
- Modify: `app/api/admin/campaigns/route.ts`
- Create: `app/api/admin/campaigns/[id]/devices/[deviceId]/reset/route.ts`
- Delete: `app/api/admin/campaigns/[id]/codes/route.ts`
- Delete: `app/api/admin/codes/[id]/route.ts`
- Modify: `lib/data.ts`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Produces: campaign summary `deviceCount`.
- Produces: campaign detail `devices` filtered by `kind = 'device'`.
- Produces: `POST /api/admin/campaigns/:id/devices/:deviceId/reset`.

- [ ] **Step 1: Write the failing admin-device contract test**

Append to `tests/rendered-html.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/rendered-html.test.mjs`

Expected: FAIL because the reset route and device payload do not exist.

- [ ] **Step 3: Return device counts and device details**

In the dashboard query, count only:

```sql
SELECT COUNT(*) AS total
FROM access_codes
WHERE campaign_id = ? AND kind = 'device'
```

Expose `deviceCount` instead of `codeCount`.

In campaign detail, replace `codes` with:

```sql
SELECT id, code_hint, spins_limit, spins_used, created_at
FROM access_codes
WHERE campaign_id = ? AND kind = 'device'
ORDER BY created_at DESC
LIMIT 500
```

Return it as `devices`, and keep `access_code_id` in each spin row so the UI can find a device's latest result.

- [ ] **Step 4: Add the reset route**

Implement authenticated `POST` with params `{ id, deviceId }`:

```sql
UPDATE access_codes
SET spins_limit = spins_used + 1
WHERE id = ? AND campaign_id = ? AND kind = 'device'
RETURNING spins_limit, spins_used
```

Return `404` when no row is updated. Audit `device.spin_reset` against the campaign ID with details containing `deviceId` and the new available balance so it remains visible in the existing campaign audit tab.

- [ ] **Step 5: Remove obsolete code management**

- Delete the code generation/import and code status routes.
- Remove the demo access-code insert and `MAYMAN2026` hash from `ensureSeedData()`.
- Remove `defaultSpins` request handling from campaign creation; rely on the database default `1` for the retained legacy column.
- Remove `defaultSpins` from the campaign PATCH request type and update binding; keep the database column only for backward-compatible row shape.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `node --test tests/rendered-html.test.mjs`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git -c safe.directory=D:/lucky2 add app/api/admin lib/data.ts tests/rendered-html.test.mjs
git -c safe.directory=D:/lucky2 commit -m "feat: manage campaign devices"
```

---

### Task 6: Update Participant, Admin, and Landing Interfaces

**Files:**
- Modify: `app/vong-quay/[slug]/wheel-experience.tsx`
- Modify: `app/admin/admin-dashboard.tsx`
- Modify: `app/page.tsx`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: public `device` payload and admin `devices` payload.
- Produces: no-code participant flow and selected-device reset UI.

- [ ] **Step 1: Write failing interface assertions**

Update the first test in `tests/rendered-html.test.mjs`:

```js
assert.doesNotMatch(home, /MAYMAN2026|Mã trải nghiệm/);
assert.doesNotMatch(wheel, /Nhập mã của bạn|access-code|claim/);
assert.match(wheel, /Bạn đã hết lượt quay\./);
assert.match(admin, /Thiết bị/);
assert.match(admin, /Reset lượt/);
assert.doesNotMatch(admin, /Tạo mã|Nhập CSV|Lượt mặc định mỗi mã/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/rendered-html.test.mjs`

Expected: FAIL on current code-entry and admin-code copy.

- [ ] **Step 3: Simplify the participant component**

- Rename payload field `participant` to `device`.
- Remove `code`, `submitting`, and `claim()`.
- Remove the code form and render spin controls directly when the campaign is active.
- Compute the balance with `remainingDeviceSpins(device.spins_limit, device.spins_used)` or the equivalent server values.
- Show device.code_hint near the controls/history so the player can identify the device to admin.
- Remove the old BƯỚC 1 / 2 and BƯỚC 2 / 2 wording because there is no claim step.
- When balance is zero, render `<h2>Bạn đã hết lượt quay.</h2>` and keep the history section visible.
- Keep the existing server-selected prize animation and winner overlay, but replace the contact promise with `Kết quả đã được lưu. Hãy giữ màn hình này để đối chiếu khi nhận quà.`.

- [ ] **Step 4: Replace the admin code UI**

- Rename `codeCount` to `deviceCount` in summary types and cards.
- Rename detail `codes` to `devices`.
- Rename the sidebar/tab copy to `Thiết bị`.
- Remove code-count input, CSV import, code generation, and block/unblock controls.
- For each device, show `code_hint`, `created_at`, `spins_used`, `spins_limit - spins_used`, and the newest spin whose `access_code_id` matches the device ID.
- Add a `Reset lượt` button that posts to `/api/admin/campaigns/${campaign.id}/devices/${device.id}/reset`, then calls `refresh()`.
- In the results table and CSV, use the device label instead of participant name and rename the CSV column from `Mã` to `Thiết bị`.
- Remove `defaultSpins` from the create form and the overview editor.
- When saving overview fields, omit `prizes`; include `prizes` only from the prizes tab so active campaign metadata can still be saved.

- [ ] **Step 5: Remove public demo-code copy**

Delete the `demo-code` paragraph from `app/page.tsx`; keep the experience link.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `node --experimental-strip-types --test tests/device-policy.test.mjs`

Run: `node --test tests/rendered-html.test.mjs`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git -c safe.directory=D:/lucky2 add app tests/rendered-html.test.mjs
git -c safe.directory=D:/lucky2 commit -m "feat: replace access codes with device spins"
```

---

### Task 7: Clean Up and Make Verification Portable

**Files:**
- Modify: `lib/security.ts`
- Modify: `lib/types.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Produces: Windows-compatible `dev`, `build`, `start`, and `test` scripts.

- [ ] **Step 1: Write the failing cleanup assertion**

Append to `tests/rendered-html.test.mjs`:

```js
test("keeps scripts portable and removes obsolete code helpers", async () => {
  const [packageJson, security, data] = await Promise.all([
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("lib/security.ts", root), "utf8"),
    readFile(new URL("lib/data.ts", root), "utf8"),
  ]);
  assert.doesNotMatch(packageJson, /WRANGLER_LOG_PATH=/);
  assert.match(packageJson, /--experimental-strip-types --test/);
  assert.doesNotMatch(security, /randomCode/);
  assert.doesNotMatch(data, /getAccessCode|MAYMAN2026/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/rendered-html.test.mjs`

Expected: FAIL on POSIX-only scripts and obsolete helpers.

- [ ] **Step 3: Remove unused code paths**

- Remove `randomCode` if no caller remains.
- Retain the database-shaped access-code fields required by `DeviceRecord`; remove only imports and helpers with no remaining caller.
- Update README to describe the no-code device flow and admin reset instead of the vinext starter/access-code workflow.

- [ ] **Step 4: Make npm scripts cross-platform**

Use:

```json
{
  "dev": "vinext dev",
  "build": "vinext build",
  "start": "vinext start",
  "test": "npm run build && node --experimental-strip-types --test"
}
```

`vite.config.ts` already sets project-local Wrangler defaults before importing the Cloudflare plugin, so the inline POSIX environment assignment is unnecessary.

- [ ] **Step 5: Run the complete verification suite**

Run: `npm.cmd run lint`

Expected: no lint errors.

Run: `npm.cmd test`

Expected: build completes and all Node tests pass on Windows.

Run: `git -c safe.directory=D:/lucky2 diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Commit**

```powershell
git -c safe.directory=D:/lucky2 add lib package.json package-lock.json README.md tests
git -c safe.directory=D:/lucky2 commit -m "chore: remove access-code leftovers"
```

---

### Task 8: Final Behavior Audit

**Files:**
- Verify only; modify the smallest affected file if a check fails.

- [ ] **Step 1: Confirm removed surfaces are gone**

Run: `rg -n "MAYMAN2026|Nhập mã|Tạo mã|Nhập CSV|defaultSpins|/claim|api/admin/codes|campaigns/.*/codes" app lib tests README.md`

Expected: no product-code matches; test descriptions may mention removal only when explicitly asserted.

- [ ] **Step 2: Confirm device surfaces are wired end-to-end**

Run: `rg -n "kind = 'device'|deviceCookieName|deviceCount|Reset lượt|Bạn đã hết lượt quay" app lib db tests`

Expected: matches in schema/data, public routes, admin routes, both interfaces, and tests.

- [ ] **Step 3: Re-run final verification**

Run: `npm.cmd run lint`

Run: `npm.cmd test`

Expected: both exit `0`.

- [ ] **Step 4: Confirm repository state**

Run: `git -c safe.directory=D:/lucky2 status --short`

Expected: clean after the Task 7 commit, or only intentional final-audit fixes remain.
