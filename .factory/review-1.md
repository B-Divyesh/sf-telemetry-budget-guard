# Review 1 — prevent an OpenTelemetry change from breaking its budget

**Work order:** `telemetry-budget-guard-review-1`

**Review date:** 2026-09-06 UTC

**Live URL:** <https://telemetry-budget-guard.sociobot.in>

**Implementation reviewed:** `4d184aabcff4e5e93c6ee1014581bf0733281dec`

**Documentation head:** `0698a1fe414fe2214a206a83eb2654a769580971`

## Verdict

**FAIL — 6 findings; 21 untested public claims.**

The native CLI performs its main budget-checking job in the exercised paths, and the live site matches the implementation build. Acceptance fails because there is no claims registry or claim-tagged test, the required CLI sample sandbox is missing, the first screen does not plainly state the job and audience, site routes and metadata are incomplete, the installed package has no runnable sample, and one mobile legal link misses the touch-target baseline.

## Findings

### F1 — High — Public claims have no declared claim tests

`.factory/claims.json` does not exist and `rg '@claim:' site crates` finds no tagged test. The normal test suite passes, but it is not a claims suite: none of the promises below has the required unique `@claim:<id>` command running from the demo entry point in a fresh sandbox. This leaves **21 untested public claims**. C21 is also contradicted by the live deployment.

| ID | Public claim, deduplicated across the site, README, and legal pages | Manual review evidence | Required disposition |
| --- | --- | --- | --- |
| C01 | The CLI compares baseline and proposed Collector configs and fails a declared budget. | Exercised; exit 2 on the shipped proposed config and exit 0 when both configs are the baseline. | Add one tagged claim test. |
| C02 | It accepts OTLP/HTTP JSON, compact JSON arrays, and JSONL. | OTLP fixture and JSONL unit paths pass; no claim test exists. | Add tagged fixture coverage. |
| C03 | It estimates ingest, retained storage, egress, attribute cardinality, and active metric series. | Values are emitted in human and JSON reports. | Add an outcome test for all meters. |
| C04 | Exit 0 means pass, 1 means invalid input, and 2 means budget failure. | All three observed from the installed binary. | Add a tagged exit-code test. |
| C05 | `--json` is stable machine-readable output. | Valid schema-versioned JSON observed; stability is not declared or tested as a claim. | Define and test the stable fields. |
| C06 | Bodies and prompt/content/message/query-like attributes are dropped by default. | Shipped fixture reports three redactions. | Add a tagged no-secret-output test. |
| C07 | `--allow-sensitive` changes only the in-memory estimate. | It reports included=true, redacted=0, persisted=false. | Add a tagged opt-in test. |
| C08 | The CLI stores or persists nothing. | Source and output support the claim; no sandbox assertion exists. | Add filesystem observation around a demo run. |
| C09 | The CLI sends nothing and has no telemetry. | Dependency/source review found no network client; no runtime request test exists. | Add a network-denial claim test. |
| C10 | The listed attribute/resource actions, strict/regexp filters, probabilistic sampling, and duplicate pipelines are modeled. | Only a subset has unit coverage. | Add conformance fixtures for every public processor claim. |
| C11 | Unsupported processors are warned about and remain volume-neutral. | Code path exists; no public claim test covers it. | Add a tagged unsupported-processor fixture. |
| C12 | Old and new semantic-convention keys are both measured. | The implementation treats keys as data; no paired convention fixture proves the promise. | Add a tagged paired fixture. |
| C13 | Samples are bounded. | Source caps the sample at 100 MiB and 1,000,000 records; public wording gives no tested observable boundary. | State the bounds and test both edges. |
| C14 | The browser estimate runs locally and does not upload or store pasted telemetry. | Full demo flow made only same-origin asset requests; cookies and both web-storage areas stayed empty. | Add a tagged whole-flow request/storage test. |
| C15 | The site uses no analytics, cookies, tracking pixels, third-party scripts, or third-party fonts. | Fresh desktop and phone contexts observed no cookies or third-party requests. | Add a tagged whole-flow privacy test. |
| C16 | The browser demo works offline after the first visit. | A controlled service worker returned 200 on an offline reload. | Add the required isolated-context offline claim test. |
| C17 | It installs as one binary with stable Rust and needs no account. | The documented Git install succeeded in a fresh Cargo root. | Add a clean-consumer install claim test. |
| C18 | The product is free, MIT-licensed, and vendor-neutral. | MIT license exists and no paid path is present; “vendor-neutral” is not bounded by a test. | Test the concrete parts and replace or define the vague part. |
| C19 | Cardinality is exact in-sample and uses a bounded unseen-series estimator. | The Chao1 implementation is present; no public contract fixture checks exact and projected results. | Add a deterministic tagged test. |
| C20 | The CLI handles full OTLP envelopes and Collector YAML. | The shipped OTLP/YAML fixture works. | Add the documented end-to-end command as a tagged claim. |
| C21 | “Release archives are produced by the factory after merge.” | The live `/download/telemetry-budget-guard-linux-x86_64` returns 404, and the product repository has zero GitHub releases. | Remove the claim or publish and test named archives and checksums. |

