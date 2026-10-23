import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const manager = readFileSync(new URL('../windows/manage.ps1', import.meta.url), 'utf8')
const launcher = readFileSync(new URL('../windows/run-hidden.vbs', import.meta.url), 'utf8')
const builder = readFileSync(new URL('../scripts/build-windows-package.ps1', import.meta.url), 'utf8')
const installer = readFileSync(new URL('../windows/install.cmd', import.meta.url), 'utf8')
const updater = readFileSync(new URL('../windows/update.cmd', import.meta.url), 'utf8')

test('paquete nunca copia config.json', () => {
  assert.doesNotMatch(builder, /Copy-Item[^\r\n]+config\.json/i)
  assert.match(builder, /runtime\\node\.exe/)
})

test('instalacion permite solo el origen de produccion esperado', () => {
  assert.match(manager, /https:\/\/fastlook-app\.vercel\.app/)
  assert.match(manager, /port = 17891/)
})

test('launcher usa runtime local y configuracion local', () => {
  assert.match(launcher, /runtime\\node\.exe/)
  assert.match(launcher, /FASTLOOK_POS_CONFIG/)
  assert.match(launcher, /config\.json/)
  assert.match(launcher, /WScript\.ScriptFullName/)
  assert.match(launcher, /bridge\.log/)
})

test('configuracion protege el archivo y genera token criptografico', () => {
  assert.match(manager, /SetAccessRuleProtection\(\$true, \$false\)/)
  assert.match(manager, /RandomNumberGenerator/)
  assert.match(manager, /GetBytes\(\$bytes\)/)
  assert.match(manager, /\[byte\[\]\]::new\(32\)/)
})

test('wrappers evitan comilla literal despues de la barra final de dp0', () => {
  assert.match(installer, /-SourceRoot "%~dp0\."/)
  assert.match(updater, /-SourceRoot "%~dp0\."/)
  assert.doesNotMatch(installer, /-SourceRoot "%~dp0"/)
})

test('instalador diagnostica y resuelve rutas existentes literalmente', () => {
  assert.match(manager, /SourceRoot recibido/)
  assert.match(manager, /Resolve-Path -LiteralPath/)
  assert.match(manager, /GetInvalidPathChars/)
})
