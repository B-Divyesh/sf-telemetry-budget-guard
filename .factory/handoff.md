# Telemetry Budget Guard — repair 2 handoff

## Outcome

Strict review findings F1–F6 are fixed and verified. The current live product at <https://telemetry-budget-guard.sociobot.in/> is the static build from candidate `3d32a878c236b09c249f49dc311424a0fffd03a8`.

- Product implementation SHA: `54cc8b9` (`fix: cache first-visit modules for offline reload`).
- Verification-tooling SHA: `3d32a87` (`test: isolate browser builds from release artifacts`). This changes only the browser test build directory.
- Final deployment: Azure Static Web Apps deployment `a88095c7-aba5-4cff-9c1d-4a16db5a8002`, completed successfully on 2026-09-06 UTC.
- The handoff update after that candidate is documentation-only and does not require a new product image.

## What changed

- Added `.factory/claims.json` with 21 public claims. Each claim has one unique `@claim:<id>` outcome test and one runnable command.
- Added `telemetry-budget-guard demo`. It runs a bundled checkout-service OTLP sample with real Collector YAML and budget inputs in a temporary directory.
- Included the demo inputs and integration tests in the Cargo package. A clean consumer can install the crate and run the demo without repository files.
- Added `/demo/` with populated output, a persistent sample-data banner, full reset, and a **Start for real** path.
- Kept demo edits in page memory. Existing browser storage is not read, overwritten, or copied into demo state.
- Rewrote the first screen to name the job, audience, and first action in plain words. All three product facts fit before scrolling at 1440×1000 and 390×844.
- Added literal section headings and `.factory/copy-audit.md`. No landing sentence exceeds 22 words or uses a banned marketing term.
- Added per-route canonical, Open Graph, Twitter, touch-icon, title, and description metadata.
- Added a product-styled 404 response, shared navigation/footer structure, `/demo/` and `/404.html` sitemap entries, and correct Static Web Apps 404 handling.
- Raised all tested interactive targets to at least 44×44 CSS pixels, including the mobile wordmark and terms link.
- Fixed the browser estimate when both baseline and proposed samples contain zero metric series.
- Made first-visit offline reload exact: the service worker discovers built assets, precaches them, handles `Vary` safely, and removes old caches.
- Removed the unsupported release-archive promise. The normal build still stages the Linux binary in `dist/site/download/`.
- Added the share image and touch icon. Their derivation and provenance are recorded in `.factory/design.md`.
- Updated README setup, demo, supported inputs, exact bounds, privacy behavior, claim commands, build, package, and deployment instructions.

## Review finding disposition

| Finding | Disposition and evidence |
| --- | --- |
| F1 — 21 untested claims | Fixed. All 21 claims are registered and passed their individual commands from a clean checkout. Registry coverage rejects duplicate, missing, or extra tags. |
| F2 — missing CLI sample sandbox | Fixed. The installed binary runs `demo`; `/demo/` opens in one click, shows a realistic failure, keeps the label visible, resets all fields, and leaves a seeded real-data key unchanged. |
| F3 — unclear first screen | Fixed. H1 is “Check OpenTelemetry changes against your budget.” The next sentence names engineers adding OpenTelemetry to a small service. The sample action and result note are adjacent. |
| F4 — routes, metadata, and structure | Fixed. Root, demo, privacy, terms, and designed 404 routes have distinct titles, canonical/share metadata, shared header/footer, one H1, and a main landmark. |
| F5 — installed sample unavailable | Fixed. Cargo packages four bundled sample inputs. A fresh offline package install runs `telemetry-budget-guard demo`. `CHANGELOG.md` is present. |
| F6 — undersized legal link | Fixed. Every visible link, button, input, and textarea on all routes measured at least 44×44 CSS pixels at 320 px width. |

Earlier verification items remain fixed: HTTPS is valid, security headers and immutable hashed-asset caching are live, and skip links focus `main` on every route. The previous generic 404 is replaced by a designed page that retains HTTP 404 for unknown routes.

