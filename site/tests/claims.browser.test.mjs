import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test, { after, before } from 'node:test'
import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'
import { build, preview } from 'vite'

const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url))
let browser
let server
let siteUrl

before(async () => {
  await build({ configFile, logLevel: 'silent' })
  server = await preview({ configFile, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' })
  siteUrl = server.resolvedUrls.local[0].replace(/\/$/, '')
  browser = await chromium.launch({ headless: true })
})

after(async () => {
  await browser?.close()
  await server?.httpServer.close()
})

async function trackedPage(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const requests = []
  const consoleErrors = []
  const pageErrors = []
  page.on('request', (request) => requests.push(request.url()))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  return { context, page, requests, consoleErrors, pageErrors }
}

async function storageSnapshot(page) {
  return page.evaluate(async () => {
    const cacheNames = await caches.keys()
    const cacheEntries = (await Promise.all(cacheNames.map(async (name) => {
      const cache = await caches.open(name)
      const requests = await cache.keys()
      return Promise.all(requests.map(async (request) => {
        const response = await cache.match(request)
        const body = response ? await response.clone().text() : ''
        return { url: request.url, containsPrivateInput: body.includes('PRIVATE_BROWSER_SAMPLE_42') }
      }))
    }))).flat()
    return {
      local: { ...localStorage },
      session: { ...sessionStorage },
      cookies: document.cookie,
      indexedDbNames: (await indexedDB.databases()).map(({ name }) => name),
      cacheEntries
    }
  })
}

test('@claim:browser-local-private checks pasted telemetry without uploads or browser storage', async () => {
  const state = await trackedPage()
  try {
    await state.page.goto(`${siteUrl}/demo/`, { waitUntil: 'networkidle' })
    await state.page.locator('#sample').fill('{"signal":"log","name":"done","body":"PRIVATE_BROWSER_SAMPLE_42","attributes":{"gen_ai.prompt":"secret"}}')
    await state.page.locator('#limit').fill('10000')
    await state.page.locator('#estimate-form').evaluate((form) => form.requestSubmit())
    await state.page.waitForFunction(() => document.querySelector('#redacted-count')?.textContent === '2 sensitive fields dropped')
    assert.ok(state.requests.every((url) => new URL(url).origin === new URL(siteUrl).origin), state.requests.join('\n'))
    const storage = await storageSnapshot(state.page)
    assert.deepEqual(storage.local, {})
    assert.deepEqual(storage.session, {})
    assert.equal(storage.cookies, '')
    assert.deepEqual(storage.indexedDbNames, [])
    assert.ok(storage.cacheEntries.every(({ url, containsPrivateInput }) => new URL(url).origin === new URL(siteUrl).origin && !containsPrivateInput))
    assert.deepEqual(state.consoleErrors, [])
    assert.deepEqual(state.pageErrors, [])
  } finally {
    await state.context.close()
  }
})

test('@claim:site-no-tracking loads every site route without analytics, cookies, third-party scripts, or third-party fonts', async () => {
  const state = await trackedPage()
  try {
    for (const route of ['/', '/demo/', '/privacy/', '/terms/', '/404.html']) {
      await state.page.goto(`${siteUrl}${route}`, { waitUntil: 'networkidle' })
      assert.equal(await state.page.locator('main').count(), 1, route)
      assert.equal(await state.page.locator('h1').count(), 1, route)
    }
    assert.ok(state.requests.length > 0)
    assert.ok(state.requests.every((url) => new URL(url).origin === new URL(siteUrl).origin), state.requests.join('\n'))
    assert.equal(await state.context.cookies().then((cookies) => cookies.length), 0)
    const storage = await storageSnapshot(state.page)
    assert.deepEqual(storage.local, {})
    assert.deepEqual(storage.session, {})
    assert.equal(storage.cookies, '')
    assert.deepEqual(storage.indexedDbNames, [])
    assert.ok(storage.cacheEntries.every(({ url }) => new URL(url).origin === new URL(siteUrl).origin))
    assert.deepEqual(state.consoleErrors, [])
    assert.deepEqual(state.pageErrors, [])
  } finally {
    await state.context.close()
  }
})

test('@claim:offline-reload reloads the populated sample offline after one online visit', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' })
  try {
    const page = await context.newPage()
    await page.goto(`${siteUrl}/demo/`, { waitUntil: 'networkidle' })
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
    await context.setOffline(true)
    const response = await page.reload({ waitUntil: 'domcontentloaded' })
    assert.equal(response?.status(), 200)
    await page.waitForFunction(() => document.querySelector('#status-badge')?.textContent === 'FAIL')
    assert.equal(await page.locator('.demo-banner strong').textContent(), 'Demo — sample data, nothing is saved')
    assert.match(await page.locator('#before-ingest').textContent(), /MiB|GiB/)
    assert.equal(await page.locator('#offline').isVisible(), true)
  } finally {
    await context.close()
  }
})

test('@claim:demo-sandbox opens in one click, shows populated output, resets fully, and leaves real storage unchanged', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    const page = await context.newPage()
    await page.goto(siteUrl, { waitUntil: 'networkidle' })
    await page.evaluate(() => localStorage.setItem('real:keep', 'unchanged'))
    await page.getByRole('link', { name: 'Try it with sample data' }).click()
    await page.waitForURL('**/demo/')
    assert.equal(await page.locator('.demo-banner').isVisible(), true)
    assert.equal(await page.locator('#status-badge').textContent(), 'FAIL')
    assert.notEqual(await page.locator('#before-ingest').textContent(), '—')

    await page.locator('#sample').fill('{"signal":"metric","name":"custom","attributes":{"route":"/custom"}}')
    await page.locator('#window').fill('120')
    await page.locator('#replicas').fill('8')
    await page.locator('#limit').fill('9999')
    await page.locator('#estimate-form').evaluate((form) => form.requestSubmit())
    await page.waitForFunction(() => document.querySelector('#status-badge')?.textContent === 'PASS')
    await page.getByRole('button', { name: 'Reset demo', exact: true }).first().click()
    await page.waitForFunction(() => document.querySelector('#status-badge')?.textContent === 'FAIL')
    assert.equal(await page.locator('#window').inputValue(), '60')
    assert.equal(await page.locator('#replicas').inputValue(), '2')
    assert.equal(await page.locator('#limit').inputValue(), '20')
    assert.equal(await page.locator('#redacted-count').textContent(), '3 sensitive fields dropped')
    assert.equal(await page.evaluate(() => localStorage.getItem('real:keep')), 'unchanged')
    assert.equal(await page.evaluate(() => [...Object.keys(localStorage)].filter((key) => key.startsWith('demo:')).length), 0)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    assert.equal(await page.locator('.demo-banner').evaluate((element) => Math.round(element.getBoundingClientRect().top)), 0)
    await page.getByRole('link', { name: 'Start for real' }).click()
    await page.waitForURL('**/#install')

    await page.goto(`${siteUrl}/?demo=1`)
    await page.waitForURL('**/demo/')
    assert.equal(await page.locator('.demo-banner strong').textContent(), 'Demo — sample data, nothing is saved')
  } finally {
    await context.close()
  }
})

