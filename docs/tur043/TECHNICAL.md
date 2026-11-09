# TUR043 Technical

Base: TUR042 PR #47 HEAD b76463e2001e4e07e1ab1febb30b53c4c82da1a5. Strict CI-only PG URL scheme, localhost, default port, no query/hash; reject malformed URLs before app entry. Seven synthetic negative cases. Inherited TUR041 real Next HTTP and disposable PG16 checks remain required. No production change. Final CI must be independently checked on report HEAD.
