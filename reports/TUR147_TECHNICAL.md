# TUR147 technical — 2026-11-13

Base: TUR146 738c94c30e859d7eca2825f2c45430d885c53754. New isolated Node22 localhost HTTP/2 test compares an intentionally unsafe cached pre-revocation permit with an authority-outage fail-closed gate. Both streams receive HEAD before simulated outage; after outage, unsafe receives TAIL while guarded receives no further payload. Independent /health request must succeed. This is a regression/negative counterexample, not a production patch or distributed final-byte proof.

Acceptance: local test and exact-final-HEAD GitHub Actions workflow/job conclusions must be independently checked. Do not claim PASS before CI. No main merge or live deployment. Issue #22 remains OPEN and release NO-GO.
