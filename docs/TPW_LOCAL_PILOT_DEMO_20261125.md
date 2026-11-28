# TOPWHIZ local synthetic pilot — 2026-11-25
From the repository root with Node 22 and pnpm 10.18.3, run pnpm install --frozen-lockfile, then:
```sh
node services/tpw-orchestrator/scripts/pilot-demo.mjs --out topwhiz-demo
```
Choose a new directory each time; existing directories are rejected. Open operations.html. The local state is in state/; do not share it. The JSON and HTML CLI processes reopen the same local D1 after disposal and assert matching aggregate metrics. No real feed, editor, key, GitHub write, cron registration or deployment. Official RSS and normalized manufacturer API are exercised through a strict in-process synthetic fetcher, not network requests. The fixed historical slot is injected only through local executeHourly's clock, not a remote schedule. Synthetic TPW2 is a deterministic fixture, not an actual LLM. This does not establish real Cron/Workflow end-to-end success, physical mobile Safari or a real pilot GO.
Browser acceptance:
```sh
pnpm --filter @topwhiz/web exec playwright install chromium
node services/tpw-orchestrator/ci/pilot-chromium.mjs topwhiz-demo
```
CI uploads only six named redacted report/evidence files, no database, keys or raw candidates. New exact HEAD acceptance required. Issue #22 HARD NO-GO.
