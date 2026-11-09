# TOPWHIZ TUR032 SECURITY — FAIL CLOSED / NO-GO

**Actual application handler involved:** `handleCmsMedia` from the existing CMS Worker source, not a newly invented handler. SQL rights view is an isolated PostgreSQL test surrogate with an `approved=true` predicate, not an exact reproduction of production `cms_public_media`, R2, Neon SQL or Cloudflare runtime. The R2 bucket uses only locally generated fictional PNG; the Node HTTP listener binds 127.0.0.1.

This tests actual final-rights-lookup ordering and Response creation. It demonstrates residual delivery after revocation COMMIT, even while fresh GET and HEAD fail closed. HTTP `no-store`, verified media digest, final database lookup and a strong PG COMMIT individually do not provide global last-byte revocation.

**Security limitation / owner threat:** Owner and superuser can directly change generation/rights, bypassing SQL CAS and SECURITY DEFINER: TUR021/029/030 evidence is inherited, not solved. Independent IAM segregation, migration credential custody, audit and operator controls are NOT IMPLEMENTED. Issue #22 MUST stay OPEN. Original TUR018 12/12, 99,276 fictional unsafe bytes, and TUR019 cross-isolate counterexample remain mandatory negatives.

Receiver ACK, CDN invalidation, Cloudflare network timing, production authorized media rights and legal approval remain NOT_RUN. Fail-closed NO-GO; never represent synthetic test success as security closure.
