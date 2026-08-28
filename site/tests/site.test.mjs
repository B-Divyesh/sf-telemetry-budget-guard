import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const page = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8')
const script = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8')
const staticWebAppConfig = JSON.parse(await readFile(new URL('../public/staticwebapp.config.json', import.meta.url), 'utf8'))

test('landing page has required semantic landmarks and exactly one h1', () => {
  assert.match(page, /<html lang="en">/)
  assert.match(page, /<title>[^<]+<\/title>/)
  assert.equal((page.match(/<h1[ >]/g) ?? []).length, 1)
  assert.match(page, /<main id="main" tabindex="-1">/)
  assert.match(page, /class="skip-link"/)
  assert.doesNotMatch(page, /<img(?![^>]*\balt=)/)
})

test('Azure Static Web Apps configuration enforces the release response policy', () => {
  assert.deepEqual(staticWebAppConfig.globalHeaders, {
    'Content-Security-Policy': "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  })
  const immutablePaths = staticWebAppConfig.routes.map(({ route }) => route)
  assert.deepEqual(immutablePaths, [
    '/assets/*',
    '/night-market-telemetry.webp',
    '/night-market-telemetry-720.webp',
    '/favicon.svg'
  ])
  for (const entry of staticWebAppConfig.routes) {
    assert.equal(entry.headers['Cache-Control'], 'public, max-age=31536000, immutable')
  }
})

test('site supports focus, reduced motion, mobile layout, and offline feedback', () => {
  assert.match(css, /:focus-visible/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /@media \(max-width: 520px\)/)
  assert.match(script, /window\.addEventListener\('offline'/)
})

test('demo redacts known sensitive fields and does not persist input', () => {
  for (const key of ['prompt', 'body', 'content', 'message', 'query']) assert.match(script, new RegExp(`'${key}'`))
  assert.doesNotMatch(script, /localStorage|sessionStorage|fetch\(/)
})
