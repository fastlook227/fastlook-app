import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const componente = readFileSync(new URL('../components/Faltantes.tsx', import.meta.url), 'utf8')
const migracion = readFileSync(new URL('../fastlook_fase_faltantes.sql', import.meta.url), 'utf8')

test('normaliza el nombre y rechaza texto vacío antes de insertar', () => {
  assert.match(componente, /const nombreLimpio = nombre\.trim\(\)/)
  assert.match(componente, /if \(!nombreLimpio\)/)
  assert.match(componente, /insert\(\{ nombre: nombreLimpio \}\)/)
})

test('bloquea envíos duplicados de forma síncrona', () => {
  assert.match(componente, /if \(envioEnCurso\.current\) return/)
  assert.match(componente, /envioEnCurso\.current = true/)
})

test('consulta los más recientes primero y confirma antes de borrar', () => {
  assert.match(componente, /order\('created_at', \{ ascending: false \}\)/)
  assert.match(componente, /setConfirmar\(faltante\)/)
  assert.match(componente, /role="alertdialog"/)
})

test('la tabla es independiente y RLS limita operaciones a personal activo', () => {
  assert.doesNotMatch(migracion, /references public\.productos/)
  assert.match(migracion, /enable row level security/)
  assert.match(migracion, /u\.activo = true/)
  assert.match(migracion, /u\.rol in \('Admin', 'Vendedor'\)/)
  assert.match(migracion, /for (select|insert|delete)/)
  assert.match(migracion, /revoke update/)
})

test('la autoría proviene de la sesión en la base de datos', () => {
  assert.match(migracion, /where u\.id = auth\.uid\(\)/)
  assert.match(migracion, /new\.created_by := v_usuario\.id/)
  assert.match(migracion, /new\.autor_nombre := v_usuario\.nombre/)
})
