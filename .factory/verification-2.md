# Independent verification — FAIL

**Work order:** `telemetry-budget-guard-verify-2`  
**Candidate:** `45576051ce989d3204ba1711114a3772cbfa6d4b` (`4557605 chore: finalize release quality gates`)  
**URL:** <https://telemetry-budget-guard.sociobot.in/>  
**Date:** 2026-08-28 UTC

## Verdict

**FAIL.** The previous hostname/deployment outage is resolved: HTTPS is valid, the public site returns 200, and every checked deployed asset is byte-for-byte identical to the production build of the candidate. The actual CLI and browser demo work in the exercised paths. Release acceptance still fails on two Medium defects: the deployed host does not apply the required response-policy configuration, and the keyboard skip link does not move focus into main content.

## Release-blocking defects

| Severity | Defect | Fresh evidence | Required resolution |
| --- | --- | --- | --- |
| Medium | The live deployment ignores `site/public/_headers`, so it does not serve the candidate's declared CSP or Permissions-Policy. | `curl -I https://telemetry-budget-guard.sociobot.in/` and the hashed JS asset returned `Cache-Control: public, must-revalidate, max-age=30`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Content-Type-Options: nosniff`; they had **no** `Content-Security-Policy` or `Permissions-Policy`. Candidate `_headers` requires a self-only CSP, `camera=(), microphone=(), geolocation=()`, `no-referrer`, and immutable caching. | Configure the deployment host to honor this policy (or translate it to its native config), then verify the live headers. |
| Medium | The visible keyboard skip link does not actually transfer focus to `<main>`. | In Playwright on the live page, first Tab focused "Skip to main content" with a 3px solid outline. Enter changed the fragment to `#main`, but `document.activeElement` remained the skip anchor; Tab therefore continues through header navigation rather than main content. `<main id="main">` is not programmatically focusable. | Make the main landmark focusable for the skip path (for example `tabindex="-1"`) and verify that Enter places focus there. |

## Clean checkout and quality gates

Detached clean worktree: `/tmp/telemetry-budget-guard-verify` at the exact candidate SHA. `npm ci` installed 16 packages with 0 audit vulnerabilities.

| Check | Result |
| --- | --- |
| `npm test` | PASS — 4 Rust unit tests, 2 CLI integration tests, and 3 site contract tests passed. |
| `npm run build` | PASS — Vite production build, locked release binary, and staged Linux x86_64 download. |
| `npm run package:cli` | PASS — Cargo package verification passed; 16.0 KiB compressed crate. Cargo notes that integration test source is not included in the publish archive. |
| `cargo fmt --check` | PASS. |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | PASS. |
| Type/JS lint | No type-check or lint script is defined in `package.json`; Vite production build and the repository's Node tests pass. |
| Clean consumer | PASS — extracted `target/package/telemetry-budget-guard-0.1.0.crate`, installed with `cargo install --path … --root <mktemp> --locked`, and ran the installed binary successfully against the shipped fixtures. |

## CLI product exercise

All observations used the candidate release binary.

| Case | Result |
| --- | --- |
| `--help` | PASS — useful command description and non-interactive command listing; exit 0. |
| Documented fixture with `--json` | PASS — exit **2**, `passed:false`, five violations, `heuristic:true`, and `sample_persisted:false`. |
| Baseline used as both baseline and proposal | PASS — exit **0**, `passed:true`, zero violations. |
| Compact log containing `body: "SECRET-BODY"` and `prompt: "SECRET-PROMPT"` | PASS — exit 0; JSON reported two redactions and contained neither secret. |
| Malformed JSONL | PASS — exit **1** with `JSONL line 1 is invalid` and an actionable hint. Rerunning with valid input recovered normally. |
| Boundary `sample_window_seconds = 0` | PASS — exit **1** with `must be greater than zero`. |
| Packaged consumer API/CLI | PASS — installed binary returned a valid passing JSON report (`heuristic:true`, `sample_persisted:false`). |

## Live deployment, privacy, browser, and PWA evidence

- Production identity: `index.html`, both JS chunks, both CSS chunks, both WebP images, `sw.js`, `/privacy/`, `/terms/`, and `favicon.svg` each had identical SHA-256 hashes between `dist/site` built from the candidate and the live URL. HTTPS returned 200; `/privacy/` and `/terms/` each returned 200.
- Privacy/network: Playwright desktop and 390x844 mobile initial loads made self-origin requests only (HTML, self-hosted JS/CSS/images); no analytics, storage, cookies, third-party fonts, uploads, console errors, or page errors were observed. Browser demo invalid JSON reports an inline error, marks and focuses the textarea, and Restore sample recovers it.
- Accessibility: live page has `lang=en`, title, one h1, one main, labelled controls, image alt text, no mobile horizontal overflow, and visible first-tab focus. `@axe-core/playwright` 4.11.1 reported **0 serious or critical findings** (0 violations total) on desktop and 390px mobile. Reduced-motion mode reduces the scene animation to 0.01ms. The skip-link focus defect above remains a manual keyboard failure not caught by axe.
- PWA: after registration and reload, `navigator.serviceWorker.controller` was true with one registration. With network forced offline, reload returned 200 and retained the page title. Source update path uses `skipWaiting`, `clients.claim`, and cache cleanup; no live build-identity header exists, so byte comparison supplied deployment identity instead.
- Live Lighthouse 12.8.2 mobile: Performance **100**, Accessibility **100**, Best Practices **100**, SEO **100**; FCP 1.1 s, LCP 1.1 s, CLS 0, TBT 0 ms. (Lighthouse emitted a final tab-crash warning after writing the complete JSON report; category and audit results were present.)
- Bundle budget: initial JS is 5.17 kB uncompressed (4.46 kB application + 0.71 kB preload), CSS 10.91 kB, no fonts, and responsive mobile WebP 42.64 kB — all within stated budgets. The live 30-second cache lifetime is nevertheless contrary to the required immutable cache policy for hashed assets.

## Reproduce

```sh
npm ci
npm test
npm run build
npm run package:cli
cargo fmt --check
cargo clippy --workspace --all-targets --locked -- -D warnings

target/release/telemetry-budget-guard check \
  --sample fixtures/otlp-sample.json \
  --baseline fixtures/collector-baseline.yaml \
  --proposed fixtures/collector-proposed.yaml \
  --budget fixtures/budget.toml --json

curl -I https://telemetry-budget-guard.sociobot.in/
curl -I https://telemetry-budget-guard.sociobot.in/assets/main-BpOzwUEz.js
```

No product code was changed during verification.
