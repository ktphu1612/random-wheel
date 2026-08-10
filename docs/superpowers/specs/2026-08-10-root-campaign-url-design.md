# Root Campaign URL Design

## Goal

Change participant URLs from `/vong-quay/<slug>` to `/<slug>` while preserving existing shared links through a permanent redirect.

## Routing

- Move the participant page and client experience to `app/[slug]`.
- Keep `app/vong-quay/[slug]/page.tsx` as a minimal `permanentRedirect()` to `/<slug>`.
- Keep `/`, `/admin`, and `/api/*` unchanged; Next routing gives these static routes priority over `[slug]`.
- Do not duplicate participant rendering between the old and new routes.

## URL Generation

- Landing-page demo links use `/mua-he-may-man`.
- Admin open/copy links use `/${campaign.slug}`.
- Campaign APIs continue returning the existing `slug`; no database migration is required.

## Reserved Slugs

New campaigns must not receive root segments used by the application. If slugification produces `admin` or `api`, prefix it with `vong-quay-` before checking uniqueness.

Existing campaign slugs and stored spin/device data remain unchanged.

## Verification

- Contract tests confirm the participant files live under `app/[slug]`.
- Contract tests confirm the old route uses `permanentRedirect()`.
- Tests confirm product links no longer contain `/vong-quay/`.
- Tests confirm reserved slug handling exists.
- Run lint, full build/tests, then deploy and verify both the new URL and old redirect on Cloudflare.
