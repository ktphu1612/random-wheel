# Root Campaign URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve campaign participant pages at `/<slug>` and permanently redirect legacy `/vong-quay/<slug>` links.

**Architecture:** Move the participant page and client component to a root dynamic route. Retain a minimal legacy page that issues a 308 redirect, update every generated product link, and reserve root segments used by static application routes.

**Tech Stack:** Next/vinext, React 19, TypeScript, Node `node:test`, Cloudflare Workers.

## Global Constraints

- Existing `/vong-quay/<slug>` links must redirect permanently to `/<slug>`.
- `/`, `/admin`, and `/api/*` must remain unchanged.
- New campaigns must not receive `admin` or `api` as a slug.
- Campaign data, devices, spins, and APIs require no migration.
- Do not add dependencies or middleware.

---

### Task 1: Move Campaign Pages to the Root Route

**Files:**
- Create: `app/[slug]/page.tsx`
- Create: `app/[slug]/wheel-experience.tsx`
- Modify: `app/vong-quay/[slug]/page.tsx`
- Delete: `app/vong-quay/[slug]/wheel-experience.tsx`
- Modify: `app/page.tsx`
- Modify: `app/admin/admin-dashboard.tsx`
- Modify: `app/api/admin/campaigns/route.ts`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Produces: participant page `GET /<slug>`.
- Produces: permanent redirect `GET /vong-quay/<slug>` to `/<slug>`.
- Preserves: public/admin API paths and campaign `slug` values.

- [ ] **Step 1: Write the failing route contract test**

Update participant file reads in the first rendered-surface test:

```js
readFile(new URL("app/[slug]/wheel-experience.tsx", root), "utf8"),
readFile(new URL("app/[slug]/page.tsx", root), "utf8"),
```

Add this focused contract:

```js
test("serves campaigns at root and redirects legacy URLs", async () => {
  const [home, admin, legacyPage, createRoute] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/admin/admin-dashboard.tsx", root), "utf8"),
    readFile(new URL("app/vong-quay/[slug]/page.tsx", root), "utf8"),
    readFile(new URL("app/api/admin/campaigns/route.ts", root), "utf8"),
  ]);
  assert.doesNotMatch(`${home}${admin}`, /\/vong-quay\//);
  assert.match(legacyPage, /permanentRedirect/);
  assert.match(legacyPage, /`\/\$\{slug\}`/);
  assert.match(createRoute, /RESERVED_SLUGS/);
  assert.match(createRoute, /"admin", "api"/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --experimental-strip-types --test --test-name-pattern "root and redirects" tests/rendered-html.test.mjs
```

Expected: FAIL because the root participant files and redirect do not exist and product links still contain `/vong-quay/`.

- [ ] **Step 3: Move the participant implementation**

Move the existing participant files without duplicating them:

```powershell
New-Item -ItemType Directory -Force -LiteralPath "app/[slug]"
Move-Item -LiteralPath "app/vong-quay/[slug]/page.tsx" -Destination "app/[slug]/page.tsx"
Move-Item -LiteralPath "app/vong-quay/[slug]/wheel-experience.tsx" -Destination "app/[slug]/wheel-experience.tsx"
```

- [ ] **Step 4: Add the minimal permanent legacy redirect**

Create `app/vong-quay/[slug]/page.tsx`:

```tsx
import { permanentRedirect } from "next/navigation";

export default async function LegacyWheelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/${slug}`);
}
```

- [ ] **Step 5: Update generated links and reserve static route names**

Change landing and admin links from `/vong-quay/${slug}` to `/${slug}` and the demo link to `/mua-he-may-man`.

In `app/api/admin/campaigns/route.ts`, add:

```ts
const RESERVED_SLUGS = new Set(["admin", "api"]);
```

Immediately after generating the slug, add:

```ts
if (RESERVED_SLUGS.has(slug)) slug = `vong-quay-${slug}`;
```

Keep the existing database uniqueness check after this guard.

- [ ] **Step 6: Run focused and full verification**

Run:

```powershell
node --experimental-strip-types --test tests/rendered-html.test.mjs
npm.cmd run lint
npm.cmd test
```

Expected: all tests pass, lint exits `0`, and the build lists both `/:slug` and `/vong-quay/:slug`.

- [ ] **Step 7: Commit**

```powershell
git add app tests/rendered-html.test.mjs
git commit -m "feat: serve campaigns at root URLs"
```

---

### Task 2: Integrate, Publish, and Verify the New URLs

**Files:**
- Verify only; rebuild generated `dist/` without committing it.

**Interfaces:**
- Consumes: the validated `feature/root-campaign-url` commit and production Worker configuration in `vite.config.ts`.
- Produces: deployed root campaign URLs with working legacy redirects.

- [ ] **Step 1: Merge the validated feature branch into main**

From `D:\lucky2`:

```powershell
git merge --ff-only feature/root-campaign-url
npm.cmd test
git worktree remove D:\lucky2\.worktrees\root-campaign-url
git worktree prune
git branch -d feature/root-campaign-url
```

Expected: `main` contains the route commit, the merged test suite passes, and the feature branch is removed after its worktree is cleaned.

- [ ] **Step 2: Push main to GitHub**

```powershell
git push origin main
```

Expected: GitHub `main` points to the new route commit.

- [ ] **Step 3: Deploy the generated Worker build**

```powershell
npm.cmd run build
.\node_modules\.bin\wrangler.cmd deploy --config dist/server/wrangler.json
```

Expected: Cloudflare reports a successful deployment for `quay-vui`.

- [ ] **Step 4: Verify production behavior**

Check:

```powershell
Invoke-WebRequest -UseBasicParsing "https://quay-vui.thienphutl2005.workers.dev/mua-he-may-man"
Invoke-WebRequest -UseBasicParsing -MaximumRedirection 0 "https://quay-vui.thienphutl2005.workers.dev/vong-quay/mua-he-may-man"
```

Expected: the new URL returns `200`; the legacy URL returns `308` with `Location: /mua-he-may-man`.

- [ ] **Step 5: Confirm clean repository state**

```powershell
git status --short
```

Expected: no tracked changes.
