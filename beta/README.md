# TOPWHIZ — Standalone Static Beta

This folder is an **isolated static HTML/CSS/JS demo** of the TOPWHIZ interface. It is not the production Next.js / Cloudflare application and does not execute the media, rights, CMS, database, Queue, R2, content, advertising, or pricing APIs. It exists to provide a **usable, shareable interactive UI preview** while Issue #22 and brand/license checks remain open.

## What works
- Responsive Turkish home page, original `TopWhiz_Logo_02_KirmiziSariMavi.png` artwork (same existing Git blob reused, no third-party image)
- Search, category filtering, device selection and side-by-side feature comparison
- Clear persistent **DEMO / FICTIONAL** labels; 8 entirely fictional devices
- No external requests, third-party scripts, tracking pixels, login, checkout or personal data collection
- No SEO indexing, no merchant/affiliate redirects and no live CMS data

## Deployment — separate and isolated
**Do not deploy the root Next.js app, workers, CMS or R2 from this branch.** In Vercel, import GitHub `ftmstr/TopWhiz-Build`, choose branch `release/topwhiz-static-beta-preview-20261113`, set **Root Directory = `beta`**, **Framework Preset = Other** and use the static `index.html` directly, with no npm install/build command or secret environment variables. Deploy only the `beta` folder. Inspect the deployment preview URL and security headers before sharing. No custom domain, DNS, analytics or indexability yet.

Alternative: Cloudflare Pages static site with output directory `beta`, no build command, deploying **only** these files. Do **not** create a Cloudflare Worker, route a request to R2 or deploy inherited application services. Platform setup and deployment require explicit user account connection/action; this repository change itself does **not** deploy.

## Validation
From repo root: `node --check beta/assets/site.js && node --test beta/tests/static-beta.test.mjs`.
Live browser mobile/desktop visual QA and the actual hosting HTTP response are **not yet verified** until a hosting provider is connected. Test static hosting with /, /assets/site.js, /assets/site.css and /assets/topwhiz-logo.png, and verify CSP, X-Robots-Tag and robots.txt.

## Release separation
This is a **static beta demonstration**, never a commercial release, production CMS or evidence that Issue #22 was resolved. Do not merge the existing stacked PR chain to main just to host this demo. Existing TOR/legal, TOPWHIZ–TOPWIZ mark clearance, AGPL/LGPL, third-party data rights, independent IAM, and distributed revocation remain unresolved. No real prices, device claims, published articles, ads or external user traffic guarantees.
