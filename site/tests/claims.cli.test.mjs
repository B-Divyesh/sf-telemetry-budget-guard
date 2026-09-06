import assert from 'node:assert/strict'
import { closeSync, createWriteStream, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, statSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = fileURLToPath(new URL('../..', import.meta.url))
const binary = resolve(root, 'target', 'debug', process.platform === 'win32' ? 'telemetry-budget-guard.exe' : 'telemetry-budget-guard')
const fixture = (name) => resolve(root, 'fixtures', name)

const passThrough = `processors: {}
service:
  pipelines:
    traces: { processors: [] }
    logs: { processors: [] }
    metrics: { processors: [] }
`

const generousBudget = `[limits]
sample_window_seconds = 60
monthly_ingest_gib = 100000
retained_storage_gib = 100000
monthly_egress_gib = 100000
active_metric_series = 10000000
max_attribute_cardinality = 10000000
max_delta_percent = 100000

[assumptions]
retention_days = 30
compression_ratio = 0.35
replicas = 1
`

function sandbox() {
  return mkdtempSync(join(tmpdir(), 'tbg-claim-'))
}

function run(args, options = {}) {
  return spawnSync(binary, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
}

function checkArgs({ sample, baseline, proposed = baseline, budget, json = true, allowSensitive = false }) {
  return [
    'check', '--sample', sample, '--baseline', baseline, '--proposed', proposed,
    '--budget', budget, ...(json ? ['--json'] : []), ...(allowSensitive ? ['--allow-sensitive'] : [])
  ]
}

function prepare({ sample, baseline = passThrough, proposed = baseline, budget = generousBudget }) {
  const dir = sandbox()
  const paths = {
    sample: join(dir, 'sample.json'),
    baseline: join(dir, 'baseline.yaml'),
    proposed: join(dir, 'proposed.yaml'),
    budget: join(dir, 'budget.toml')
  }
  writeFileSync(paths.sample, sample)
  writeFileSync(paths.baseline, baseline)
  writeFileSync(paths.proposed, proposed)
  writeFileSync(paths.budget, budget)
  return { dir, paths }
}

function reportFor(input, extra = {}) {
  const prepared = prepare(input)
  const result = run(checkArgs({ ...prepared.paths, ...extra }), { cwd: prepared.dir })
  assert.ok([0, 2].includes(result.status), result.stderr)
  return { result, report: JSON.parse(result.stdout), ...prepared }
}

test('@claim:cli-budget-gate compares two Collector configs and fails an exceeded budget', () => {
  const changed = run(checkArgs({
    sample: fixture('otlp-sample.json'),
    baseline: fixture('collector-baseline.yaml'),
    proposed: fixture('collector-proposed.yaml'),
    budget: fixture('budget.toml')
  }))
  assert.equal(changed.status, 2)
  assert.equal(JSON.parse(changed.stdout).passed, false)

  const unchanged = run(checkArgs({
    sample: fixture('otlp-sample.json'),
    baseline: fixture('collector-baseline.yaml'),
    proposed: fixture('collector-baseline.yaml'),
    budget: fixture('budget.toml')
  }))
  assert.equal(unchanged.status, 0)
  assert.equal(JSON.parse(unchanged.stdout).passed, true)
})

test('@claim:input-formats accepts OTLP JSON, compact JSON arrays, and JSONL', () => {
  const formats = [
    readFileSync(fixture('otlp-sample.json'), 'utf8'),
    JSON.stringify([{ signal: 'span', name: 'GET /items', attributes: { 'service.name': 'api' } }]),
    '{"signal":"metric","name":"requests","attributes":{"route":"/items"}}\n{"signal":"log","name":"served"}\n'
  ]
  const counts = formats.map((sample) => reportFor({ sample }).report.proposed.observed_records)
  assert.deepEqual(counts, [7, 1, 2])
})

test('@claim:estimate-measures reports ingest, retained storage, egress, cardinality, and active series', () => {
  const { report } = reportFor({ sample: readFileSync(fixture('otlp-sample.json'), 'utf8') })
  for (const side of ['baseline', 'proposed']) {
    for (const key of ['monthly_ingest_gib', 'retained_storage_gib', 'monthly_egress_gib', 'max_attribute_cardinality', 'active_metric_series']) {
      assert.equal(typeof report[side][key], 'number', `${side}.${key}`)
      assert.ok(report[side][key] > 0, `${side}.${key} should be populated`)
    }
  }
})

test('@claim:exit-codes returns 0 for pass, 1 for invalid input, and 2 for budget failure', () => {
  const common = {
    sample: fixture('otlp-sample.json'),
    baseline: fixture('collector-baseline.yaml'),
    budget: fixture('budget.toml')
  }
  assert.equal(run(checkArgs({ ...common, proposed: common.baseline })).status, 0)
  assert.equal(run(checkArgs({ ...common, sample: resolve(root, 'README.md'), proposed: common.baseline })).status, 1)
  assert.equal(run(checkArgs({ ...common, proposed: fixture('collector-proposed.yaml') })).status, 2)
})

test('@claim:json-contract emits the documented schema-versioned JSON fields', () => {
  const result = run(checkArgs({
    sample: fixture('otlp-sample.json'), baseline: fixture('collector-baseline.yaml'),
    proposed: fixture('collector-baseline.yaml'), budget: fixture('budget.toml')
  }))
  assert.equal(result.status, 0)
  const report = JSON.parse(result.stdout)
  assert.equal(report.schema_version, '1')
  assert.deepEqual(Object.keys(report), ['schema_version', 'passed', 'heuristic', 'sample_window_seconds', 'baseline', 'proposed', 'delta', 'violations', 'warnings', 'privacy'])
  assert.deepEqual(Object.keys(report.privacy), ['sensitive_fields_redacted', 'sensitive_fields_included', 'sample_persisted'])
  assert.equal(report.heuristic, true)
})

test('@claim:sensitive-default removes body, prompt, content, message, and query fields before reporting', () => {
  const secrets = ['BODY_SECRET', 'PROMPT_SECRET', 'CONTENT_SECRET', 'MESSAGE_SECRET', 'QUERY_SECRET']
  const sample = JSON.stringify({
    signal: 'log', name: 'finished', body: secrets[0], attributes: {
      'gen_ai.prompt': secrets[1], 'request.content': secrets[2], message: secrets[3], 'db.query.text': secrets[4], 'service.name': 'api'
    }
  })
  const { result, report } = reportFor({ sample })
  assert.equal(report.privacy.sensitive_fields_redacted, 5)
  assert.equal(report.privacy.sensitive_fields_included, false)
  assert.equal(report.privacy.sample_persisted, false)
  for (const secret of secrets) assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret))
})