## Clean verification

Fresh clone: `/tmp/tbg-clean-verify.iep3ZZ` at `3d32a878c236b09c249f49dc311424a0fffd03a8`.

```sh
npm ci
npm test
npm run lint
npm run build
test -x dist/site/download/telemetry-budget-guard-linux-x86_64
npm run package:cli
```

Results:

- `npm ci`: passed; 22 packages installed and 0 vulnerabilities reported.
- `npm test`: passed; 4 Rust unit tests, 2 Rust CLI integration tests, and 33 site/browser tests.
- `npm run lint`: passed; TypeScript, rustfmt, and Clippy with warnings denied.
- `npm run build`: passed; `dist/site/` contains every route and the Linux x86_64 binary.
- Initial site payload: 5.82 KB JavaScript uncompressed, 2.61 KB JavaScript gzip, 13.23 KB CSS uncompressed, 3.91 KB CSS gzip, no webfonts, and a 42.64 KB phone image.
- `npm run package:cli`: passed; 12 files, 69.3 KiB unpacked and 18.4 KiB compressed.
- Clean consumer claim: passed; the packaged crate installed one binary offline into a new Cargo root and its bundled demo ran outside the repository.
- All 21 commands in `.factory/claims.json`: passed individually from the clean checkout.
- Normal, expected budget failure, malformed input, zero-window boundary, sample size/count limits, sensitive opt-in, unsupported processor, and recovery paths passed.

## Live verification

- All 18 served files checked, including HTML routes, hashed JS/CSS, images, service worker, metadata files, and the staged binary, byte-match the clean build.
- Factory `verify-url.sh`: passed with HTTPS 200, correct title and language, one H1, a main landmark, alt text, labelled buttons, and no console errors.
- Fresh desktop 1440×1000 and phone 390×844 contexts: job, audience, action, and three facts appear before scrolling.
- The live one-click demo starts at a populated `FAIL`, changes to `PASS`, resets every field, preserves unrelated storage, and keeps its demo banner visible.
- Keyboard skip focus, invalid-input focus, recovery, reduced motion, 200% text sizing, and 320 px layout/touch targets passed.
- Playwright axe across all five routes: 0 serious or critical findings. The complete route scans reported no violations.
- Privacy: all page requests were same-origin; there were no cookies, third-party scripts/fonts, analytics, uploads, or console errors.
- Offline: a fresh phone context loaded `/demo/` once, then reloaded it offline with HTTP 200 and populated output.
- Unknown path: deliberate HTTP 404 with the designed recovery page. All internal and external links checked returned 200.
- Response headers: self-only CSP, denied camera/microphone/geolocation permissions, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`. Hashed assets use one-year immutable caching.
- Lighthouse 13.4.1 mobile report: Performance 100, Accessibility 100, Best Practices 100, SEO 100; FCP 0.824 s, LCP 0.824 s, TBT 0 ms, CLS 0.

Lighthouse wrote the complete report with no run warnings, then its Chromium tab crashed during teardown. Independent Playwright checks and the factory verifier completed without page or console errors. Evidence is under `/work/.evidence/repair-2-live/`.

The catalog description is 98 characters, verb-first, and copied to `/work/.evidence/catalog-description.txt`. The researched product is free, so no billing offer or registration is applicable.

## Known limits

- OTTL expressions, tail-sampling policies, and arbitrary vendor processors are not modeled in v0.1. Active unsupported processors are named and treated as volume-neutral.
- Estimates depend on a representative sample and configured assumptions. Teams should compare estimates with measured usage across releases.
- The browser page is a compact preview. The native CLI is authoritative for full OTLP envelopes and Collector YAML.
- The staged binary targets Linux x86_64. Multi-platform signed archives and checksums remain release-automation work and are not advertised.

No backend, tenant state, database, payment, or external model integration exists. Backend isolation, restart persistence, health, 429/Retry-After, billing registration, and AI gateway checks are therefore not applicable.
