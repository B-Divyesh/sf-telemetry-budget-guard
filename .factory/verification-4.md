# Verification 4 — check OpenTelemetry changes against a budget

**Work order:** `telemetry-budget-guard-verify-4`  
**Live URL:** <https://telemetry-budget-guard.sociobot.in/>  
**Implementation reviewed:** `54cc8b999379949e30b4a370680a61c1f12b1426`  
**Verification tooling:** `3d32a878c236b09c249f49dc311424a0fffd03a8`  
**Documentation head:** `4cdd8a003ac2e7f97955bd861214fa239e649784`  
**Date:** 2026-09-06 UTC

## Verdict

**FAIL — 1 Medium finding; 0 untested claims.**

The CLI performs the researched job, all 21 declared claim commands pass, and the default-size phone and desktop paths work. Acceptance still fails because 200% text resizing clips essential text on every live route. The page suppresses horizontal access to the clipped content, so this is loss of content rather than normal wrapping.

## Job, audience, and first action before scrolling

In fresh 1440×1000 desktop and 390×844 phone contexts, before scrolling:

- **Job:** “Check OpenTelemetry changes against your budget.”
- **Audience:** engineers adding OpenTelemetry to a small service who need to catch ingest and cardinality jumps before merge.
- **First action:** “Try it with sample data.” The adjacent note says it opens a realistic failed budget check and saves nothing.
- **Facts:** free and MIT-licensed; runs on the user's machine; drops sensitive fields by default.

All of this content fits in the initial viewport at the normal text size in both contexts.

## Finding

### F1 — Medium — 200% text resizing clips essential content on every route

At a 390×844 viewport, a 200% text-only resize makes headings and other content wider than `<main>`. The site then applies `overflow: clip` to `main` and `overflow: hidden` to the 404 main area. The document remains 390 CSS pixels wide, so the hidden text cannot be reached by horizontal scrolling.

| Route | Main client width | Main content width | Visible effect |
| --- | ---: | ---: | --- |
| `/` | 390 px | 612 px | The job headline, audience sentence, sample action, and later headings are cut off. |
| `/demo/` | 390 px | 446 px | The page title and “Change the sample assumptions” heading are cut off. |
| `/privacy/` | 390 px | 495 px | “Understand how your telemetry is handled” is cut off. |
| `/terms/` | 390 px | 426 px | “Use the estimate with measured data” is cut off. |
| `/404.html` | 390 px | 411 px | The recovery heading is cut off. |

The test used a fresh Chromium context and a verifier-injected `html { font-size: 200% }` user style. CSP was bypassed only so the test could inject that user style; product layout and overflow rules were unchanged. Pixel evidence and element measurements are in `/work/.evidence/verification-4/text-resize/`.

Required resolution: let grid children shrink, wrap long text, and keep resized content visible or scrollable. Remove clipping from content containers where it hides text. Re-test all five routes at 390 px with 200% text and assert that rendered text stays inside a visible or independently scrollable area.

## Declared claims

Every `test` command in `.factory/claims.json` was run separately from the fresh clone. Each registry entry has one matching `@claim:<id>` test, with no missing, duplicate, or extra tags.

| Claim | Result |
| --- | --- |
| `cli-budget-gate` | PASS |
| `input-formats` | PASS |
| `estimate-measures` | PASS |
| `exit-codes` | PASS |
| `json-contract` | PASS |
| `sensitive-default` | PASS |
| `sensitive-opt-in` | PASS |
| `no-persistence` | PASS |
| `no-network` | PASS |
| `modeled-processors` | PASS |
| `unsupported-processors` | PASS |
| `semantic-conventions` | PASS |
| `bounded-samples` | PASS |
| `clean-install` | PASS |
| `free-mit-no-account` | PASS |
| `cardinality-estimator` | PASS |
| `otlp-collector-e2e` | PASS |
| `browser-local-private` | PASS |
| `site-no-tracking` | PASS |
| `offline-reload` | PASS |
| `demo-sandbox` | PASS |

The live site, README, privacy page, and terms page were also checked for claim-like statements. No unlisted public claim was found. Claim logs are under `/work/.evidence/verification-4/claims/`.

## Clean checkout, build, and package

Fresh clone: `/tmp/tbg-verification-4.NrRFYM` at documentation head `4cdd8a003ac2e7f97955bd861214fa239e649784`. The clone remained clean after verification.

| Command | Result |
| --- | --- |
| `npm ci` | PASS — 22 packages installed; 0 vulnerabilities. |
| `npm test` | PASS — 4 Rust unit tests, 2 CLI integration tests, TypeScript checking, and 33 site/browser tests. |
| `npm run lint` | PASS — TypeScript, rustfmt, and Clippy with warnings denied. |
| `npm run build` | PASS — site output and the release binary were produced under `dist/site/`. |
| Executable staging check | PASS — `dist/site/download/telemetry-budget-guard-linux-x86_64` is executable locally. |
| `npm run package:cli` | PASS — 12 files, 69.3 KiB unpacked, 18.4 KiB compressed. |

The production site build contains 5,823 bytes of JavaScript before compression, 13,229 bytes of landing CSS, no font files, and a 42,640-byte phone image. These remain below the declared budgets.

## Installed CLI exercise

The packaged crate was installed offline into a new Cargo root. Its binary was then run from a separate empty working directory with no repository files.

- `--version` returned `0.1.0`; `--help` described the `demo` and non-interactive `check` commands.
- `demo` exited 0, printed the bundled checkout-service result, reported three redactions and an expected CI exit 2, removed its temporary directory, and left the working directory empty.
- Baseline versus baseline exited 0 with `passed:true` and no violations.
- Baseline versus the proposal exited 2 with `passed:false`, five violations, `heuristic:true`, and `sample_persisted:false`.
- A missing sample exited 1 and named the unreadable path.
- The claim suite separately passed malformed input and recovery, exact delta behavior, zero-window validation, 100 MiB and 1,000,000-record bounds, protected-field opt-in/defaults, processor modeling, JSON schema, and syscall-blocked no-network checks.

