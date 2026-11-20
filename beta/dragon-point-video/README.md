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
