# TOPWHIZ — Brand system and web experience (TUR002)

Status: **design and prelaunch demo only** · 2026-11-07

## User-selected primary logo

- Exact source file: \`TopWhiz_Logo_02_KirmiziSariMavi.png\`
- Source: Google Drive / Uygulama / TopWhiz / Logo, supplied and selected by project owner.
- Repository asset: \`apps/web/public/brand/TopWhiz_Logo_02_KirmiziSariMavi.png\`.
- 1254 × 1254 RGB PNG (original bytes preserved, not recomposed).
- Artwork: central technological dragon wearing blue visor and headphones, red/amber circular trails, blue digital globe, hardware devices, metallic TOP above and gold WHIZ below.
- Do not replace the logo with TW monogram or another variant as the primary mark without a new explicit decision.

## Palette — practical UI values sampled/adapted from the logo

| Role | Hex | Primary usage |
| --- | --- | --- |
| Canvas | \`#070B16\` | Dark surface that blends with source artwork |
| Surface | \`#101827\` | Cards and navigation |
| Primary action / red | \`#F32936\` | CTAs, states, focal highlights |
| Gold accent | \`#FFC629\` | Key text and small highlights |
| Tech blue | \`#128AE9\` | Technical affordances, compare motif |
| Main text | \`#F6F8FF\` | Foreground |
| Muted text | \`#A3AEC2\` | Supporting information |
| Border | \`#293349\` | Separators and outlines |

The exact color swatches are UI design tokens, not claims that these HEX codes are metadata embedded in the logo file.

## UI principles

1. Strong visual identity without filling the entire UI in saturated red/yellow/blue.
2. Dark-first, responsive, text-first information hierarchy; source logo is present in the navigation and hero.
3. Turkish first. English localization reserved for a later stage.
4. Clear synthetic-fixture and rights notices, no misleading actual device specifications or fabricated live price feeds.
5. Keyboard focus indicators, skip link, motion-reduction support, semantic landmarks and filtering labels.
6. Catalog search, category filters, and interactive side-by-side comparison form a first reviewable journey.
7. Never publish production pages or third-party assets until data rights, branding and accessibility acceptance gates pass.

## Next decisions after review

- Optimize a separate small web delivery derivative of the logo while preserving original PNG in source history.
- Audit color contrast (WCAG), 320px mobile layout, keyboard and screen-reader behavior using real browser evidence.
- Decide favicon/mobile splash usage: logo is detailed, so a dedicated simplified small-size icon may be necessary. Keep the original as the primary identity.
- Add actual source-backed devices through staged ingestion and approved license/permissions. No fake benchmark or price values.
- Confirm trademark TOPWHIZ/TOPWIZ clearance independently before launch; private preview is not a trademark clearance.
- When adding cloud previews, ensure authentication and no-index settings, never expose licensed staging data.

## Scope

This PR implements a Next.js web demo for design review. It does not implement the mobile app, API, PostgreSQL, background AI crawling, news or production device records. Repo main remains unchanged until reviewed.
