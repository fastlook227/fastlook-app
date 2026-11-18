import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pagina = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const ruta = readFileSync(new URL('../app/api/productos/route.ts', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../fastlook_fix_rls_productos_admin.sql', import.meta.url), 'utf8')
const cascos = readFileSync(new URL('../app/api/cascos/route.ts', import.meta.url), 'utf8')

test('el inventario general deja de escribir productos directamente', () => {
  assert.match(pagina, /fetch\('\/api\/productos'/)
  assert.doesNotMatch(pagina, /from\('productos'\)\s*\.update\(crearDatosProducto/)
  assert.doesNotMatch(pagina, /from\('productos'\)\.insert\(\[crearDatosProducto/)
  assert.match(ruta, /cliente\.rpc\('actualizar_producto_admin'/)
  assert.match(ruta, /cliente\.rpc\('crear_producto_admin'/)
})

test('Admin activo puede editar y Vendedor o sesión inválida son rechazados', () => {
  assert.match(ruta, /await exigirAdministrador\(request\)/)
  assert.match(sql, /v_actor uuid := auth\.uid\(\)/)
  assert.equal((sql.match(/u\.activo = true and u\.rol = 'Admin'/g) || []).length, 2)
  assert.doesNotMatch(sql, /u\.rol = 'Vendedor'|rol\s+in\s*\([^)]*Vendedor/i)
  assert.match(sql, /SIN_SESION/)
  assert.match(sql, /ROL_NO_PERMITIDO/)
})

test('RLS permanece habilitado y sólo authenticated ejecuta los RPC', () => {
  assert.match(sql, /security definer/g)
  assert.doesNotMatch(sql, /disable row level security|grant .* on (table )?public\.productos/i)
  assert.doesNotMatch(sql, /grant execute .* to anon/i)
  assert.equal((sql.match(/grant execute on function public\.(?:crear|actualizar)_producto_admin/g) || []).length, 2)
})

test('edición valida duplicados, campos numéricos y productos archivados', () => {
  assert.match(sql, /CODIGO_DUPLICADO/)
  assert.match(sql, /p_precio < 0 or p_costo < 0 or p_stock < 0 or p_stock_minimo < 0/)
  assert.match(sql, /PRODUCTO_ARCHIVADO/)
  assert.match(ruta, /error\.code === '23505'/)
  assert.match(ruta, /Revisa los campos obligatorios, precios y existencias/)
})

test('imagen y miniatura se guardan juntas y el stock sólo toma el valor solicitado', () => {
  assert.match(sql, /stock = p_stock, stock_minimo = p_stock_minimo/)
  assert.match(sql, /imagen_url = btrim[\s\S]*imagen_thumbnail_url = nullif/)
  assert.doesNotMatch(sql, /stock\s*=\s*stock\s*[+-]/)
  assert.match(sql, /select \* into v_producto from public\.productos where id = p_producto_id for update/)
})

test('editar precio no modifica ventas ni históricos', () => {
  const actualizacion = sql.slice(sql.indexOf('create or replace function public.actualizar_producto_admin'))
  assert.doesNotMatch(actualizacion, /update public\.ventas|delete from public\.ventas|update public\.movimientos_inventario/i)
  assert.match(actualizacion, /update public\.productos set/)
})

test('alta es idempotente y los errores son comprensibles', () => {
  assert.match(sql, /productos_creaciones_idempotentes/)
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*p_solicitud_id/)
  assert.match(pagina, /solicitudCreacionProductoRef/)
  assert.match(ruta, /No tienes permiso para modificar el inventario/)
  assert.match(ruta, /El código ya pertenece a otro producto/)
})

test('Cascos conserva sus RPC administrativos', () => {
  assert.match(cascos, /cliente\.rpc\('crear_casco_admin'/)
  assert.match(cascos, /cliente\.rpc\('actualizar_casco_admin'/)
})

test('la migración no toca ventas y deja sus descuentos de stock intactos', () => {
  assert.doesNotMatch(sql, /create or replace function public\.procesar_venta|update public\.ventas|delete from public\.ventas/i)
  assert.doesNotMatch(pagina, /service_role|SUPABASE_SERVICE_ROLE_KEY/i)
})
