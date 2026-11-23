# TOPWHIZ — TPW1/TPW2/TPW3 Cloudflare Workers phase A
Date: 2026-11-23. DRAFT / CI-ONLY / HARD NO-GO.
Design input: TOPWHIZ_Cloudflare_Workers_TPW_Otonom_Yayin_Mimarisi_20261123.md.
GitHub base: feat/dragon-point-video-local-preview-20261121, Draft PR #164.
Issue #22 remains OPEN.

## Event architecture
TPW1 UTC 00: official source metadata, link/permission preflight, duplicates rejected before GitHub.
TPW3 UTC 20: exact model/SKU/market device atlas. Non-news-worthy verified specs are retained as atlas candidates.
TPW2 UTC 40: source-bound editor proposes TR and EN original article and review metadata. Unknown rights, uncorroborated news, invalid sources, non-matching variant, missing language or media all fail closed.
D1 staging: temporary metadata only, dedupe, TTL (not cryptographic erasure).
GitHub: narrow installation token for approved-only files in a future separately verified private content repository. Public code and production deploy branches cannot receive raw candidates.
Workers: scheduled handler and WorkflowEntrypoint implementation are present, but checked-in Cloudflare Cron configuration is DISABLED.
GitHub Actions: synthetic checks, approved content schema, read-only/no-deploy gates.

## Operational and security limits
The agents' actual feeds, model API, GitHub App installation, private content repository and Cloudflare D1 are NOT configured. No autonomous collection/publishing is running on Cloudflare. Existing ChatGPT TWA hourly tasks were NOT changed or duplicated. AI can self-assert a false fact, publisher or rights claim; independent trust roots are required before any public publication. This CI validates structure, not legal source rights, factual truth, or media withdrawal.
Existing PostgreSQL16 IAM and rights tests remain in place; D1 does not replace them automatically.
Cloudflare R2/CDN real revocation, physical Safari/Android, trademark, third-party media licenses and Dragon Point 37-metric calibration remain blocked. DO NOT merge to main, deploy preview/live, connect real content, enable real images or AdSense.

## Acceptance
Phase A: local Node.js tests and real GitHub Actions at exact new PR HEAD. Phase B: independently reviewed workerd test, D1 migration, legally verified feeds, editorial attestations, private GitHub App, rollback/revocation handling. Phase C: only after all HARD NO-GO gates independently close and user explicitly approves.

Cloudflare Cron: https://developers.cloudflare.com/workers/configuration/cron-triggers/
Cloudflare Workflows: https://developers.cloudflare.com/workflows/get-started/guide/
Cloudflare vinext: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
GitHub App tokens: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
Issue #22: https://github.com/ftmstr/TopWhiz-Build/issues/22
