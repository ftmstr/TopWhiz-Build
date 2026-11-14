# TOPWHIZ Dragon Point — signature cinematic (visual-only release)

**Source of truth:** the official existing branded image at `apps/web/public/brand/TopWhiz_Logo_02_KirmiziSariMavi.png`. No substituted character artwork, third-party media, external audio, video or WebGL.

## User experience

1. **Sleep** (initial idle): original official dragon logo breathes slightly and shows drifting sleep marks.
2. **Wake** (+360 ms): sigil brightens, logo leans forward, sleep marks vanish.
3. **Fire** (+1080 ms through +3330 ms): inline 3-layer SVG fire extends toward the branded scoring board. A light impact ring and gentle glow respond. A numeric score ramps with an eased curve over 2250 ms, with updates throttled to approximately 30 Hz.
4. **Cooldown** (+3440 ms): flame fades, counters settle at the exact admitted target.
5. **Asleep** (+4340 ms): dragon returns to original position; score stays visible; demo gains an explicit replay button.

All time points are illustrative UI choreography, not benchmark/test timings. Visual effects rely primarily on CSS opacity and transforms (composited where supported). Only the counter uses a short-lived requestAnimationFrame. No polling, animation libraries, embedded streaming assets, third-party CDNs, sound or analytics were added.

### Responsive, accessibility and low power
- Physical Chromium acceptance at 1440, 390 and 360 CSS pixels, plus browser preference `prefers-reduced-motion: reduce`.
- On mobile, move the dragon above the scoreboard and rotate/scale the SVG flame toward it; hide some sparks on the narrowest layout; clip decorative overflow to avoid horizontal scroll.
- Reduced motion shows the final **demo** number immediately with no fire or transitions.
- Keyboard-operable **Animasyonu yeniden izle** control only in demo mode.
- Animated intermediate numbers are visually hidden from screen readers; an aria-live completion message is announced once.
- IntersectionObserver starts scene when visible; decorative idle animations pause offscreen, and hidden-tab transitions finish without burning a JS loop.
- Official logo is decorative in the widget because its accessible title is already represented by DRAGON POINT text. It is referenced from the existing brand folder, not newly generated.

## Required security distinction

**Real phones:** `DragonPointCard` is a server component. It uses `presentDragonPoint(score)` in the existing release gate before passing any numeric result to `DragonPointCinematic` with `mode="real"`. With current unreleased 1.0.1-draft, public numeric totals are always withheld. Real phone pages show `Veri bekleniyor` and do not simulate a fire-to-score sequence.

**Demo only:** the explicit methodology route `/dragon-point` passes `mode="demo"` and **842** as a fully synthetic UI example. The example is conspicuously labeled `KURGUSAL ANİMASYON DEMOSU`, `Yalnızca görsel efekt önizlemesi`, and `Gerçek telefon puanı değildir`. It cannot be used as a real benchmark claim, ranking, or license attestation.

Current Issue #22 remains HARD NO-GO. No domain, main merge, Cloudflare, CMS writes, R2 rights, product pricing, authentic benchmark ingest or advertising changes are authorized by this feature.

## Test evidence

- `pnpm --filter @topwhiz/web typecheck`
- `node --test packages/dragon-point/tests/*.test.mjs`
- `pnpm --filter @topwhiz/web exec playwright test --config=dragon-cinematic.playwright.config.ts` against **real Next.js HTTP/Chromium**, not a synthetic DOM mock.
- Workflow `.github/workflows/dragon-point-cinematic.yml` also retains real browser screenshots of the fire and sleeping score states for desktop and two mobile widths. Inert/reduced-motion flows and unexpected remote requests are included in tests.

**Release criteria:** a compelling animation is not a calibrated Dragon Point method. The 25 missing metric calibrations, 12 provisional anchors, independent source rights review, and Issue #22 still block real rankings.
