# TOPWHIZ TUR095 — actual HTTP disconnect + pg.Pool handoff (2026-11-11)

**Exact parent:** Public ftmstr/TopWhiz-Build TUR094 Draft PR #100 HEAD `8ae32532917435c8204c021f3e990ae0cd560792` with 19/19 real PR workflow SUCCESS; TUR093 PR #99 also 19/19, TUR092 PR #98 19/19. TUR095 stacks directly on TUR094, not on completed TUR093.

## New physical experiment
The test uses **real Node HTTP loopback sockets** and an **actual node-postgres pg.Pool(max=1)** over disposable local PostgreSQL16; this differs from TUR092's test-only simulated pool handoff. HTTP request A releases its DB checkout but holds its response open. B checks out the very same backend PID, runs a live `pg_sleep` SQL query. A client then physically disconnects. Negative mode: a late server close handler holding A's obsolete PID invokes `pg_cancel_backend` from a third shared-role login, cancelling B's active SQL with SQLSTATE 57014 and HTTP 503. No global pg_signal_backend grant. Sibling query completes. Positive bounded control: the test-only epoch/request/PID guard rejects A's stale close before issuing SQL cancellation and B completes with HTTP 200. Direct same-role SQL authority can bypass this application check; it is NOT an implemented production IAM boundary.

Four random restricted LOGIN roles (media reader/owner; guardian reader/owner), six authenticated PostgreSQL service connections including the pool backend; independent guardian-owner generation-2 revocation COMMIT and independent readback; no unapproved IAM grants. Actual HTTP physical disconnect **only on local Node adapter**, not real Next production or Cloudflare Worker Request.signal. No OS PID recycling or global CDN last-byte proof.

New dedicated Ubuntu 24.04 frozen CI workflow re-executes TUR092, TUR074, TUR030, TUR019, TUR018, TUR017 in disposable PG16 and release gates. Existing real vinext/workerd and Playwright Chromium mobile/desktop/a11y/SEO workflows remain unaltered. At report creation new exact-final-HEAD CI NOT RUN/NOT VERIFIED; never claim success until GitHub jobs complete.

Engineering work-package estimate 75% is NOT production readiness. Issue #22 OPEN, RELEASE NO-GO. No main merge or live Cloudflare/Neon/R2/CDN/DNS/real prices/media/content/AdSense.
