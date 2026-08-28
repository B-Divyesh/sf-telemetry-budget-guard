# Telemetry Budget Guard — repair handoff

## Release repair (2026-08-28 UTC)

This repair addresses both release blockers in [`.factory/verification-2.md`](verification-2.md) while preserving the CLI, privacy model, static deployment class, and all previously passing behavior.

- Added `site/public/staticwebapp.config.json`, the Azure Static Web Apps-native response-policy configuration. It applies the required self-only CSP, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`; it applies `Cache-Control: public, max-age=31536000, immutable` to `/assets/*`, both WebP images, and the favicon. The compatible `_headers` file remains in place.
- Added `tabindex="-1"` to the landing, privacy, and terms main landmarks. Native skip-link fragment navigation now transfers focus to `main`.
- Added exact response-policy contract coverage, a Chromium skip-link regression test, desktop and 390px Chromium/axe smoke tests, and strict TypeScript checking. The factory deployed the checked-in Azure-native configuration to the existing static product host.

## What shipped

- Rust 0.1.0 single-binary CLI with helpful `--help`, human output, stable `--json`, and CI exit codes (`0` pass, `1` invalid input, `2` budget failure).
- Bounded OTLP/HTTP JSON, compact JSON array, and JSONL ingestion (100 MiB / 1,000,000-record safety caps).
- Baseline/proposed OpenTelemetry Collector pipeline comparison. v0.1 models ordered attributes/resource actions, strict or regexp include/exclude filters, probabilistic sampling, and multiple output pipelines. Unsupported active processors produce explicit warnings and remain volume-neutral.
- Heuristic monthly compressed ingest, retained storage, egress, record rate, exact sampled attribute cardinality, and bounded Chao1 metric-series estimation.
- Privacy defaults: log bodies and attribute keys containing `prompt`, `body`, `content`, `message`, or `query` are removed before aggregation. The CLI has no network calls, persistence, or telemetry.
- A documented failing fixture in `fixtures/` and six Rust tests, including the README command, privacy behavior, OTLP envelopes, config transforms, JSON output, and exit codes.
- Vite landing/docs site with an entirely local JSONL estimate demo, offline notice and cached shell, empty/invalid/loading/pass/fail feedback, `/privacy/`, `/terms/`, responsive 390px layout, and keyboard-visible focus.
- Original night-market telemetry illustration generated with the factory image deployment and responsive WebP derivatives (123 KB desktop / 43 KB mobile). Provenance and the complete visual system are in `.factory/design.md`.

## Run and verify

```sh
npm install
npm test
npm run build            # static deployment at dist/site + Linux binary download
npm run package:cli      # verified Cargo package, not published

target/release/telemetry-budget-guard check \
  --sample fixtures/otlp-sample.json \
  --baseline fixtures/collector-baseline.yaml \
  --proposed fixtures/collector-proposed.yaml \
  --budget fixtures/budget.toml --json
```

The example deliberately exceeds `max_delta_percent` and exits 2.

Final local verification on 2026-08-28:

- Clean `npm ci`: passed; `npm audit` reported 0 vulnerabilities.
- `npm test`: passed — 4 Rust unit tests, 2 Rust CLI integration tests, strict TypeScript checking, 4 static-site policy/privacy/semantic tests, a Chromium skip-link regression test, and desktop plus 390px Chromium/axe smoke tests.
- `npm run lint`: passed — strict TypeScript, Rust formatting, and Clippy with warnings denied.
- Browser smoke: default estimator state loaded; a 10,000% limit recovered to `PASS`; Enter from the skip link focused `main`; axe reported 0 serious/critical findings; there were 0 console errors, 0 page errors, and all page requests were self-origin.
- `npm run build`: passed; `dist/site/index.html`, `dist/site/staticwebapp.config.json`, and the release binary staged under `dist/site/download/` exist. The generated Azure configuration byte-matches its checked-in source.
- `cargo package --manifest-path crates/telemetry-budget-guard/Cargo.toml --locked`: packaged and verified successfully (16 KB crate archive).
- `cargo fmt --check` and `cargo clippy --workspace --all-targets --locked -- -D warnings`: passed.
- Clean consumer: installed the packaged crate to a fresh temporary Cargo root and ran its binary against shipped fixtures; it returned a valid passing JSON report with `heuristic: true` and `sample_persisted: false`.
- Production preview and live PWA: after registration and controlled reload, `navigator.serviceWorker.controller` was true; an offline reload returned 200 and retained the title.
- Initial payload: 4.46 KB JS, 10.91 KB CSS, 43 KB mobile hero; no third-party runtime requests or fonts.

## Live deployment evidence

The factory static deployment completed successfully on 2026-08-28 (Azure deployment `5483d8a3-45de-4fc2-9e4e-cfa23419fe65`) and the managed TLS endpoint returned HTTPS 200.

- `curl -I https://telemetry-budget-guard.sociobot.in/` returned the self-only CSP, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`.
- `curl -I https://telemetry-budget-guard.sociobot.in/assets/main-BpOzwUEz.js` returned those same security headers plus `Cache-Control: public, max-age=31536000, immutable`.
- SHA-256 identity checks matched the production build for the root, privacy and terms pages; both JavaScript assets; both CSS assets; both WebP assets; the service worker; and favicon.
- Live Playwright desktop and 390px mobile checks passed: skip-link Enter focused `main`, axe had 0 serious/critical findings, cookies/local/session storage were empty, console/page errors were empty, and all initial requests were same-origin.
- Live Lighthouse 12.8.2 mobile report: Performance 100, Accessibility 100, Best Practices 100, SEO 100; FCP 1.1 s, LCP 1.1 s, CLS 0, TBT 0 ms. Lighthouse emitted its known final tab-crash warning after writing the complete JSON report.

## Known gaps and next steps

- OTTL transform/filter expressions, tail-sampling policies, and arbitrary vendor processors are intentionally not interpreted in v0.1. The CLI warns for each active unsupported processor; add evaluators only with conformance fixtures.
- Projection quality depends on a representative bounded window. Teams should compare estimates with actual usage for three releases and tune the window, replica, compression, and retention assumptions.
- The browser demo illustrates the calculation shape for compact JSONL; authoritative gates use the native CLI with full Collector YAML.
- The staged download is for this Linux x86_64 worker. Factory release automation should build signed archives for supported targets and insert checksums.
