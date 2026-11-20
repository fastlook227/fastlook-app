import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const raiz = new URL('../', import.meta.url)
const leer = (ruta: string) => readFileSync(new URL(ruta, raiz), 'utf8')
const sql = leer('fastlook_seguridad_tablas_operativas.sql'), rollback = leer('fastlook_seguridad_tablas_operativas_rollback.sql')
const fuentes = (dir: string): string[] => readdirSync(new URL(dir, raiz)).flatMap((nombre) => {
  const ruta = join(dir, nombre)
  return statSync(new URL(ruta, raiz)).isDirectory() ? fuentes(ruta) : /\.(ts|tsx)$/.test(nombre) && !nombre.includes('.backup') ? [ruta] : []
})
const codigo = ['app', 'components', 'lib', 'utils', 'hooks'].flatMap(fuentes).filter((r) => !r.endsWith('page.backup.tsx'))

test('ninguna parte de la aplicación escribe productos, movimientos o ventas (salvo abonos) sin RPC', () => {
  for (const ruta of codigo) {
    const fuente = leer(ruta).replace(/\s+/g, ' ')
    assert.doesNotMatch(fuente, /from\('productos'\) ?\.(insert|update|upsert)\(/, ruta)
    assert.doesNotMatch(fuente, /from\('movimientos_inventario'\) ?\.(insert|update|upsert|delete)\(/, ruta)
    assert.doesNotMatch(fuente, /from\('ventas'\) ?\.(update|upsert|delete)\(/, ruta)
  }
  const inserciones = codigo.filter((ruta) => /from\('ventas'\)\s*\.insert\(/.test(leer(ruta)))
  assert.deepEqual(inserciones.map((r) => r.replace(/\\/g, '/')), ['app/page.tsx'])
  assert.match(leer('app/page.tsx'), /codigo: 'ABONO',[\s\S]{0,120}producto_id: null|producto_id: null,[\s\S]{0,60}codigo: 'ABONO'/)
})

test('el Asistente consulta productos con la sesión del usuario, nunca como anon', () => {
  const ruta = leer('app/api/asistente/interpretar/route.ts')
  for (const llamada of ['buscarProductosMasivos(ordenMasiva.filtros, clienteUsuario)', 'buscarProductoPorId(productoContextualId, rol, clienteUsuario)', 'buscarProductos(interpretacion.productoBuscado, rol, clienteUsuario)']) assert.ok(ruta.includes(llamada), llamada)
  assert.match(leer('lib/auth/servidor.ts'), /export const clienteSupabaseUsuario = \(request: Request\) => createClient\(supabaseUrl, supabaseAnonKey/)
})

test('Cascos y Asistente modifican stock, ubicación y archivado por operar_producto_admin', () => {
  assert.equal((leer('app/api/cascos/route.ts').match(/operarCasco\(cliente, producto\.id, '(SUMAR_STOCK|ARCHIVAR)'/g) || []).length, 3)
  assert.match(leer('lib/asistente/ejecutarAcciones.ts'), /rpc\('operar_producto_admin'[\s\S]*p_origen: 'ASISTENTE'/)
  assert.match(sql, /p_operacion not in \('SUMAR_STOCK','RESTAR_STOCK','CAMBIAR_UBICACION','ARCHIVAR'\)/)
  assert.match(sql, /for update;/)
  assert.match(sql, /u\.activo = true and u\.rol = 'Admin'/)
})

test('la migración retira escrituras anónimas, TRUNCATE y activa RLS sin borrar datos', () => {
  assert.match(sql, /revoke insert, update, delete, truncate on table %s from anon/)
  assert.match(sql, /revoke truncate on table %s from authenticated/)
  assert.match(sql, /alter default privileges for role postgres in schema public revoke insert, update, delete, truncate on tables from anon/)
  for (const tabla of ['productos', 'ventas', 'movimientos_inventario']) assert.match(sql, new RegExp(`alter table public\\.${tabla} enable row level security`))
  assert.match(sql, /DUENO_INCOMPATIBLE/)
  assert.match(sql, /with check \(codigo = 'ABONO' and producto_id is null and ticket_id is null/)
  assert.doesNotMatch(sql + rollback, /\b(drop table|delete from|truncate public|disable row level security\s*;)/i)
  assert.doesNotMatch(sql, /service_role|grant .* to anon/i)
})

test('el rollback restaura sólo lo respaldado y es exclusivo para emergencias', () => {
  assert.match(rollback, /SÓLO PARA EMERGENCIAS/)
  assert.match(rollback, /RESPALDO_INEXISTENTE/)
  assert.match(rollback, /v\.rls_activa = false/)
})

test('el frontend no contiene service_role ni secretos del servidor', () => {
  for (const ruta of codigo.filter((r) => !r.startsWith('app\\api') && !r.startsWith('app/api') && !r.startsWith('lib'))) assert.doesNotMatch(leer(ruta), /SUPABASE_SERVICE_ROLE_KEY|service_role|supabaseAdmin/, ruta)
  assert.match(leer('lib/supabaseAdmin.ts'), /^import 'server-only'/)
})
