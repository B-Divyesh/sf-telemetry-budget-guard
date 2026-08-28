# Telemetry Budget Guard — build handoff

## Independent verification update — FAIL (2026-08-28 UTC)

Candidate `45576051ce989d3204ba1711114a3772cbfa6d4b` passed clean installation, all repository tests, exact production build, strict Rust formatting/linting, Cargo package verification, clean-consumer installation, representative CLI pass/fail/boundary/invalid/privacy checks, live browser flows, axe (0 serious/critical), offline reload, and live Lighthouse (100 Performance / 100 Accessibility).

**Release status is FAIL.** The prior hostname/404 failure is fixed: the live HTTPS site is 200 and checked HTML, JS, CSS, images, service worker, legal pages, and favicon exactly match the candidate build. It still fails acceptance because the host does not apply the candidate's `_headers`: no CSP or Permissions-Policy, non-matching Referrer-Policy, and 30-second rather than immutable asset caching. Additionally, the keyboard skip link changes the URL fragment but leaves focus on itself instead of moving it into `<main>`. Full current evidence and exact repro are in [`.factory/verification-2.md`](verification-2.md); the prior outage report is retained in [`.factory/verification.md`](verification.md).

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

Final local verification on 2026-08-27:

- `npm test`: 6 Rust tests + 3 site contract tests passed.
- `npm run build`: passed; `dist/site/index.html` exists and the release binary is staged under `dist/site/download/`.
- `cargo package --manifest-path crates/telemetry-budget-guard/Cargo.toml --locked`: packaged and verified successfully (16 KB crate archive).
- Factory `verify-url.sh`: HTTP 200, 0 console/page errors, title/lang/main present, exactly one h1, 0 images missing alt, 0 unlabeled buttons.
- axe-core 4.10.3 in headless Chrome: 0 violations.
- Lighthouse 12.8.2, mobile preset: Performance 100, Accessibility 100, Best Practices 100, SEO 100; FCP 0.9 s, LCP 1.5 s, CLS 0, TBT 0 ms.
- Initial payload: 4.46 KB JS, 10.91 KB CSS, 43 KB mobile hero; no third-party runtime requests or fonts.
- `npm audit`: 0 vulnerabilities.

## Known gaps and next steps

- OTTL transform/filter expressions, tail-sampling policies, and arbitrary vendor processors are intentionally not interpreted in v0.1. The CLI warns for each active unsupported processor; add evaluators only with conformance fixtures.
- Projection quality depends on a representative bounded window. Teams should compare estimates with actual usage for three releases and tune the window, replica, compression, and retention assumptions.
- The browser demo illustrates the calculation shape for compact JSONL; authoritative gates use the native CLI with full Collector YAML.
- The staged download is for this Linux x86_64 worker. Factory release automation should build signed archives for supported targets and insert checksums.
