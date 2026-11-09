# TUR037 Technical

Base: TUR036 exact HEAD `e128447a461d04d3c35c6289ba47561874fffd61` (19 visible PR workflows SUCCESS, first-page PR-only limitation). Adds a regression exercising actual Next media GET: eight invalid CMS API origins are rejected without a fetch; valid origin with thrown transport, upstream 302 and upstream 500 fail closed. The mock fetch is local, not Cloudflare. Inherited PG16, outbox and frozen checks are wired into a dedicated workflow. No production code change. Exact final report commit CI acceptance must be checked independently.