test('@claim:sensitive-opt-in includes sensitive fields only in the in-memory estimate', () => {
  const sample = JSON.stringify({ signal: 'log', name: 'finished', body: 'private-body', attributes: { 'gen_ai.prompt': 'private-prompt' } })
  const standard = reportFor({ sample }).report
  const allowed = reportFor({ sample }, { allowSensitive: true }).report
  assert.equal(allowed.privacy.sensitive_fields_redacted, 0)
  assert.equal(allowed.privacy.sensitive_fields_included, true)
  assert.equal(allowed.privacy.sample_persisted, false)
  assert.ok(allowed.proposed.monthly_ingest_gib > standard.proposed.monthly_ingest_gib)
})

test('@claim:no-persistence writes no check output files and removes its demo workspace', () => {
  const dir = sandbox()
  writeFileSync(join(dir, 'existing.txt'), 'keep')
  const prepared = prepare({ sample: '{"signal":"span","name":"checkout"}' })
  const checkDirectoryBefore = readdirSync(prepared.dir).sort()
  const check = run(checkArgs(prepared.paths), { cwd: prepared.dir })
  assert.equal(check.status, 0, check.stderr)
  assert.deepEqual(readdirSync(prepared.dir).sort(), checkDirectoryBefore)

  const before = readdirSync(dir).sort()
  const result = run(['demo'], { cwd: dir })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(readdirSync(dir).sort(), before)
  const match = result.stdout.match(/Temporary sample directory: (.+) \(removed when this run ends\)\./)
  assert.ok(match, result.stdout)
  assert.equal(existsSync(match[1]), false)
  assert.equal(readFileSync(join(dir, 'existing.txt'), 'utf8'), 'keep')
})

