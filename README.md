# Telemetry Budget Guard

Check an OpenTelemetry Collector change before it raises your observability bill. This CLI is for engineers adding OpenTelemetry to a small service.

It compares one bounded sample under baseline and proposed Collector configs. It estimates ingest, storage, egress, attribute cardinality, and active metric series.

The estimates are heuristic. The CLI fails CI when the proposed result exceeds a declared budget.

## Install

Install the single binary with stable Rust. No account is needed.

```sh
cargo install --git https://github.com/B-Divyesh/sf-telemetry-budget-guard
telemetry-budget-guard demo
```

The demo runs a bundled checkout-service sample from any working directory. It prints an expected failed budget and removes its temporary files.

You can also build from a local checkout:

```sh
cargo install --path crates/telemetry-budget-guard
telemetry-budget-guard --help
```

## Usage

Capture an OTLP/HTTP JSON response, compact JSON array, or JSONL sample. Samples are limited to 100 MiB and 1,000,000 records.

```json
{"signal":"metric","name":"http.server.request.duration","attributes":{"http.request.method":"GET","http.route":"/users/{id}"},"timestamp_unix_nano":"1760000000000000000"}
{"signal":"log","name":"request complete","body":"removed before aggregation","attributes":{"service.name":"checkout","log.level":"info"},"timestamp_unix_nano":"1760000001000000000"}
```

Create `telemetry-budget.toml`:

```toml
[limits]
sample_window_seconds = 60
monthly_ingest_gib = 25
retained_storage_gib = 80
monthly_egress_gib = 20
active_metric_series = 5000
max_attribute_cardinality = 1000
max_delta_percent = 20

[assumptions]
retention_days = 30
compression_ratio = 0.35
replicas = 2
```

From this repository, compare the shipped sample and configs:

```sh
telemetry-budget-guard check \
  --sample fixtures/otlp-sample.json \
  --baseline fixtures/collector-baseline.yaml \
  --proposed fixtures/collector-proposed.yaml \
  --budget fixtures/budget.toml
```

Use `--json` for the stable, schema-versioned machine output. Exit `0` means pass, `1` means invalid input, and `2` means budget failure.

`--allow-sensitive` keeps protected fields in memory for that command only. It never persists the sample.

Version 0.1 models these Collector effects:

- Ordered `attributes` and `resource` actions: `insert`, `upsert`, `update`, `delete`, and `hash`.
- Strict or regexp `filter` include and exclude blocks.
- Probabilistic sampling and duplicate pipelines.

Unsupported processors remain volume-neutral and appear as named warnings.

## Input and output contract

- Input: OTLP/HTTP JSON (`resourceSpans`, `resourceLogs`, `resourceMetrics`), compact JSON arrays, or JSONL records.
- Privacy: bodies and keys containing `prompt`, `body`, `content`, `message`, or `query` are removed before aggregation by default.
- Cardinality: exact within the sample, projected as active metric series with a bounded unseen-series estimator.
- Volume: serialized redacted record bytes, scaled by observed/sample-window rate, replicas, and configured compression.
- Retention: compressed daily ingest × retention days.
- Semantic conventions: keys are data, so old and new OpenTelemetry names are both measured.

The `check` command writes no files and makes no network requests. Reports go to standard output.

## Browser sample

Open <https://telemetry-budget-guard.sociobot.in/demo/> for a one-click sample. It shows populated output and keeps edits in the page only.

The sample page works offline after one online visit. The site uses no analytics, cookies, third-party scripts, or third-party fonts.

## Develop and verify

Prerequisites are stable Rust and Node.js 20 or newer. Start from a clean checkout:

```sh
npm ci
npm test
npm run lint
npm run build
npm run build:site       # static site -> dist/site
npm run package:cli      # ready-to-publish Cargo package
```

Every public promise and its isolated command are listed in [`.factory/claims.json`](.factory/claims.json). Run one with `npm run test:claim -- <claim-id>`.

## Deploy

`npm run build` creates the static site and Linux binary under `dist/site/`. Publish that directory with the factory's existing static deployment.

The repository does not publish packages or change infrastructure. Factory release automation owns those steps.

## Project layout

- `crates/telemetry-budget-guard` — Rust CLI and estimator library
- `crates/telemetry-budget-guard/examples/demo` — sample bundled into the installed binary
- `fixtures` — documented end-to-end example
- `site` — Vite static landing page and local demo
- `.factory/claims.json` — public claims and isolated verification commands
- `.factory/design.md` — product-specific visual decisions and asset provenance

## License

MIT. See [LICENSE](LICENSE).
