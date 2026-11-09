# TUR036 technical — 2026-11-09

Parent TUR035 Draft PR #40 exact SHA `1b9964b4ca2b500256388462f9f4de8d4460f2cb`. Its first-page 19 PR-triggered GitHub Actions were completed/success, including TUR035; push and other pages not exhaustively covered.

Added a small test of the actual Next GET proxy with synthetic in-memory upstream: four invalid IDs rejected before fetch; four malformed upstream responses (MIME, NaN length, excessive length, absent length) rejected and streams cancelled; upstream 404 retained; conditional/Range request headers not forwarded; valid synthetic response retains no-store and sandbox headers. This tests an admission boundary, **not** rights revocation after final lookup. Inherited TUR035 streaming negative, TUR034/032 real PG16 and original Queue canonical SHA suites rerun in dedicated frozen CI. No production handler or lockfile modified.

TUR018 12 synthetic interleavings / 99,276 fictional unsafe bytes and TUR019 cross-isolate bypass remain negative evidence. Real R2/CDN, global last wire byte and independent IAM: NOT_RUN/NOT_PROVEN. Issue #22 OPEN; RELEASE NO-GO. Exact final HEAD CI must be checked after last report commit.