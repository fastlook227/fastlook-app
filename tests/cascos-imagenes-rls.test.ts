import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ruta = readFileSync(new URL('../app/api/cascos/route.ts', import.meta.url), 'utf8')
const catalogo = readFileSync(new URL('../components/cascos/CatalogoCascos.tsx', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../fastlook_fix_rls_cascos_imagenes.sql', import.meta.url), 'utf8')
const sqlCrear = readFileSync(new URL('../fastlook_fix_rls_crear_casco.sql', import.meta.url), 'utf8')

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

test('la creación usa RPC autenticado en vez de INSERT directo', () => {
  assert.match(ruta, /cliente\.rpc\('crear_casco_admin'/)
  assert.doesNotMatch(ruta, /from\('productos'\)\.insert/)
  assert.match(ruta, /p_solicitud_id: entrada\.data\.solicitudId/)
})

test('crear casco acepta imagen, miniatura o ausencia de imagen', () => {
  assert.match(sqlCrear, /p_imagen_url text, p_imagen_thumbnail_url text/)
  assert.match(sqlCrear, /btrim\(coalesce\(p_imagen_url, ''\)\)/)
  assert.match(sqlCrear, /nullif\(btrim\(coalesce\(p_imagen_thumbnail_url, ''\)/)
  assert.match(catalogo, /imagen_url: subida\.imagen_url, imagen_thumbnail_url: subida\.imagen_thumbnail_url/)
})

test('crear casco exige Admin activo y no amplía permisos de productos', () => {
  assert.match(sqlCrear, /auth\.uid\(\)/)
  assert.match(sqlCrear, /u\.activo = true and u\.rol = 'Admin'/)
  assert.match(sqlCrear, /security definer/)
  assert.doesNotMatch(sqlCrear, /disable row level security|grant .* on (table )?public\.productos/i)
  assert.match(sqlCrear, /grant execute .* to authenticated/)
})

test('crear casco valida campos y rechaza código duplicado', () => {
  assert.match(sqlCrear, /p_precio is null[\s\S]*p_stock_minimo < 0/)
  assert.match(sqlCrear, /p_certificacion is null[\s\S]*Certificación inválida/)
  assert.match(sqlCrear, /CODIGO_DUPLICADO/)
  assert.match(ruta, /error\.code === '23505' \? 409/)
})

test('la creación es idempotente y serializa dobles envíos', () => {
  assert.match(sqlCrear, /solicitud_id uuid primary key/)
  assert.match(sqlCrear, /pg_advisory_xact_lock[\s\S]*p_solicitud_id/)
  assert.match(sqlCrear, /'idempotente', true/)
  assert.match(catalogo, /guardandoRef\.current/)
  assert.match(catalogo, /creacionPendienteRef\.current/)
})

test('un fallo ambiguo conserva las mismas rutas y no borra Storage', () => {
  assert.match(catalogo, /body = creacionPendienteRef\.current\.body/)
  assert.match(catalogo, /rutasNuevas = creacionPendienteRef\.current\.rutasNuevas/)
  assert.match(catalogo, /estado del servidor es incierto/)
  assert.match(catalogo, /misma operación sin crear un duplicado/)
  assert.match(catalogo, /respuestaRecibida/)
})

test('la migración no altera históricos ni permisos de vendedores', () => {
  assert.doesNotMatch(sqlCrear, /delete\s+from public\.productos|update\s+public\.productos|truncate/i)
  assert.doesNotMatch(sqlCrear, /rol\s*=\s*'Vendedor'|to anon/)
  assert.match(sqlCrear, /on delete restrict/)
})

test('la edición existente continúa usando actualizar_casco_admin', () => {
  assert.match(ruta, /entrada\.data\.operacion === 'EDITAR'[\s\S]*cliente\.rpc\('actualizar_casco_admin'/)
  assert.match(sql, /for update/)
})
