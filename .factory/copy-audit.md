# Landing-page copy audit

Audited 2026-09-06. Counts split visible text on spaces. Hyphenated terms count as one word. Terminal metric rows are data, not sentences.

## First screen

| Copy | Words | Result |
| --- | ---: | --- |
| Telemetry Budget Guard | 3 | Pass |
| Demo | 1 | Pass |
| How it works | 3 | Pass |
| Privacy | 1 | Pass |
| You are offline. | 3 | Pass |
| The sample page still works after one online visit. | 9 | Pass |
| OpenTelemetry budget check | 3 | Pass |
| Check OpenTelemetry changes against your budget | 6 | Pass |
| For engineers adding OpenTelemetry to a small service, it catches ingest and cardinality jumps before merge. | 15 | Pass |
| Try it with sample data | 5 | Pass |
| See a realistic failed budget check. | 6 | Pass |
| Nothing is saved. | 3 | Pass |
| Free and MIT-licensed | 3 | Pass |
| Runs on your machine | 4 | Pass |
| Drops sensitive fields by default | 5 | Pass |
| The proposed change is checked before telemetry export. | 8 | Pass |
| Telemetry signals pass through an illuminated budget checkpoint before export. | 10 | Pass; image alternative |

## Product preview

| Copy | Words | Result |
| --- | ---: | --- |
| Estimated measures | 2 | Pass |
| Ingest / month | 3 | Pass |
| Retained storage | 2 | Pass |
| Egress | 1 | Pass |
| Active series | 2 | Pass |
| Bundled CLI sample | 3 | Pass |
| See the real command output | 5 | Pass |
| The installed binary runs this checkout-service sample with one command. | 10 | Pass |
| It returns a clear expected failure without changing your files. | 10 | Pass |
| Demo — bundled checkout-service sample; temporary files are removed. | 8 | Pass; recorded CLI output |
| Privacy: 3 sensitive fields redacted; check wrote no sample files. | 10 | Pass; recorded CLI output |
| Demo outcome: budget failure expected; your CI check would exit 2. | 11 | Pass; recorded CLI output |
| Open the full sample | 4 | Pass |

## How it works and install

| Copy | Words | Result |
| --- | ---: | --- |
| How it works | 3 | Pass |
| Compare the proposed Collector config in three steps | 8 | Pass |
| Capture a bounded sample | 4 | Pass |
| Use OTLP/HTTP JSON, a compact JSON array, or JSONL. | 9 | Pass |
| Compare both configs | 3 | Pass |
| Run the sample through baseline and proposed processor chains. | 9 | Pass |
| Fail an over-budget change | 4 | Pass |
| Set TOML limits. | 3 | Pass |
| Read the report or stable JSON in CI. | 8 | Pass |
| Install | 1 | Pass |
| Install one binary with stable Rust | 6 | Pass |
| No account is needed. | 4 | Pass |
| Run the bundled sample before adding your own files. | 9 | Pass |
| Copy commands | 2 | Pass |

## Limits, privacy, and footer

| Copy | Words | Result |
| --- | ---: | --- |
| Limits and privacy | 3 | Pass |
| Know what the estimate covers | 5 | Pass |
| Modeled | 1 | Pass |
| Attribute and resource actions, strict and regexp filters, probabilistic sampling, and duplicate pipelines. | 13 | Pass |
| Reported | 1 | Pass |
| Unsupported processors produce warnings and stay volume-neutral. | 7 | Pass |
| Protected | 1 | Pass |
| Body, prompt, content, message, and query fields are removed before aggregation by default. | 13 | Pass |
| Not included | 2 | Pass |
| This tool does not store traces, recommend vendors, or replace a production bill. | 13 | Pass |
| Check OpenTelemetry changes before export. | 5 | Pass |
| Privacy | 1 | Pass |
| Terms | 1 | Pass |
| Source on GitHub (external) | 4 | Pass |
| Built by Param Factory · v0.1.0 · repair-2 | 7 | Pass |

## Flags and terminology

No sentence exceeds 22 words. No active landing-page copy uses a banned marketing word.

| Concept | Term used |
| --- | --- |
| User-provided telemetry records | sample |
| Current Collector setup | baseline config |
| Changed Collector setup | proposed config |
| Declared limits | budget |
| Calculated result | estimate |
| Removed body or protected attributes | sensitive fields |
| One-click isolated example | demo |
| Estimated metric identity count | active metric series |