test('@claim:no-network completes with network system calls blocked', () => {
  if (process.platform !== 'linux') return
  const dir = sandbox()
  const source = join(dir, 'network-guard.c')
  const library = join(dir, 'network-guard.so')
  const marker = join(dir, 'network-attempted')
  writeFileSync(source, `#include <errno.h>
#include <fcntl.h>
#include <stdlib.h>
#include <sys/socket.h>
#include <unistd.h>
static void mark(void) { const char *p = getenv("NETWORK_GUARD_LOG"); if (p) { int f = open(p, O_CREAT|O_WRONLY, 0600); if (f >= 0) close(f); } }
int socket(int domain, int type, int protocol) { (void)domain; (void)type; (void)protocol; mark(); errno = EPERM; return -1; }
int connect(int fd, const struct sockaddr *addr, socklen_t len) { (void)fd; (void)addr; (void)len; mark(); errno = EPERM; return -1; }
`)
  const compile = spawnSync('cc', ['-shared', '-fPIC', source, '-o', library], { encoding: 'utf8' })
  assert.equal(compile.status, 0, compile.stderr)
  const result = run(['demo'], { env: { ...process.env, LD_PRELOAD: library, NETWORK_GUARD_LOG: marker } })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(existsSync(marker), false, 'the CLI attempted a network system call')
})

test('@claim:modeled-processors applies attribute actions, strict and regexp filters, sampling, and duplicate pipelines', () => {
  const filterSample = [
    { signal: 'span', name: 'keep-span' }, { signal: 'span', name: 'drop-span' },
    { signal: 'log', name: 'keep-log', attributes: { level: 'info' } }, { signal: 'log', name: 'drop-log', attributes: { level: 'debug' } },
    { signal: 'metric', name: 'keep.metric' }, { signal: 'metric', name: 'drop.metric' }
  ].map(JSON.stringify).join('\n')
  const filters = `processors:
  filter/include:
    spans:
      include: { match_type: strict, span_names: [keep-span, drop-span] }
    logs:
      include:
        match_type: regexp
        attributes: [{ key: level, value: 'info|debug' }]
  filter/strict:
    spans:
      exclude: { match_type: strict, span_names: [drop-span] }
    logs:
      exclude:
        match_type: strict
        attributes: [{ key: level, value: debug }]
  filter/regexp:
    metrics:
      exclude: { match_type: regexp, metric_names: ['^drop\\.'] }
service:
  pipelines:
    traces: { processors: [filter/include, filter/strict] }
    logs: { processors: [filter/include, filter/strict] }
    metrics: { processors: [filter/regexp] }
`
  const filtered = reportFor({ sample: filterSample, baseline: filters }).report.proposed
  assert.equal(filtered.observed_records, 3)

  const actionSample = [
    { signal: 'metric', name: 'requests', attributes: { existing: 'A', mutable: 'x', remove: 'yes', hashme: 'alpha' } },
    { signal: 'metric', name: 'requests', attributes: { existing: 'B', mutable: 'y', remove: 'yes', hashme: 'beta' } }
  ].map(JSON.stringify).join('\n')
  const actions = `processors:
  attributes/all:
    actions:
      - { key: inserted, action: insert, value: fixed }
      - { key: existing, action: insert, value: ignored }
      - { key: existing, action: upsert, value: fixed }
      - { key: mutable, action: update, value: fixed }
      - { key: missing, action: update, value: ignored }
      - { key: remove, action: delete }
      - { key: hashme, action: hash }
  resource/all:
    actions:
      - { key: resource.team, action: insert, value: payments }
service:
  pipelines:
    metrics: { processors: [attributes/all, resource/all] }
    metrics/copy: { processors: [attributes/all, resource/all] }
`
  const actionReport = reportFor({ sample: actionSample, baseline: actions }).report.proposed
  assert.equal(actionReport.observed_records, 4, 'the second pipeline duplicates the modeled output')
  assert.equal(actionReport.max_attribute_cardinality, 2, 'ordered actions collapse and retain the expected values')

  const samplingSample = Array.from({ length: 8 }, (_, index) => JSON.stringify({ signal: 'span', name: `span-${index}` })).join('\n')
  const sampling = `processors:
  probabilistic_sampler/quarter: { sampling_percentage: 25 }
service:
  pipelines:
    traces: { processors: [probabilistic_sampler/quarter] }
`
  assert.equal(reportFor({ sample: samplingSample, baseline: sampling }).report.proposed.observed_records, 2)
})

