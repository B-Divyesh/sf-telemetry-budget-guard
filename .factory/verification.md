# Independent verification — FAIL

**Work order:** `telemetry-budget-guard-verify-1`  
**Candidate:** `45576051ce989d3204ba1711114a3772cbfa6d4b` (`4557605 chore: finalize release quality gates`)  
**Required public URL:** <https://telemetry-budget-guard.sociobot.in>  
**Date:** 2026-08-27 (UTC)

## Verdict

**FAIL.** The candidate builds and works locally, but the required public URL is not a usable deployment of it. A normal TLS client rejects the certificate, and an insecure diagnostic request reaches Microsoft Azure's default **404 Site Not Found** page rather than the candidate. Therefore the live deployment cannot match the candidate and its user-facing response policies/caching cannot be accepted.

## Release-blocking defect

| Severity | Defect | Fresh evidence | Required resolution |
| --- | --- | --- | --- |
| Critical | The public product URL is unavailable and does not serve this product. | `curl -I https://telemetry-budget-guard.sociobot.in/` fails certificate hostname verification. SNI certificate subject is `*.msha-slice-7-eus2-1-ase.p.azurewebsites.net`; its SAN list contains only Azure domains, not `telemetry-budget-guard.sociobot.in`. DNS resolves to `40.67.153.174` (`waws-prod-bn1-b5a28a75.sip.p.azurewebsites.windows.net`). `curl -k -I` returns `HTTP/1.1 404 Site Not Found`, `Content-Type: text/html`, `Content-Length: 2667`; its body is the Microsoft default page (not the locally built `dist/site/index.html`). | Correct the hostname binding/DNS and TLS certificate, deploy this candidate's `dist/site`, then rerun production URL/header/cache verification. |

No candidate-source defects were found in the exercised local product paths. The public URL failure means the normal live response did not expose the configured CSP, Permissions-Policy, Referrer-Policy, `nosniff`, or immutable asset cache policy, so those production assertions are **not verifiable** at this URL.

## Clean-checkout build and package evidence

The checkout started clean at the candidate commit. `npm ci` installed 16 packages with **0 vulnerabilities**.

| Check | Result |
| --- | --- |
| `cargo fmt --all -- --check` | PASS |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | PASS |
| `npm test` | PASS — 4 library unit tests, 2 CLI integration tests, 3 site contract tests |
| `npm run build` | PASS — Vite production site, locked optimized Rust release binary, and staged `dist/site/download/telemetry-budget-guard-linux-x86_64` |
| `cargo package --manifest-path crates/telemetry-budget-guard/Cargo.toml --locked --allow-dirty` | PASS — package built and Cargo verification passed (16.0 KiB compressed crate) |
| Clean consumer | PASS — installed the verified extracted package with `cargo install --path target/package/telemetry-budget-guard-0.1.0 --root <mktemp>`; binary reports `telemetry-budget-guard 0.1.0` and the documented fixture returns exit 2 with a valid heuristic JSON report. |

There is no separate JS lint/type-check script in `package.json`; strict Rust lint and formatting checks above are the repository-provided static checks.

## CLI end-to-end evidence

All commands used `target/release/telemetry-budget-guard` and the shipped fixtures unless noted.

| Case | Observed result |
| --- | --- |
| `--help` | PASS — describes local-only heuristic estimation and privacy defaults; command exits 0. |
| Documented baseline/proposed example with `--json` | PASS — exit **2**, `passed:false`, `heuristic:true`, five declared violations, and `sample_persisted:false`. |
| High limits | PASS — exit **0**, `passed:true`. |
| Exact delta boundary | PASS — with all absolute limits high and `max_delta_percent=100`, the 100% active-series delta passed (strictly over-limit behavior). |
| Default sensitive-field handling | PASS — compact log with `body` and `prompt` yielded `sensitive_fields_redacted:2`, `sensitive_fields_included:false`, `sample_persisted:false`; projected ingest was 0.0027 GiB. |
| Explicit `--allow-sensitive` | PASS — same input yielded `redacted:0`, `included:true`, `persisted:false`; projected ingest increased to 0.0039 GiB. |
| Empty sample | PASS — exit **1** with “the sample contains no spans, logs, or metric points”. |
| Unsupported signal | PASS — exit **1** with `unsupported signal 'wat'`. |
| Zero sample window | PASS — exit **1** with “limits.sample_window_seconds must be greater than zero”. |

