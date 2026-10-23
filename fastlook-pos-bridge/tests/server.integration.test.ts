import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'

const token = 'token-de-integracion-32-caracteres-seguro'
const origin = 'https://fastlook-app.vercel.app'

test('servidor empaquetado escucha en loopback, autentica y permite Vercel', async () => {
  const temporaryDir = await mkdtemp(join(tmpdir(), 'fastlook-pos-bridge-'))
  const configPath = join(temporaryDir, 'config.json')
  await writeFile(configPath, JSON.stringify({
    port: 17891,
    token,
    allowedOrigins: [origin],
    printer: { name: 'IMPRESORA-INEXISTENTE-PRUEBA', widthMm: 58, charactersPerLine: 32, encoding: 'windows-1252', profile: 'escpos-generic' },
    drawer: { enabled: false, pin: 0, pulseOnMs: 100, pulseOffMs: 200 },
  }))

  const serverPath = new URL('../dist/server.js', import.meta.url)
  const child = spawn(process.execPath, [serverPath.pathname.slice(1)], {
    cwd: temporaryDir,
    env: { ...process.env, FASTLOOK_POS_CONFIG: configPath },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('TIMEOUT_INICIANDO_BRIDGE')), 5000)
      child.once('exit', (code) => reject(new Error(`BRIDGE_TERMINO_${code}`)))
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes('"event":"ready"')) { clearTimeout(timeout); resolve() }
      })
    })

    const response = await fetch('http://127.0.0.1:17891/status', {
      headers: { Origin: origin, 'X-FastLook-POS-Token': token },
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
    const status = await response.json() as { bridgeDisponible: boolean; impresoraDisponible: boolean }
    assert.equal(status.bridgeDisponible, true)
    assert.equal(status.impresoraDisponible, false)

    const preflight = await fetch('http://127.0.0.1:17891/status', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Private-Network': 'true' },
    })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true')
  } finally {
    child.kill()
    await new Promise((resolve) => child.once('exit', resolve))
    await rm(temporaryDir, { recursive: true, force: true })
  }
})