### F2 — Medium — The required one-click CLI sample sandbox does not exist

The first screen offers “Install the CLI” and “Run a local estimate,” not “Try it with sample data.” `/demo` returns the Azure generic 404. `/?demo=1` is just the landing page and does not establish a demo mode. The browser estimator is a separate TypeScript approximation, not a recording or execution of the real binary.

The installed binary rejects `telemetry-budget-guard demo` with exit 2. There is no `examples/` directory, `.factory/demo.md`, persistent “Demo — sample data, nothing is saved” label, or “Start for real” action. “Restore sample” restores only the textarea; it does not reset the changed window, replica, or delta-limit controls. The seven-line populated sample itself is realistic, shows a FAIL result and three redactions, invalid input is announced and focused, and the page writes no browser storage. Those passing details do not supply the missing sandbox contract.

### F3 — Medium — The first screen and section copy do not state the job in plain words

The H1 is “Know the telemetry tab before it reaches prod.” “Tab” is a billing metaphor and “prod” is shorthand; it does not name the job. The next sentence explains inputs but does not name the audience: engineers adding OpenTelemetry to a small service. The primary action is installation and has no adjacent statement of what happens next. At 390×844 only one of the three fact lines is visible before scrolling.

Several headings use metaphor or mood copy rather than section names, including “Try the shape of the gate,” “Set up the stall,” and “Honest by design.” `.factory/copy-audit.md` is also absent. Replace the H1 with the job, name the audience and outcome in one sentence, show the sample action and its result, keep all three facts in the phone first screen, and use literal section headings.

### F4 — Medium — Required site routes, metadata, and shared structure are incomplete

The root title is 63 characters, over the 60-character contract. Root, privacy, and terms have no canonical link, Open Graph metadata, Twitter card metadata, apple-touch icon, or product-derived 1200×630 share image. Unknown paths and `/404.html` return the generic Azure 404, with no product styling or route back. `staticwebapp.config.json` has no navigation fallback or designed 404 response override. The sitemap omits a demo and 404 route.

The legal-page header is not the same navigation as the landing page. Footers omit “Built by Param Factory” and a build/version identifier. External GitHub links do not say they leave the site. Add the standard metadata and shared skeleton to each route and a deliberate product-specific 404. A deliberate HTTP 404 status is expected; the defect is the missing product page and recovery path, not the status.

### F5 — Medium — The installed package cannot run the documented sample on its own

Both the packaged crate and the documented `cargo install --git …` command install version 0.1.0 successfully in clean Cargo roots. The installed artifact has no bundled sample or demo command, however. The README's first check command refers to repository-relative `fixtures/...` files that are not installed for that consumer. `cargo package` includes seven files, excludes the fixtures, and warns that `tests/cli.rs` is not packaged. The staged live download path returns 404, the repository has zero GitHub releases, and there is no `CHANGELOG.md`.

Ship a sample with the installable artifact or implement the required `demo` command using bundled data in a temporary directory. Make the first clean-consumer command runnable without a separate repository checkout, include publish-time example coverage, and add the changelog required for a versioned CLI.

### F6 — Low — One mobile legal link is smaller than the touch-target baseline

At a 320 CSS-pixel viewport, the inline “MIT License” link on `/terms/` measures about 94×19 px. The attached accessibility baseline requires interactive targets at least 44 px high. All other tested controls had a visible 3 px amber focus outline, keyboard order was usable, skip activation focused `main`, and desktop/phone axe scans found no violations.

## Job, audience, and first action before scrolling

From the live first screen, without scrolling:

- **Stated job:** compare a redacted OTLP sample through current and proposed Collector configs to catch cost increases.
- **Implied audience:** people who already operate an OpenTelemetry Collector. The page does not explicitly name engineers adding OpenTelemetry to a small service.
- **First action:** “Install the CLI.” The sample action is secondary and is labeled “Run a local estimate.”

## Fresh build and installed-artifact evidence

The checkout started clean at documentation head `0698a1f`. `4d184aa` is the last implementation/tooling candidate; the two later commits only update handoff and verification documents.