test('first screen states the job, audience, action, and three facts before scrolling', async () => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport })
    try {
      const page = await context.newPage()
      await page.goto(siteUrl, { waitUntil: 'networkidle' })
      assert.equal(await page.locator('h1').textContent(), 'Check OpenTelemetry changes against your budget')
      assert.match(await page.locator('.lede').textContent(), /engineers adding OpenTelemetry to a small service/)
      assert.equal(await page.getByRole('link', { name: 'Try it with sample data' }).count(), 1)
      assert.equal(await page.locator('.trust-list li').count(), 3)
      for (const selector of ['h1', '.lede', '.hero-actions', '.trust-list']) {
        const box = await page.locator(selector).boundingBox()
        assert.ok(box && box.y + box.height <= viewport.height, `${selector} is below ${viewport.width}x${viewport.height}: ${JSON.stringify(box)}`)
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width)
    } finally {
      await context.close()
    }
  }
})

test('demo handles keyboard, invalid, boundary, recovery, focus, and reduced-motion paths', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  try {
    const page = await context.newPage()
    await page.goto(`${siteUrl}/demo/`, { waitUntil: 'networkidle' })
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Skip to main content')
    await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'main')

    await page.locator('#sample').fill('{bad')
    await page.locator('#estimate-form').evaluate((form) => form.requestSubmit())
    await page.waitForFunction(() => !document.querySelector('#sample-error')?.hasAttribute('hidden'))
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'sample')
    assert.equal(await page.locator('#sample').getAttribute('aria-invalid'), 'true')

    await page.locator('#window').fill('0')
    await page.locator('#sample').fill('{"signal":"span","name":"valid"}')
    await page.locator('#estimate-form').evaluate((form) => form.requestSubmit())
    await page.waitForFunction(() => document.querySelector('#sample-error')?.textContent?.includes('Sample window'))
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'window')

    await page.locator('#window').fill('60')
    await page.locator('#limit').fill('10000')
    await page.locator('#estimate-form').evaluate((form) => form.requestSubmit())
    await page.waitForFunction(() => document.querySelector('#status-badge')?.textContent === 'PASS')
    const duration = await page.locator('.button').first().evaluate((element) => getComputedStyle(element).transitionDuration)
    assert.match(duration, /0\.00001s|1e-05s|0s/)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390)
  } finally {
    await context.close()
  }
})

