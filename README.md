# Telemetry Budget Guard

Catch an expensive OpenTelemetry change before it reaches your backend. `telemetry-budget-guard` compares a bounded, redacted OTLP sample under two OpenTelemetry Collector configs, projects ingest, storage, egress, and metric-series cardinality, and fails CI when the proposed configuration exceeds a declared budget.

Estimates are deliberately vendor-neutral and heuristic. The tool stores nothing, sends nothing, and drops log bodies and prompt-like attributes before aggregation by default.

## Install

Build the single binary with stable Rust:

```sh
cargo install --path crates/telemetry-budget-guard
telemetry-budget-guard --help
```

The release artifact can be prepared without publishing via:

```sh
cargo package --manifest-path crates/telemetry-budget-guard/Cargo.toml
```

## Usage

Capture a bounded OTLP/HTTP JSON response or JSONL sample. A compact JSONL form is also accepted:

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

Compare the configs and gate CI:

```sh
telemetry-budget-guard check \
  --sample fixtures/otlp-sample.json \
  --baseline fixtures/collector-baseline.yaml \
  --proposed fixtures/collector-proposed.yaml \
  --budget fixtures/budget.toml
```

Use `--json` for stable machine-readable output. Exit `0` means every budget passed, `2` means a budget failed, and `1` means the input/config was invalid. `--allow-sensitive` explicitly opts into retaining body/prompt-like fields in the in-memory estimate; it is off by default.

Supported Collector effects in v0.1 are ordered `attributes`/`resource` actions (`insert`, `upsert`, `update`, `delete`, `hash`), strict/regexp `filter` include/exclude blocks, and probabilistic sampling. Other processors remain volume-neutral and are listed as warnings, so a config is never silently presented as fully modeled.

## Input and output contract

- Input: bounded OTLP/HTTP JSON (`resourceSpans`, `resourceLogs`, `resourceMetrics`) or compact JSON/JSONL records.
- Privacy: aggregation only; bodies and attribute keys containing `prompt`, `body`, `content`, `message`, or `query` are removed unless explicitly allowed.
- Cardinality: exact within the sample, projected as active metric series with a bounded unseen-series estimator.
- Volume: serialized redacted record bytes, scaled by observed/sample-window rate, replicas, and configured compression.
- Retention: compressed daily ingest × retention days.
- Semantic conventions: keys are treated as data rather than hard-coded, so old and new convention names are both measured.

## Develop and verify

```sh
npm install
npm test
npm run build
npm run build:site       # static site -> dist/site
npm run package:cli      # ready-to-publish Cargo package
```

The documentation/demo site is local-first and makes no network requests. Its browser demo runs entirely in-page and does not upload pasted telemetry.

## Project layout

- `crates/telemetry-budget-guard` — Rust CLI and estimator library
- `fixtures` — documented end-to-end example
- `site` — Vite static landing page and local demo
- `.factory/design.md` — product-specific visual decisions and asset provenance

## License

MIT. See [LICENSE](LICENSE).