## Live demo and browser paths

- One click from the landing page opened `/demo/` with a persistent “Demo — sample data, nothing is saved” label.
- The initial realistic output was populated: ingest `0.01 GiB` → `0.03 GiB` (`114.9%`), series `2` → `3` (`50.0%`), status `FAIL`, and three sensitive fields dropped.
- Malformed JSON announced a line-specific error, set the field invalid, and focused it. A zero sample window announced its range error and focused that input.
- Valid input with a raised limit recovered to `PASS`.
- Reset restored the seven-record sample, 60 seconds, two replicas, 20%, three redactions, and `FAIL`.
- A seeded `real:keep` browser key stayed unchanged. No `demo:` key was created. The demo label stayed pinned after scrolling. “Start for real” opened the install section.
- `/?demo=1` redirected to `/demo/`; browser Back returned to `/`.

## Accessibility, routes, privacy, and offline behavior

- Factory `verify-url.sh`: PASS — HTTPS 200, title, `lang=en`, one H1, one main, no missing alt text, no unlabeled buttons, and no console errors.
- Axe Playwright integration: 0 violations on `/`, `/demo/`, `/privacy/`, `/terms/`, and `/404.html` at 320 px. F1 is a manual resize failure that axe does not detect.
- Keyboard: first Tab exposes a 3 px amber focus outline; Enter on the skip link focuses `main`. No keyboard trap was found.
- Touch targets: all visible links, buttons, inputs, and text areas on all five routes measured at least 44×44 CSS pixels at 320 px.
- Reduced motion: transitions resolve to effectively zero duration. Nothing flashes or loops.
- Route titles, canonical URLs, descriptions, Open Graph/Twitter metadata, share art, header, footer, legal links, and one-H1/main structure are present on all five pages.
- All 14 distinct rendered links returned 200. The unknown-path check deliberately returned HTTP 404 with the product-designed recovery page; that expected status is not a defect.
- Requests throughout fresh route and demo flows were same-origin. There were no cookies, local/session storage entries, IndexedDB databases, analytics, third-party scripts/fonts, uploads, page errors, or unexpected console errors.
- In a separate service-worker context, `/demo/` loaded once online and then reloaded offline with status 200, populated output, one registration, and the offline notice. The deployed worker matches the candidate and includes activation, client claim, and old-cache removal.
- Live security headers include the self-only CSP, denied camera/microphone/geolocation permissions, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`. Hashed assets have a one-year immutable cache policy.

## Live identity and performance

Eighteen deployed site files match the clean production build byte for byte: all page HTML, JavaScript, CSS, images/icons, metadata files, service worker, and `_headers`. `staticwebapp.config.json` correctly is not served.

The build also stages an unlinked extensionless Linux binary under `dist/site/download/`, while that live URL returns the designed 404. The site and README do not link or promise that download; the supported Cargo install and clean packaged consumer pass. This corrects the previous handoff's claim that the staged binary was served, but it is not counted as a product finding.

Lighthouse 13.4.1 mobile completed without warnings: Performance 100, Accessibility 100, Best Practices 100, and SEO 100. FCP and LCP were 1.140 seconds, TBT was 82.5 ms, and CLS was 0. Lighthouse does not test the manual 200% text-resize path in F1.

## Earlier finding disposition

| Earlier item | Current disposition |
| --- | --- |
| Verification 1: invalid TLS and Azure default site | Fixed — normal TLS succeeds and the product root is HTTPS 200. |
| Verification 2: missing response policies and immutable asset caching | Fixed — required policies are live and hashed assets are immutable for one year. |
| Verification 2: skip link did not focus main | Fixed — keyboard activation focuses `main` on all tested routes. |
| Review F1: 21 untested public claims | Fixed — all 21 registry commands pass individually; 0 untested claims remain. |
| Review F2: no complete CLI/browser demo sandbox | Fixed — bundled CLI demo and isolated browser demo both pass reset and no-real-data checks. |
| Review F3: unclear first screen and figurative headings | Fixed at normal text size — job, audience, action, result note, and three facts are visible before scrolling. F1 is a separate resize defect. |
| Review F4: incomplete routes, metadata, shared structure, and 404 | Fixed — all required pages and metadata pass; unknown paths return the designed 404. |
| Review F5: installed package lacked a runnable sample | Fixed — clean packaged install runs the bundled demo without repository files. |
| Review F6: undersized mobile legal link | Fixed — zero undersized targets at 320 px. |
| Previous Lighthouse teardown crash | Not reproduced — this run exited 0 with a complete report and no warnings. |
| OTTL, tail sampling, and arbitrary vendor processors | Disclosed scope limit — unsupported active processors are named and treated as volume-neutral. |
| Production calibration | Disclosed scope limit — output is labeled heuristic and asks users to compare with measured usage. |

There is no backend, account, tenant state, database, payment flow, or external model use. Tenant isolation, restart persistence, health, 429/Retry-After, billing, and AI gateway checks are not applicable. A model-assisted feature would not improve this deterministic, inspectable CI budget gate, so no missed AI leverage was found.

## Evidence

- Repository report: `.factory/verification-4.md`
- Required report copy: `/work/.evidence/qa-report.md`
- Machine result: `/work/.evidence/qa-result.json`
- Browser, claim, CLI, Lighthouse, screenshot, and resize evidence: `/work/.evidence/verification-4/`

No product code, deployment, infrastructure, DNS, billing, service, database, or secret was changed during this verification.
