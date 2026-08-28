import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'
import { createServer } from 'vite'

let browser
let server
let siteUrl

before(async () => {
  server = await createServer({
    configFile: new URL('../vite.config.ts', import.meta.url).pathname,
    server: { host: '127.0.0.1' }
  })
  await server.listen()
  siteUrl = server.resolvedUrls.local[0]
  browser = await chromium.launch({ headless: true })
})

after(async () => {
  await browser?.close()
  await server?.close()
})

for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['390px mobile', { width: 390, height: 844 }]
]) {
  test(`${name} browser flow is keyboard-accessible, private, and free of serious axe findings`, async () => {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    const requests = []
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', error => pageErrors.push(String(error)))
    page.on('request', request => requests.push(request.url()))

    try {
      await page.goto(siteUrl, { waitUntil: 'networkidle' })
      assert.match(await page.title(), /Telemetry Budget Guard/)
      assert.equal(await page.locator('main').count(), 1)
      assert.equal(await page.locator('h1').count(), 1)

      await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Skip to main content')
      await page.keyboard.press('Enter')
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'main')

      await page.locator('#limit').fill('10000')
      await page.locator('#estimate-form').evaluate(form => form.requestSubmit())
      await page.waitForFunction(() => document.querySelector('#status-badge')?.textContent === 'PASS')

      const axe = await new AxeBuilder({ page }).analyze()
      assert.equal(axe.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical').length, 0, JSON.stringify(axe.violations))
      assert.deepEqual(consoleErrors, [])
      assert.deepEqual(pageErrors, [])
      assert.ok(requests.every(url => new URL(url).origin === new URL(siteUrl).origin), `Unexpected request: ${requests.join(', ')}`)
    } finally {
      await context.close()
    }
  })
}