This covers normal failure/pass CI gates, boundary handling, invalid input, recovery by rerunning valid input, privacy default/opt-in behavior, JSON scripting output, and documented exit codes.

## Static site and PWA evidence (local production build)

The production output was served from `dist/site` with `vite preview` at `http://127.0.0.1:4173` because the required HTTPS URL does not serve the app.

- Factory `verify-url.sh` passed: HTTP 200, load 821 ms, no console/page errors, title and `lang=en`, one `h1`, `main`, no images missing `alt`, and no unlabeled buttons.
- Independent Playwright desktop flow: default demo is **FAIL**; a 10,000% limit changes it to **PASS**; malformed JSON shows “Line 1 needs a signal (span, log, or metric) and a name.”, marks and focuses the textarea; replacing it with valid JSON recovers to PASS and reports one redacted sensitive field.
- Keyboard: first Tab reaches the visible “Skip to main content” link; Enter navigates to `#main`; Enter activates “Restore sample”. Focus on the copy button is a visible `3px solid rgb(255, 196, 92)` outline.
- Mobile at 390x844: `scrollWidth` = `clientWidth` = 390 (no horizontal overflow); primary button is 350x52.8 CSS px and form inputs stack to one column. Desktop and mobile screenshots were visually inspected.
- Reduced motion: the animated scene resolves to `0.00001s` animation/transition durations under `prefers-reduced-motion: reduce`.
- Privacy/network: initial page load made no outbound requests and emitted no console/page errors. The demo source has no `fetch`, `localStorage`, or `sessionStorage`; browser inputs are handled in-page. Initial requests were self-origin only.
- Accessibility: axe-core 4.11 injected into the preinstalled Playwright Chromium reported **0 violations**, including **0 serious/critical** (51 passes; 2 standard incomplete checks). This avoided the standalone axe CLI's incompatible system ChromeDriver.
- PWA/offline: after service-worker readiness and reload, `navigator.serviceWorker.controller` was true; an offline reload returned 200 and retained the page title. The worker uses a versioned shell cache and `skipWaiting`/`clients.claim`.
- Lighthouse 12.8.2 mobile on the local production build: Performance **100**, Accessibility **100**, Best Practices **100**, SEO **100**; FCP 1.1 s, LCP 1.6 s, CLS 0, TBT 0 ms.
- Budget: initial JS is 5.17 kB uncompressed (4.46 kB app + 0.71 kB module preload), initial CSS 10.91 kB, no webfonts, and mobile hero 42.64 kB. All are below the stated 200 kB JS, 50 kB CSS, 120 kB font, and 300 kB mobile-image budgets.

## Response policy and cache assessment

`site/public/_headers` correctly declares immutable cache headers for hashed assets and imagery plus CSP, `X-Content-Type-Options`, Referrer-Policy, and Permissions-Policy. These are source/build configuration only; they are not evidence of a serving deployment. The live endpoint instead returned the Azure default 404 after bypassing TLS and did not establish candidate identity or the configured policies. This is part of the Critical deployment defect, not a local source failure.

## Reproduction

```sh
npm ci
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
npm test
npm run build
npm run package:cli

target/release/telemetry-budget-guard check \
  --sample fixtures/otlp-sample.json \
  --baseline fixtures/collector-baseline.yaml \
  --proposed fixtures/collector-proposed.yaml \
  --budget fixtures/budget.toml --json
```

After the deployment binding is repaired, verify it without `-k`; it must provide a certificate valid for the requested hostname, return candidate HTML with HTTP 200, and serve the configured security/cache headers.
