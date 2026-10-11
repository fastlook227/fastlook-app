import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ruta = readFileSync(new URL('../app/api/cascos/route.ts', import.meta.url), 'utf8')
const catalogo = readFileSync(new URL('../components/cascos/CatalogoCascos.tsx', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../fastlook_fix_rls_cascos_imagenes.sql', import.meta.url), 'utf8')

test('la edición usa RPC autenticado y no service role', () => {
  assert.match(ruta, /cliente\.rpc\('actualizar_casco_admin'/)
  assert.doesNotMatch(ruta, /SUPABASE_SERVICE_ROLE_KEY|obtenerSupabaseAdmin/)
  assert.match(ruta, /Authorization: request\.headers\.get\('authorization'\)/)
})

test('el RPC exige Admin activo y conserva RLS de la tabla', () => {
  assert.match(sql, /security definer/)
  assert.match(sql, /u\.activo = true and u\.rol = 'Admin'/)
  assert.match(sql, /auth\.uid\(\)/)
  assert.doesNotMatch(sql, /disable row level security|grant .* on public\.productos/i)
  assert.match(sql, /grant execute .* to authenticated/)
})

test('el RPC actualiza original y miniatura de forma atómica', () => {
  assert.match(sql, /imagen_url =/)
  assert.match(sql, /imagen_thumbnail_url =/)
  assert.match(sql, /for update/)
  assert.match(sql, /pg_advisory_xact_lock/)
})

test('los archivos nuevos se limpian ante rechazo confirmado', () => {
  assert.match(catalogo, /respuestaRecibida/)
  assert.match(catalogo, /storage\.from\('productos'\)\.remove\(rutasNuevas\)/)
  assert.match(catalogo, /fotografía anterior permanece sin cambios/)
})

test('distingue subida, actualización y error de permisos', () => {
  assert.match(catalogo, /Falló la subida de la fotografía/)
  assert.match(catalogo, /Supabase rechazó la actualización del producto/)
  assert.match(ruta, /etapa: error\.etapa, codigo: error\.codigo/)
})
