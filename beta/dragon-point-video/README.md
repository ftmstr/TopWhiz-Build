# TOPWHIZ 24 FPS video Dragon Point — DRAFT / NO-GO

Preview-only static page at `/dragon-point-video/` (under the isolated `beta/` static site). Stacked on the existing cinematic Dragon Point PR, not a new scoring method.

- The user-supplied footage is 1280x720 / 24 FPS / 15 seconds. User loads local `.webm` (alpha) or original greenscreen `.mp4` via file picker; **no binary video, private source, or redistribution license is stored in this GitHub branch**. `blob:` object URLs stay local, are revoked on replacement, and `connect-src 'none'` prevents network transfer.
- The original video supplies the only flame. The Dragon Point ring only reacts, ignites/flashes; it adds no additional stream from the mouth.
- 0–2s sleep, 2–4.85s waking, 4.85–9.85s one flame, 9.85–13s cooldown, 13–15s sleep. Ring reacts from 4.85s to 15s; count finishes at 13s, **two seconds ahead of the end**.
- The 842/1000 DP example is fictional demo data; no rating of a real device. No connection to the production scoring, ingestion, pricing or media APIs.
- Preview uses alpha WebM and local MP4 chromakey (WebGL, Canvas2D fallback), supports reduced motion and TR/EN.
- Use `node --test beta/tests/dragon-point-video.test.mjs` for timing; additional physical-device Chrome/Safari compatibility remains unverified.
- `beta/_headers` and `beta/vercel.json` permit local blob media, but retain strict noindex, no remote connections, and no third-party scripts.

Media rights, trademark clearance, physical browser tests, Issue #22, and independent Dragon Point calibration are still HARD NO-GO. No main merge, live deployment, actual phone score, or asset upload.

## 2026-11-21 compatibility and performance hardening

