import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const id = process.argv[2]
const claims = JSON.parse(readFileSync(resolve(root, '.factory/claims.json'), 'utf8'))
const claim = claims.find((entry) => entry.id === id)

if (!claim) {
  console.error(`Unknown claim: ${id ?? '(missing)'}`)
  process.exit(1)
}

const browserClaims = new Set([
  'browser-local-private',
  'site-no-tracking',
  'offline-reload',
  'demo-sandbox'
])

if (!browserClaims.has(id)) {
  const build = spawnSync('cargo', ['build', '--locked'], { cwd: root, stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const testFile = browserClaims.has(id)
  ? 'site/tests/claims.browser.test.mjs'
  : 'site/tests/claims.cli.test.mjs'
const result = spawnSync(
  process.execPath,
  ['--test', `--test-name-pattern=@claim:${id}(?:\\s|$)`, testFile],
  { cwd: root, stdio: 'inherit' }
)

process.exit(result.status ?? 1)
