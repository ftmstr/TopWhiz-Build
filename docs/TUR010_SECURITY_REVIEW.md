# TOPWHIZ TUR010 — Security, Accessibility and Release Gate Assessment
Date: 2026-11-08. DRAFT ONLY. No real Cloudflare resources provisioned.

## Threat/control/verification matrix

| Threat | Concrete defense | Evidence / residual risk |
| --- | --- | --- |
| React Server Components peer mismatch or drifting install | Exact React/React DOM/RSC 19.3.1 and @vitejs/plugin-rsc 0.5.39 pins, pnpm-lock.yaml, frozen install, Next + vinext builds | CI freeze/build success. Supply-chain advisory/license scanning and real workerd vinext runtime remain open. |
| Browser preview accidentally indexed | X-Robots-Tag noindex/noarchive on all Next responses, noindex metadata and robots.txt Disallow:/ | Chromium/HTTP tests. Must REMOVE/replace these only AFTER approved public launch and SEO policy review. |
| Mobile decorative hero causes overflow | Overflow clipped in narrow viewport, editorial nav shown on mobile, accessible skip link to main | Playwright checks 390px width and keyboard/semantic landmarks. Manual accessibility still needed. |
| Ad layout might auto-load AdSense | Upper/right/bottom labelled nonclickable placeholders with no adsbygoogle code or publisher ID | Playwright and dependency gate tests; AdSense/consent still not configured. |
| CMS auto signer swaps a valid evidence signature post-publication | Immutable publication dependency compares original issuer key AND exact signature bytes; public view denies mismatch; reconciler withdraws with outbox | Isolated PostgreSQL key rotation, issuer revoked, evidence status revoked and exact-signature replacement tests. Global CDN purge not exercised. |
| Role confusion / reader granted data access | Eight different randomly credentialed PostgreSQL LOGIN sessions, negative cross-role SQL assertions, NoLOGIN group model | CI-only temporary role sessions; production membership, row security and secret vault not set up. |
| DLQ poison message claims operator approval | Ignore message-provided approval, require independent operator callback/ticket and audit-before-send; keep failed events unACKed | Unit and PostgreSQL receipt tests for forged approval, failed audit, active lease and duplicates; actual Cloudflare DLQ/monitoring not configured. |
| Workerd accidentally connects to production resources | Explicit wrangler dev --local on localhost, no bindings/secret vars; API fails closed for missing DB/R2 | Actual Worker process and read-only response tests. Workerd/Miniflare is not a hardened sandbox; only trusted repository code tested in ephemeral CI. |
| R2 image malicious/tampered | Original synthetic full PNG structures, CRC and SHA-256, length and MIME checks before serving; Chromium decodes image | No real R2 bucket/object, image AV/EXIF stripping or full production image decoder pipeline. |
| A11y/SEO claim overstated | axe automated WCAG 2A/AA/2.1 tags, serious/critical assertions, noindex and mobile tests | Not WCAG certification or manual assistive technology review; color contrast for all interactions still open. |

## Runtime interpretation

The two separate claims are:
(A) Worker local workerd execution of read-only API without real bindings,
(B) local Node/Vite vinext RSC production build. Do NOT combine them into an
unverified claim that Next.js/vinext pages have been served by Cloudflare
workerd; a future isolated adapter is required. Wrangler 4.135.0 only
supports a local worker compatibility date as recent as 2026-09-25 in this
CI. This date is pinned for reproducible local behavior, not production
runtime currency. Upgrading the Worker runtime requires a controlled new
wrangler lockfile and rerun of all tests.

## Review/approval gates (all OPEN)

Source rights; issuer private signing/rotation/revocation; actual DB role
memberships; Cache API zone invalidation; Cloudflare local and real isolated
workerd binding; access-controlled private preview; adversarial content
moderation/editorial QA; image decode/AV/metadata stripping; performance,
cross-browser/mobile assistive tech and human design acceptance; trademark
TOPWHIZ/TOPWIZ, AGPL/legal, regional privacy and Google AdSense approval.

This PR has no live integration, real prices or merchant partnerships,
production user data, domain changes, public launch or merge to main.
