# TUR035 — Technical evidence (2026-11-09)

Parent: TUR034 #39, exact HEAD `ab5f45c76c2d67f1a88dcd4d22cb158db7816b5d`. Its 19 visible pull_request workflow runs were completed/success; this connector returns only the first page and excludes push, so exhaustive CI was NOT established.

Added `tur035-next-stream-abort-negative.test.ts` importing the **actual Next App Route GET**. An isolated fictional 32-byte upstream stream returns the first 16 bytes before a simulated rights withdrawal and another 16 after. A fresh GET is denied; local ReadableStream cancellation is observed but does not establish global cancellation. No application production code, pnpm lock or actual content changed. New frozen workflow runs this case plus inherited actual CMS+Next PG16, PostgreSQL owner/ACL, original Queue SHA/route, recovery, typecheck and legal gates. Existing separate workerd/Chromium workflows must also pass on exact final HEAD.

This new test has no real PostgreSQL COMMIT; inherited TUR034 test covers disposable PG16. The simulated withdrawal is **not** an independent durable revocation, and test proves neither actual network byte timing nor Cloudflare R2/CDN cache behavior. TUR018 12 scenarios / 99,276 fictional unsafe bytes and TUR019 cross-isolate bypass remain release blockers. Issue #22 OPEN; RELEASE NO-GO.