test('@claim:unsupported-processors warns and leaves volume unchanged', () => {
  const sample = '{"signal":"span","name":"checkout"}'
  const unsupported = `processors:
  tail_sampling/guard: {}
service:
  pipelines:
    traces: { processors: [tail_sampling/guard] }
`
  const { report } = reportFor({ sample, baseline: passThrough, proposed: unsupported })
  assert.deepEqual(report.proposed, report.baseline)
  assert.ok(report.warnings.some((warning) => warning.includes('tail_sampling/guard') && warning.includes('volume-neutral')))
})

test('@claim:semantic-conventions measures old and new OpenTelemetry attribute names', () => {
  const sample = [
    { signal: 'metric', name: 'requests', attributes: { 'http.method': 'GET' } },
    { signal: 'metric', name: 'requests', attributes: { 'http.method': 'POST' } },
    { signal: 'metric', name: 'requests', attributes: { 'http.request.method': 'GET' } },
    { signal: 'metric', name: 'requests', attributes: { 'http.request.method': 'POST' } }
  ].map(JSON.stringify).join('\n')
  const estimate = reportFor({ sample }).report.proposed
  assert.equal(estimate.observed_records, 4)
  assert.equal(estimate.max_attribute_cardinality, 2)
  assert.equal(estimate.active_metric_series, 10)
})

test('@claim:bounded-samples rejects more than 100 MiB or 1,000,000 records', async () => {
  const dir = sandbox()
  const oversized = join(dir, 'oversized.json')
  const fd = openSync(oversized, 'w')
  closeSync(fd)
  truncateSync(oversized, 100 * 1024 * 1024 + 1)
  const common = { baseline: fixture('collector-baseline.yaml'), proposed: fixture('collector-baseline.yaml'), budget: fixture('budget.toml') }
  const sizeResult = run(checkArgs({ sample: oversized, ...common, json: false }))
  assert.equal(sizeResult.status, 1)
  assert.match(sizeResult.stderr, /100 MiB safety limit/)

  const tooMany = join(dir, 'too-many.jsonl')
  const stream = createWriteStream(tooMany)
  const chunk = '{"signal":"log","name":"x"}\n'.repeat(10_000)
  for (let index = 0; index < 100; index += 1) {
    if (!stream.write(chunk)) await new Promise((resolveWrite) => stream.once('drain', resolveWrite))
  }
  stream.write('{"signal":"log","name":"x"}\n')
  await new Promise((resolveEnd) => stream.end(resolveEnd))
  assert.ok(statSync(tooMany).size < 100 * 1024 * 1024)
  const countResult = run(checkArgs({ sample: tooMany, ...common, json: false }))
  assert.equal(countResult.status, 1)
  assert.match(countResult.stderr, /more than 1000000 records/)
})