test('all routes have metadata, shared structure, accessible controls, and a styled 404', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } })
  try {
    const page = await context.newPage()
    const expected = new Map([
      ['/', 'Telemetry Budget Guard — Check OpenTelemetry budgets'],
      ['/demo/', 'Demo — Telemetry Budget Guard'],
      ['/privacy/', 'Privacy — Telemetry Budget Guard'],
      ['/terms/', 'Terms — Telemetry Budget Guard'],
      ['/404.html', 'Page not found — Telemetry Budget Guard']
    ])
    for (const [route, title] of expected) {
      await page.goto(`${siteUrl}${route}`, { waitUntil: 'networkidle' })
      assert.equal(await page.title(), title)
      assert.ok(title.length <= 60, `${route} title is ${title.length} characters`)
      assert.equal(await page.locator('html').getAttribute('lang'), 'en')
      assert.equal(await page.locator('h1').count(), 1)
      assert.equal(await page.locator('main').count(), 1)
      assert.equal(await page.locator('header nav').count(), 1)
      assert.equal(await page.locator('footer').getByText(/Built by Param Factory/).count(), 1)
      assert.equal(await page.locator('link[rel="canonical"]').count(), 1)
      assert.equal(await page.locator('meta[property="og:image"]').count(), 1)
      assert.equal(await page.locator('link[rel="apple-touch-icon"]').count(), 1)
      const description = await page.locator('meta[name="description"]').getAttribute('content')
      assert.ok(description && description.length <= 155, `${route} description is ${description?.length} characters`)
      assert.deepEqual(await page.locator('header nav a').allTextContents(), ['Demo', 'How it works', 'Privacy'])
      const axe = await new AxeBuilder({ page }).analyze()
      assert.equal(axe.violations.filter(({ impact }) => ['serious', 'critical'].includes(impact)).length, 0, JSON.stringify(axe.violations))
    }
    assert.equal(await page.locator('.missing-code').textContent(), '404')

    await page.goto(`${siteUrl}/terms/`, { waitUntil: 'networkidle' })
    const legalLink = await page.getByRole('link', { name: 'MIT License (external)' }).boundingBox()
    assert.ok(legalLink && legalLink.height >= 44, JSON.stringify(legalLink))
  } finally {
    await context.close()
  }
})

test('share and touch artwork have the required binary dimensions', async () => {
  const webp = await readFile(new URL('../public/og-image.webp', import.meta.url))
  assert.equal(webp.subarray(0, 4).toString(), 'RIFF')
  assert.equal(webp.subarray(12, 16).toString(), 'VP8 ')
  assert.equal(webp.readUInt16LE(26) & 0x3fff, 1200)
  assert.equal(webp.readUInt16LE(28) & 0x3fff, 630)
  const png = await readFile(new URL('../public/apple-touch-icon.png', import.meta.url))
  assert.equal(png.readUInt32BE(16), 180)
  assert.equal(png.readUInt32BE(20), 180)
})
