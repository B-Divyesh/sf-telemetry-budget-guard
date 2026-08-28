# Independent verification — PASS

**Work order:** `telemetry-budget-guard-verify-3`  
**Candidate:** `4d184aabcff4e5e93c6ee1014581bf0733281dec` (`4d184aa chore: add unified lint gate`)  
**Verified URL:** <https://telemetry-budget-guard.sociobot.in/>  
**Date:** 2026-08-28 UTC

## Verdict

**PASS.** This was a fresh verification from a clean candidate checkout, not a reliance on the prior deployment report. The native CLI performs the researched job end to end: it compares bounded OTLP input through baseline/proposed Collector configurations, emits explicitly heuristic storage/egress/cardinality estimates, redacts sensitive fields by default, and returns CI-suitable status codes. The live static/PWA deployment is HTTPS 200 and byte-identical to the candidate production build for the served application artifacts. The earlier response-policy and skip-focus defects are fixed in the deployed product.

## Defects

No Critical, High, Medium, or Low acceptance defects found.

Lighthouse wrote a complete successful report and then emitted a final Chromium tab-crash runtime warning during teardown. This is an environment/tooling warning, not a product failure: the report contained all category and audit values below, and independent Playwright checks had no page or console errors.

## Clean checkout, test, build, and package gates

The checkout began clean at the exact candidate SHA. `npm ci` installed 22 packages and `npm audit` reported 0 vulnerabilities.

| Check | Result |
| --- | --- |
| `npm test` | PASS — 4 Rust unit tests, 2 Rust CLI integration tests, strict TypeScript checking, 4 static site contracts, a Chromium skip-link regression test, and desktop plus 390px browser/axe smoke tests. |
| `npm run lint` | PASS — TypeScript, `cargo fmt --check`, and `cargo clippy --workspace --all-targets --locked -- -D warnings`. |
| `npm run build` | PASS — Vite production site, locked optimized Rust binary, and staged `dist/site/download/telemetry-budget-guard-linux-x86_64`. |
| `npm run package:cli` | PASS — `cargo package --locked` verified the ready-to-publish 16 KiB crate. |
| Clean consumer | PASS — installed extracted `target/package/telemetry-budget-guard-0.1.0` with `cargo install --path … --root /tmp/tbg-consumer-verifier --locked`; installed version is `0.1.0` and its public CLI produced a valid passing JSON report. |

## CLI product exercise

All commands used the candidate release binary.

| Case | Result |
| --- | --- |
| `--help` | PASS — useful non-interactive command help; exit 0. |
| README fixture, baseline versus proposed, `--json` | PASS — exit 2, `passed:false`, five declared violations, and `heuristic:true`. This is the expected CI gate failure. |
| Baseline used as both inputs | PASS — exit 0, `passed:true`, zero violations. |
| Privacy default on shipped OTLP sample | PASS — report recorded 3 redacted fields, `sensitive_fields_included:false`, and `sample_persisted:false`; neither the sample body text nor `gen_ai.prompt` text appeared in the output. |
| Malformed JSONL | PASS — exit 1, `JSONL line 1 is invalid`, with the same actionable hint; subsequent valid run passed. |
| Boundary `sample_window_seconds = 0` | PASS — exit 1 with `limits.sample_window_seconds must be greater than zero`. |
| Packaged clean consumer | PASS — installed binary exited 0 with `heuristic:true` and `sample_persisted:false`. |

The release dependency graph contains only CLI/parsing/serialization crates and no HTTP/telemetry client. Static source and runtime browser-request inspection found no telemetry, persistence, or upload path.

## Live deployment, privacy, PWA, and browser evidence

- HTTPS root, `/privacy/`, `/terms/`, `robots.txt`, and `sitemap.xml` all returned HTTP 200. Root has `Content-Security-Policy: default-src 'self' …`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.
- The deployed `main-BpOzwUEz.js` returns `Cache-Control: public, max-age=31536000, immutable` plus those security policies. The root's 30-second revalidation cache is appropriate for un-hashed HTML.
- SHA-256 hashes match the local production build for the root HTML; both JavaScript and both CSS files; both WebP files; service worker; privacy and terms pages; favicon. `staticwebapp.config.json` is deployment configuration and intentionally not exposed as a public URL (404).
- Independent Playwright checks on desktop (1440×1000) and mobile (390×844): title, `lang=en`, one `h1`, and one `main`; no console errors, no page errors, no cookies, and no local/session storage. Initial requests were all same-origin. Desktop and mobile axe-core had 0 serious/critical violations.
- Keyboard-only: first Tab reaches the visible skip link with `rgb(255, 196, 92) solid 3px` outline; Enter moves focus to `main`. Invalid JSON announces an inline error, focuses the textarea, and sets `aria-invalid`; Restore sample followed by a 10,000% limit recovers to PASS. At 390px, `scrollWidth == clientWidth == 390`; primary action is 316×52.8px.
- Reduced-motion context yields `0.00001s` transition/animation durations. The service worker controlled the page after reload; with browser networking forced offline, a reload returned 200 and retained the title. Its update path contains `skipWaiting`, `clients.claim`, and stale-cache deletion.
- Live Lighthouse 13.4.1 mobile report: Performance **100**, Accessibility **100**, Best Practices **100**, SEO **100**; FCP 1.2 s, LCP 1.2 s, CLS 0, TBT 20 ms.
- Production payload: initial JS 5,169 bytes (4,458-byte app + 711-byte preload), CSS 10,909 bytes for landing route, no webfonts, and 42,640-byte mobile hero. All are within the requested budgets.

## Reproduce

```sh
npm ci
npm test
npm run lint
npm run build
npm run package:cli

target/release/telemetry-budget-guard check \
  --sample fixtures/otlp-sample.json \
  --baseline fixtures/collector-baseline.yaml \
  --proposed fixtures/collector-proposed.yaml \
  --budget fixtures/budget.toml --json

curl -I https://telemetry-budget-guard.sociobot.in/
curl -I https://telemetry-budget-guard.sociobot.in/assets/main-BpOzwUEz.js
```

No product code was modified during verification.