- Real source inspected: **1280×720 H.264, 24/1 frames per second, `duration=15.040000`**. Score must reach target at `video.duration - 2` (13.04s on this source), not at an assumed fixed 13.00s.
- Local MP4 is accepted at `loadedmetadata` so iOS Safari need not eagerly decode a frame before enabling a user-click play gesture. No autoplay; video is `muted playsinline`.
- GP(U) chromakey draws only on decoded video frames via `requestVideoFrameCallback`, with `requestAnimationFrame` for the score/ring and browsers lacking the callback. Reduce redundant texture uploads when the screen refreshes at 60 Hz but the clip is 24 fps. Rendering is display-dependent and 24 FPS cannot be promised on every mobile device.
- Actual upload must be 14.5–15.5 seconds, 16:9, at least 640×360. The browser cannot reliably verify a source video's *actual* FPS from metadata alone.
- GPU failure now creates a fresh 2D canvas (browsers cannot switch a canvas's context type in place). CPU fallback caps processing resolution and potentially frame rate; it is **degraded compatibility mode, not premium certification**.
- VP9-alpha validation checks multiple transparent corner samples of the first decoded frame. If a browser does not composite video alpha, reject this WebM and ask the user to select the original H.264 MP4, which is keyed locally. Avoid claiming that successfully decoding VP9 proves transparency.
- Media is processed locally from `blob:` URLs; no server uploads, backend calls, third-party JS or telemetry. URI revoked upon replacement/leaving page.
- Offscreen or hidden-tab playback pauses; reduced-motion mode shows the final sample score without playing the animation.

### Safari evidence and known unknowns

Apple's *Delivering Video Content for Safari* documents `playsinline` and `preload="metadata"` behavior:
https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari

WebKit shipped `HTMLVideoElement.requestVideoFrameCallback` in Safari 15.4:
https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/

WebKit bug #275908, VP9 with transparency playing with a gray background, is **NEW / unresolved in the live Bugzilla status (last modified 2026-10-28)**. Its comments reference a proposed WebKit PR but do not establish a release fix. Target iPhone/macOS Safari must be physically tested; never claim that VP9-alpha playback is proven:
https://bugs.webkit.org/show_bug.cgi?id=275908

Apple provides HEVC with Alpha support in Safari / Apple devices:
https://developer.apple.com/videos/play/wwdc2019/506/
An actual HEVC-alpha asset is **not** created or distributed here; it requires approved export/tool rights and physical-device validation.

**NOT VERIFIED:** hardware iPhone Safari, macOS Safari, video hardware decoder use, sustained battery/temperature, real 24fps under thermally constrained Android, HEVC-alpha playback, actual published server headers. Android Chromium and desktop Chromium observations for the user-supplied local media are from earlier standalone preview work; this PR has its own synthetic browser CI and must be evaluated at the exact final HEAD.

### Acceptance / release boundaries

CI creates a 15-second green-screen MP4 *synthetically* with FFmpeg only during CI; it is **not a third-party clip, user footage, or a device benchmark**. All production scoring gates stay locked (Issue #22 OPEN, Dragon Point evidence/calibration unresolved). Keep Draft. Never merge to main, deploy to public CDN, publish real-device scores, or commit user-supplied video without independent rights approval.

### 2026-11-21 WebKit decoded-frame delivery hardening

WebKit Bug #284039 records inconsistent `requestVideoFrameCallback` delivery / frame-perfect synchronization concerns:
https://bugs.webkit.org/show_bug.cgi?id=284039

The new preview watches for a **260ms** decoded-callback stall and rescues the transparent-keyed Canvas at no faster than once per **110ms**, without generating an additional flame from the dragon. It never claims this restores lost source frames or perfectly matches video hardware display. Synthetic Playwright test stubs the callback so it never runs, then checks the RAF rescue paints and the deterministic counter still completes.

Safari alpha support remains **unverified**; the H.264 greenscreen source processed locally is the fallback. Apple HEVC-alpha is a possible future source only after rights/export validation. No new user media is committed.

### 2026-11-21 desktop alignment and pixel QA — synthetic CI + local visual inspection

**Newly measured defect (prior CSS):** On a 1365 CSS-pixel desktop viewport, the `beta` stage content area is approximately 1210px wide; the inherited `height:clamp(280px,35vw,450px)` caps it at 450px. The dragon container was only `width:74%`. An uncropped 1280×720 source therefore fits to about **800×450**, ending around stage-local x=800. The 244px Dragon Point ring with `right:4%` begins around stage-local x=918: the source flame can never reach the circle.

**Actual local source pixel inspection, not committed media:** The owner's original 1280×720, 24 FPS video was sampled at approximately t=7s; bright fire extends roughly source x=651–1279. In a simple explicit warm-fire segmentation (r>170, g>75, r>0.95g, g>1.15b, x>650), baseline source-pixel to circular score mask overlap was **zero**. After changing to `width:100%` with `height:clamp(370px,50vw,600px)`, the same source frame on a 1210×600 stage has approx **37,136** flame source pixels inside the projected ring. This indicates geometric fire-to-ring contact without horizontal distortion or cropping. Local headless Chromium layout check at 1365×940 confirmed a 1210×600 stage and 244px ring. This local source-frame preview is evidence of still-frame placement, **not** proof of continuous in-device 24 FPS performance.

**Independent CI fixture:** An *original synthetic*, license-free 1280×720 / 24 FPS / 15s H.264 clip is generated in CI only, with flat green background, red dragon-body surrogate, orange flame stripe, cream flame core, and intentionally contaminated green fringe. No user media or derived WebM is committed to GitHub.

New real Chromium Playwright tests now sample GPU framebuffer or 2D Canvas keyed pixels directly:
- green backdrop → nearly transparent (alpha < 35);
- red surrogate / orange flame / cream core → near-opaque (alpha > 215);
- mixed-green edge → partial alpha (20 < alpha < 240), green component corrected to within 40 of max(red, blue);
- desktop 1365px geometry → synthetic flame core projected *inside* the score ring and entire video uncropped, with actual Chromium screenshot and JSON pixel evidence attached as ephemeral CI artifacts;
- mobile 390px matte and overflow; GPU-vs-Canvas RGB/alpha parity under broad tolerances;
- when WebGL is unavailable, GPU tests report **NOT_RUN/skipped**, and still validate the CPU fallback / desktop overlay. Never label an unavailable GPU as PASS.

**Release limits:** The fixture is a flat synthetic surrogate, not a real dragon/particle/performance benchmark. Real user video chroma edges, desktop GPU, hardware Safari/Android thermals and 24 FPS playback quality still require independent physical device acceptance. Existing Issue #22, license, trademark, and Dragon Point calibration HARD NO-GO unchanged.
