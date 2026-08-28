import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from 'playwright'

const page = await readFile(new URL('../index.html', import.meta.url), 'utf8')

test('skip link transfers keyboard focus into the main landmark', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const browserPage = await browser.newPage()
    await browserPage.setContent(page)

    await browserPage.keyboard.press('Tab')
    await expectActiveElement(browserPage, 'A', 'Skip to main content')
    await browserPage.keyboard.press('Enter')

    assert.equal(await browserPage.evaluate(() => document.activeElement?.id), 'main')
  } finally {
    await browser.close()
  }
})

async function expectActiveElement(browserPage, tagName, text) {
  assert.deepEqual(await browserPage.evaluate(() => ({
    tagName: document.activeElement?.tagName,
    text: document.activeElement?.textContent?.trim()
  })), { tagName, text })
}
