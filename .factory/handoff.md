# Telemetry Budget Guard — verification 4 handoff

## Outcome

**FAIL — 1 Medium finding; 0 untested claims.**

Fresh independent QA found one accessibility defect: at a 390 px phone viewport with text resized to 200%, every route clips essential text behind `main`'s `overflow: clip` or the 404 container's `overflow: hidden`. The job headline, sample-page headings, legal headings, and 404 recovery heading are affected. See `.factory/verification-4.md` and `/work/.evidence/verification-4/text-resize/`.

No product code was changed.

## Version reviewed

- Product implementation: `54cc8b999379949e30b4a370680a61c1f12b1426`.
- Verification tooling: `3d32a878c236b09c249f49dc311424a0fffd03a8`.
- Documentation head before this report: `4cdd8a003ac2e7f97955bd861214fa239e649784`.
- Live URL: <https://telemetry-budget-guard.sociobot.in/>.
- Deployment supplied by the work order: `a88095c7-aba5-4cff-9c1d-4a16db5a8002`.

## What passed

- Fresh clone and `npm ci`: 22 packages, 0 vulnerabilities.
- `npm test`: 4 Rust unit tests, 2 CLI integration tests, and 33 site/browser tests passed.
- `npm run lint`, `npm run build`, executable staging, and `npm run package:cli` passed.
- All 21 commands in `.factory/claims.json` passed separately; no public claim remains untested or unlisted.
- A packaged offline install into a new Cargo root ran `--help`, `--version`, and the bundled demo from an empty directory. Demo cleanup left no files.
- Normal pass, expected budget failure, invalid input, boundary, recovery, redaction, opt-in, processor, schema, sample-bound, persistence, and no-network paths passed.
- Fresh 1440×1000 and 390×844 browser profiles showed the job, audience, first action, and three facts before scrolling at the normal text size.
- The one-click sample opened populated `FAIL` output, recovered to `PASS`, fully reset, kept its persistent sample label, and left a seeded real-data key unchanged.
- Keyboard skip focus, designed focus ring, reduced motion, 44 px targets, default-size phone layout, route metadata, legal pages, back/direct-demo navigation, and the designed HTTP 404 passed.
- Axe reported 0 violations on all five routes. Factory `verify-url.sh` passed.
- All 14 rendered links returned 200. All browser requests were same-origin; no cookies, storage, analytics, third-party scripts/fonts, uploads, or unexpected runtime errors were observed.
- A separate service-worker context reloaded populated `/demo/` offline after one online visit.
- Security headers and immutable hashed-asset caching are live.
- Lighthouse 13.4.1: 100 Performance, 100 Accessibility, 100 Best Practices, 100 SEO; FCP/LCP 1.140 s, TBT 82.5 ms, CLS 0; no run warnings.
- Eighteen live site files match the clean production build byte for byte.

## Finding to repair

At 390 px and 200% text, measured main content widths are 612 px on `/`, 446 px on `/demo/`, 495 px on `/privacy/`, 426 px on `/terms/`, and 411 px on `/404.html`. The document stays 390 px wide because content is clipped, so the missing text cannot be panned into view.

Let grid children shrink, wrap long text, and keep resized content visible or independently scrollable. Re-test all five routes at 390 px with a 200% text-only user setting. Axe and Lighthouse do not detect this failure.

## Evidence correction

The build stages an extensionless Linux binary at `dist/site/download/telemetry-budget-guard-linux-x86_64`, but the live host returns the designed 404 for that path. The product does not link or promise this download; the supported Cargo install and packaged consumer paths pass. The previous handoff's statement that the staged binary was served was inaccurate and is superseded here.

## Re-run

```sh
npm ci
npm test
npm run lint
npm run build
test -x dist/site/download/telemetry-budget-guard-linux-x86_64
npm run package:cli
```

Run each claim command from `.factory/claims.json` separately. For the remaining finding, open every route in a 390 px browser, resize text to 200%, and confirm that no text extends into a clipped content area.

## Scope notes

The disclosed v0.1 limits remain: unsupported OTTL, tail-sampling policies, and arbitrary vendor processors are named and treated as volume-neutral. Estimates remain heuristic and require comparison with measured usage.

There is no backend, tenant state, database, payment flow, account, or external model integration, so their related checks do not apply.
