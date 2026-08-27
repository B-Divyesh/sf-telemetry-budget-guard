import { copyFile, mkdir } from 'node:fs/promises'

await mkdir('dist/site/download', { recursive: true })
await copyFile(
  'target/release/telemetry-budget-guard',
  'dist/site/download/telemetry-budget-guard-linux-x86_64'
)
