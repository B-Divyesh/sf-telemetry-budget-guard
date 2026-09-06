import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const claims = JSON.parse(await readFile(new URL('../../.factory/claims.json', import.meta.url), 'utf8'))
const testSources = await Promise.all([
  readFile(new URL('./claims.cli.test.mjs', import.meta.url), 'utf8'),
  readFile(new URL('./claims.browser.test.mjs', import.meta.url), 'utf8')
])

test('every registered public claim has one outcome test and no claim test is unregistered', () => {
  assert.equal(claims.length, 21)
  assert.equal(new Set(claims.map(({ id }) => id)).size, claims.length)
  const registered = new Set(claims.map(({ id }) => id))
  const tagged = testSources.flatMap((source) => [...source.matchAll(/test\('@claim:([a-z0-9-]+)\b/g)].map((match) => match[1]))
  assert.equal(new Set(tagged).size, tagged.length, 'each claim tag must occur exactly once')
  assert.deepEqual([...new Set(tagged)].sort(), [...registered].sort())
  for (const claim of claims) {
    assert.equal(claim.test, `npm run test:claim -- ${claim.id}`)
    assert.ok(claim.claim.length > 0)
    assert.ok(claim.where.length > 0)
    assert.ok(claim.sandbox.length > 0)
  }
})