test('@claim:clean-install packages one binary whose bundled demo needs no repository files', () => {
  const packaged = spawnSync('cargo', ['package', '--manifest-path', 'crates/telemetry-budget-guard/Cargo.toml', '--locked', '--allow-dirty'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  assert.equal(packaged.status, 0, packaged.stderr)
  const archive = resolve(root, 'target', 'package', 'telemetry-budget-guard-0.1.0.crate')
  assert.ok(existsSync(archive))
  const dir = sandbox()
  const unpack = spawnSync('tar', ['-xzf', archive, '-C', dir], { encoding: 'utf8' })
  assert.equal(unpack.status, 0, unpack.stderr)
  const packageDir = join(dir, 'telemetry-budget-guard-0.1.0')
  const installRoot = join(dir, 'installed')
  const install = spawnSync('cargo', ['install', '--path', packageDir, '--root', installRoot, '--locked', '--offline'], { cwd: dir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  assert.equal(install.status, 0, install.stderr)
  const installedNames = readdirSync(join(installRoot, 'bin'))
  assert.deepEqual(installedNames, [basename(binary)])
  const rustVersion = spawnSync('rustc', ['--version'], { encoding: 'utf8' })
  assert.equal(rustVersion.status, 0, rustVersion.stderr)
  assert.doesNotMatch(rustVersion.stdout, /nightly|dev/i)
  const installedBinary = join(installRoot, 'bin', basename(binary))
  const demo = spawnSync(installedBinary, ['demo'], { cwd: dir, encoding: 'utf8' })
  assert.equal(demo.status, 0, demo.stderr)
  assert.match(demo.stdout, /Demo outcome: budget failure expected/)
})

test('@claim:free-mit-no-account exposes an MIT package and runs without account setup', () => {
  const metadata = spawnSync('cargo', ['metadata', '--format-version=1', '--no-deps'], { cwd: root, encoding: 'utf8' })
  assert.equal(metadata.status, 0, metadata.stderr)
  const packageData = JSON.parse(metadata.stdout).packages.find(({ name }) => name === 'telemetry-budget-guard')
  assert.equal(packageData.license, 'MIT')
  const demo = run(['demo'])
  assert.equal(demo.status, 0, demo.stderr)
  assert.doesNotMatch(demo.stdout + demo.stderr, /sign in|account|token|api key/i)
})

test('@claim:cardinality-estimator reports exact sampled values and deterministic unseen-series projection', () => {
  const sample = [
    { signal: 'metric', name: 'requests', attributes: { route: '/a' } },
    { signal: 'metric', name: 'requests', attributes: { route: '/b' } },
    { signal: 'metric', name: 'requests', attributes: { route: '/c' } },
    { signal: 'metric', name: 'requests', attributes: { route: '/c' } }
  ].map(JSON.stringify).join('\n')
  const estimate = reportFor({ sample }).report.proposed
  assert.equal(estimate.max_attribute_cardinality, 3)
  assert.equal(estimate.highest_cardinality_attribute, 'route')
  assert.equal(estimate.active_metric_series, 5)
})

test('@claim:otlp-collector-e2e handles the shipped full OTLP envelope and Collector YAML', () => {
  const result = run(checkArgs({
    sample: fixture('otlp-sample.json'), baseline: fixture('collector-baseline.yaml'),
    proposed: fixture('collector-proposed.yaml'), budget: fixture('budget.toml')
  }))
  assert.equal(result.status, 2)
  const report = JSON.parse(result.stdout)
  assert.equal(report.baseline.observed_records, 5)
  assert.equal(report.proposed.observed_records, 7)
  assert.equal(report.privacy.sensitive_fields_redacted, 3)
  assert.equal(report.warnings.length, 0)
})
