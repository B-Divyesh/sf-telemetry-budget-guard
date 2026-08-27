import './style.css'

type DemoRecord = {
  signal: 'span' | 'log' | 'metric'
  name: string
  body?: unknown
  attributes?: Record<string, unknown>
}

const defaultSample = [
  { signal: 'span', name: 'POST /checkout', attributes: { 'http.route': '/checkout', 'customer.id': 'c-101' } },
  { signal: 'span', name: 'GET /health', attributes: { 'http.route': '/health' } },
  { signal: 'log', name: 'checkout complete', body: 'private payload', attributes: { 'event.name': 'checkout.completed', 'gen_ai.prompt': 'private', 'customer.id': 'c-101' } },
  { signal: 'log', name: 'cache hit', body: 'private payload', attributes: { 'event.name': 'cache.hit', 'customer.id': 'c-202' } },
  { signal: 'metric', name: 'http.server.duration', attributes: { 'http.route': '/checkout', 'customer.id': 'c-101' } },
  { signal: 'metric', name: 'http.server.duration', attributes: { 'http.route': '/checkout', 'customer.id': 'c-202' } },
  { signal: 'metric', name: 'http.server.duration', attributes: { 'http.route': '/health', 'customer.id': 'c-303' } }
].map((record) => JSON.stringify(record)).join('\n')

const sensitiveParts = ['prompt', 'body', 'content', 'message', 'query']
const form = document.querySelector<HTMLFormElement>('#estimate-form')!
const sample = document.querySelector<HTMLTextAreaElement>('#sample')!
const error = document.querySelector<HTMLElement>('#sample-error')!
const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!

sample.value = defaultSample

function parseSample(): { records: DemoRecord[]; redacted: number } {
  if (!sample.value.trim()) throw new Error('Paste at least one compact JSONL record to estimate.')
  let redacted = 0
  const records = sample.value.split('\n').filter((line) => line.trim()).map((line, index) => {
    let value: DemoRecord
    try { value = JSON.parse(line) as DemoRecord } catch { throw new Error(`Line ${index + 1} is not valid JSON. Fix it and try again.`) }
    if (!['span', 'log', 'metric'].includes(value.signal) || typeof value.name !== 'string') {
      throw new Error(`Line ${index + 1} needs a signal (span, log, or metric) and a name.`)
    }
    const attributes = { ...(value.attributes ?? {}) }
    if ('body' in value) redacted += 1
    Object.keys(attributes).forEach((key) => {
      if (sensitiveParts.some((part) => key.toLowerCase().includes(part))) {
        delete attributes[key]
        redacted += 1
      }
    })
    return { signal: value.signal, name: value.name, attributes }
  })
  return { records, redacted }
}

function recordBytes(record: DemoRecord): number {
  return new TextEncoder().encode(JSON.stringify(record)).length
}

function seriesCount(records: DemoRecord[]): number {
  return new Set(records.filter((record) => record.signal === 'metric').map((record) => JSON.stringify([record.name, record.attributes]))).size
}

function setText(id: string, value: string) {
  document.querySelector<HTMLElement>(`#${id}`)!.textContent = value
}

function formatGib(value: number): string {
  if (value < 0.01) return `${(value * 1024).toFixed(1)} MiB`
  return `${value.toFixed(2)} GiB`
}

function estimate() {
  const { records, redacted } = parseSample()
  const windowSeconds = Number(new FormData(form).get('window'))
  const replicas = Number(new FormData(form).get('replicas'))
  const limit = Number(new FormData(form).get('limit'))
  if (!(windowSeconds > 0) || !(replicas > 0) || limit < 0) throw new Error('Window and replicas must be positive; the delta limit cannot be negative.')

  const baseline = records.filter((record) => record.name !== 'GET /health' && record.name !== 'cache hit').map((record) => {
    const attributes = { ...record.attributes }
    delete attributes['customer.id']
    return { ...record, attributes }
  })
  const proposed = records.map((record) => ({ ...record, attributes: { ...record.attributes, 'team.name': 'payments' } }))
  const monthScale = 2_592_000 / windowSeconds * replicas * 0.35
  const baselineBytes = baseline.reduce((sum, record) => sum + recordBytes(record) * (record.signal === 'span' ? 0.5 : 1), 0)
  const proposedBytes = proposed.reduce((sum, record) => sum + recordBytes(record), 0)
  const baselineIngest = baselineBytes * monthScale / 1_073_741_824
  const proposedIngest = proposedBytes * monthScale / 1_073_741_824
  const ingestDelta = baselineIngest ? (proposedIngest - baselineIngest) / baselineIngest * 100 : Infinity
  const baselineSeries = seriesCount(baseline)
  const proposedSeries = seriesCount(proposed)
  const seriesDelta = baselineSeries ? (proposedSeries - baselineSeries) / baselineSeries * 100 : Infinity
  const passed = ingestDelta <= limit && seriesDelta <= limit

  setText('before-ingest', formatGib(baselineIngest))
  setText('after-ingest', formatGib(proposedIngest))
  setText('delta-ingest', `${ingestDelta.toFixed(1)}%`)
  setText('before-storage', formatGib(baselineIngest * 30 / 30))
  setText('after-storage', formatGib(proposedIngest * 30 / 30))
  setText('delta-storage', `${ingestDelta.toFixed(1)}%`)
  setText('before-series', String(baselineSeries))
  setText('after-series', String(proposedSeries))
  setText('delta-series', `${seriesDelta.toFixed(1)}%`)
  setText('redacted-count', `${redacted} sensitive field${redacted === 1 ? '' : 's'} dropped`)
  const badge = document.querySelector<HTMLElement>('#status-badge')!
  badge.textContent = passed ? 'PASS' : 'FAIL'
  badge.className = passed ? 'pass' : 'fail'
  setText('result-note', passed ? `All proposed changes fit the ${limit}% change budget.` : `Proposed telemetry exceeds the ${limit}% change budget.`)
}

function runEstimate(event?: Event) {
  event?.preventDefault()
  submit.disabled = true
  submit.textContent = 'Checking…'
  error.hidden = true
  window.setTimeout(() => {
    try { estimate() } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : 'The sample could not be estimated.'
      error.hidden = false
      sample.setAttribute('aria-invalid', 'true')
      sample.focus()
    } finally {
      submit.disabled = false
      submit.textContent = 'Estimate proposed tab'
    }
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160)
}

form.addEventListener('submit', runEstimate)
sample.addEventListener('input', () => sample.removeAttribute('aria-invalid'))
document.querySelector('#reset-demo')!.addEventListener('click', () => { sample.value = defaultSample; runEstimate() })
document.querySelector('#copy-command')!.addEventListener('click', async () => {
  const command = document.querySelector('#install-command')!.textContent ?? ''
  try {
    await navigator.clipboard.writeText(command)
    setText('copy-status', 'Command copied.')
  } catch {
    setText('copy-status', 'Select the command and copy it manually.')
  }
})

function updateNetworkState() {
  document.querySelector<HTMLElement>('#offline')!.hidden = navigator.onLine
}
window.addEventListener('online', updateNetworkState)
window.addEventListener('offline', updateNetworkState)
updateNetworkState()
estimate()

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined))
}
