import { copyFile, mkdir } from 'node:fs/promises'

await mkdir(new URL('../dist/', import.meta.url), { recursive: true })
await copyFile(new URL('../src/windows-spool.ps1', import.meta.url), new URL('../dist/windows-spool.ps1', import.meta.url))
