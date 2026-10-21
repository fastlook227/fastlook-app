import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { diaSemanaLocal, domingoDeSemana, filtrarTareasTianguis, rutaFotoTianguisValida, tianguisDebeIrPrimero } from '../utils/tianguis.ts'

const sql = readFileSync(new URL('../fastlook_modulo_cajas_tianguis.sql', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/tianguis/route.ts', import.meta.url), 'utf8')
const fotos = readFileSync(new URL('../app/api/tianguis/fotos/route.ts', import.meta.url), 'utf8')
const navegacion = readFileSync(new URL('../lib/navegacion/configuracion.ts', import.meta.url), 'utf8')

test('la semana usa domingo de America/Mexico_City y cada semana inicia independiente', () => {
  assert.equal(domingoDeSemana('2026-10-19'), '2026-10-25')
  assert.equal(domingoDeSemana('2026-10-25'), '2026-10-25')
  assert.match(sql, /unique \(semana_domingo, producto_id\)/)
  assert.match(sql, /on conflict \(semana_domingo,producto_id\) do nothing/)
  assert.match(sql, /completada_at timestamptz/)
})

test('sólo KIKEADMIN modifica la lista maestra y elimina fotos', () => {
  assert.match(sql, /guardar_producto_tianguis[\s\S]*exigir_kikeadmin_tianguis/)
  assert.match(sql, /retirar_producto_tianguis[\s\S]*exigir_kikeadmin_tianguis/)
  assert.match(api, /exigirKikeadminNomina/)
  assert.match(fotos, /DELETE[\s\S]*exigirKikeadminNomina/)
})

test('empleados autenticados completan tareas sin duplicarlas', () => {
  assert.match(sql, /marcar_tarea_tianguis[\s\S]*exigir_usuario_tianguis/)
  assert.match(sql, /for update/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.doesNotMatch(sql, /grant .* to anon/i)
})

test('historial usa snapshots y retirar un maestro no borra tareas', () => {
  assert.match(sql, /nombre_snapshot/)
  assert.match(sql, /retirado_at/)
  assert.match(sql, /delete from public\.tianguis_tareas_semanales[\s\S]*semana_domingo=public\.domingo_semana_tianguis[\s\S]*completada_at is null/)
  assert.match(sql, /HISTORIAL_PROTEGIDO/)
})

test('navegación mueve el módulo sólo sábado y domingo', () => {
  assert.equal(diaSemanaLocal('2026-10-24'), 6)
  assert.equal(tianguisDebeIrPrimero('2026-10-24'), true)
  assert.equal(tianguisDebeIrPrimero('2026-10-25'), true)
  assert.equal(tianguisDebeIrPrimero('2026-10-26'), false)
  assert.match(navegacion, /\[0, 6\]\.includes\(dia\)/)
})

test('búsqueda tolera acentos y listas largas', () => {
  const tareas = Array.from({ length: 1000 }, (_, i) => ({ nombre: i === 777 ? 'Piñón reforzado' : `Producto ${i}` }))
  assert.deepEqual(filtrarTareasTianguis(tareas, 'pinon'), [{ nombre: 'Piñón reforzado' }])
})

test('fotografías privadas pertenecen a semana, usuario y operación', () => {
  assert.equal(rutaFotoTianguisValida('2026-10-25/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/foto.webp'), true)
  assert.match(sql, /'tianguis-sobrantes'[\s\S]*false/)
  assert.match(sql, /semana_domingo in \(v_semana,v_semana-7\)/)
  assert.match(fotos, /verificar_foto_tianguis/)
})

test('el módulo no escribe inventario ni ventas', () => {
  assert.doesNotMatch(sql, /insert into public\.(productos|ventas)|update public\.(productos|ventas)|delete from public\.(productos|ventas)/i)
})