| Check | Result |
| --- | --- |
| `npm ci` | PASS — 22 packages, 0 audit vulnerabilities. |
| `npm test` | PASS — 4 Rust unit tests, 2 Rust CLI integration tests, typecheck, and 7 site/browser tests. |
| `npm run lint` | PASS — TypeScript, rustfmt, and Clippy with warnings denied. |
| `npm run build` | PASS — `dist/site` and the local staged Linux binary were produced. |
| `npm run package:cli` | PASS with the package warning described in F5; 16.0 KiB crate. |
| Packaged clean consumer | PASS — installed version 0.1.0 and ran the shipped OTLP/config fixture when given repository paths. |
| Documented Git install | PASS — installed version 0.1.0 from public head `0698a1f` in a separate Cargo root. |
| `--help` / `--version` | PASS — useful non-interactive help and version 0.1.0. |
| Normal pass | PASS — baseline against itself exited 0 with no violations. |
| Normal budget failure | PASS — shipped baseline/proposed inputs exited 2 with five violations. |
| Invalid input | PASS — malformed JSONL exited 1 with a line-specific error; a following valid run recovered. |
| Exact boundary | PASS — a 100% active-series delta passed a 100% limit. |
| Sensitive opt-in | PASS — included=true, redacted=0, persisted=false. |
| Missing input | PASS — exited 1 and named the unreadable path. |
| CLI demo | FAIL — `demo` is an unrecognized subcommand. |

## Live browser, accessibility, privacy, and offline evidence

- Fresh Chromium contexts at 1440×1000 and 390×844 loaded without console or page errors. There was no horizontal overflow. The populated seven-line sample showed FAIL and three dropped sensitive fields. Malformed JSON showed a clear inline error, set `aria-invalid`, and focused the textarea; zero window input showed an error; valid input and a raised limit recovered to PASS.
- Across the entire browser flow, all requests were same-origin assets. Cookies, local storage, and session storage stayed empty. This proves no changes to browser-held real data in the exercised path.
- The factory `verify-url.sh` passed and wrote desktop/phone screenshots and a semantic report under `/work/.evidence/live/`.
- The standalone axe CLI could not find a system Chrome binary. Axe was therefore run through the repository's Playwright integration dependency against the live page in both fresh contexts and reported zero violations, including zero serious/critical issues. Manual keyboard traversal found designed focus rings and no trap. F6 remains a manual target-size defect.
- Reduced-motion Chromium reported 0.01 ms animation/transition durations and instant scroll. After the service worker controlled a fresh phone context, offline reload returned 200 with the correct title. The worker includes skip-waiting, client-claim, and stale-cache cleanup behavior.
- Live Lighthouse 13.4.1 wrote a complete mobile report: Performance 100, Accessibility 100, Best Practices 100, SEO 100; FCP 1.1 s, LCP 1.1 s, TBT 30 ms, CLS 0. It then emitted `TARGET_CRASHED` while gathering the full-page screenshot. Independent Playwright runs remained clean, so this teardown is tooling evidence, not an additional product finding.
- Initial payload is 5,169 bytes of JS, 10,909 bytes of landing CSS, no webfont, and a 42,640-byte phone image. HTTPS and the required CSP, permissions, referrer, and content-type response headers are present. The hashed JS asset has a one-year immutable cache policy.
- `/privacy/`, `/terms/`, robots, sitemap, the issue tracker, repository, and MIT License links return 200. The privacy page correctly explains that there is no stored account data and provides a working issue-tracker contact. There is no backend or tenant state, so tenant isolation, restart persistence, health, and 429/Retry-After checks are not applicable.

## Live identity and earlier finding disposition

SHA-256 checks for root, privacy, terms, both JavaScript assets, both CSS assets, both WebP images, service worker, and favicon match the clean build byte for byte. The live implementation is therefore `4d184aa`; `0698a1f` is the documentation head.

| Earlier item | Current disposition |
| --- | --- |
| Verification 1: invalid TLS and Azure default site | **Fixed.** Normal TLS succeeds and the product root returns 200. |
| Verification 2: missing CSP/Permissions-Policy and wrong cache policy | **Fixed.** Required headers are live; hashed JS is immutable for one year. |
| Verification 2: skip link did not focus main | **Fixed.** Enter on the first-tab skip link focuses `main` on desktop, phone, privacy, and terms. |
| Verification 3: Lighthouse post-report tab crash | **Still an environment/tooling warning.** A complete 100/100/100/100 report was written again before `TARGET_CRASHED`; independent runs had no page failure. |
| Handoff: OTTL, tail sampling, and arbitrary processors not interpreted | **Open, disclosed v0.1 limitation.** Active unsupported processors are warned and volume-neutral; the broader public modeling claims still need C10/C11 tests. |
| Handoff: estimate needs production calibration | **Open, properly disclosed.** Both CLI and site label output heuristic. |
| Handoff: browser estimate is not authoritative CLI | **Open and now part of F2.** It cannot satisfy the required real-binary demo. |
| Handoff: release archives and checksums remain factory work | **Open and now part of F1/F5.** The public production claim is not fulfilled. |

## Evidence locations

- Repository report: `.factory/review-1.md`
- Required copy: `/work/.evidence/qa-report.md`
- Machine result: `/work/.evidence/qa-result.json`
- Live screenshots and semantic report: `/work/.evidence/live/`
- Lighthouse JSON: `/work/.evidence/live/lighthouse.json`

No product code, deployment, infrastructure, DNS, billing, service, database, or secret was changed during this review.
