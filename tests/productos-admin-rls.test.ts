import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { construirPayloadProductoAdmin } from '../utils/productosAdmin.ts'

const pagina = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const ruta = readFileSync(new URL('../app/api/productos/route.ts', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../fastlook_fix_rls_productos_admin.sql', import.meta.url), 'utf8')
const sqlHistoricos = readFileSync(new URL('../fastlook_fix_productos_historicos.sql', import.meta.url), 'utf8')
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
  assert.match(ruta, /VALIDACION_API/)
  assert.match(ruta, /campo: detalle\.campo/)
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

const formularioHistorico = {
  id: '00000000-0000-4000-8000-000000000001', codigo: 'FL-1', nombre: 'Producto histórico', tipo: 'OTROS',
  precio: '100', costo: '', stock: '10', stock_minimo: '', ubicacion: '', proveedor: '', imagen_url: '',
  imagen_thumbnail_url: '', usar_imagen_principal: false,
}

test('producto histórico conserva opcionales vacíos sin inventar ceros ni mínimos', () => {
  const payload = construirPayloadProductoAdmin({ form: formularioHistorico, codigo: 'FL-1', tipo: 'OTROS', editando: true, preferenciaImagenDisponible: false })
  assert.equal(payload.costo, null)
  assert.equal(payload.stock_minimo, null)
  assert.equal(payload.ubicacion, '')
  assert.equal(payload.usar_imagen_principal, undefined)
  assert.match(sqlHistoricos, /costo = coalesce\(p_costo, v_producto\.costo\)/)
  assert.match(sqlHistoricos, /stock_minimo = coalesce\(p_stock_minimo, v_producto\.stock_minimo\)/)
})

test('cambiar precio conserva stock y cambiar fotografía conserva los demás campos', () => {
  const precio = construirPayloadProductoAdmin({ form: { ...formularioHistorico, precio: '125' }, codigo: 'FL-1', tipo: 'OTROS', editando: true, preferenciaImagenDisponible: false })
  assert.equal(precio.precio, 125)
  assert.equal(precio.stock, null)
  const foto = construirPayloadProductoAdmin({ form: { ...formularioHistorico, imagen_url: '/nueva.webp', imagen_thumbnail_url: '/mini.webp' }, codigo: 'FL-1', tipo: 'OTROS', editando: true, preferenciaImagenDisponible: true })
  assert.equal(foto.imagen_url, '/nueva.webp')
  assert.equal(foto.imagen_thumbnail_url, '/mini.webp')
  assert.equal(foto.precio, 100)
  assert.equal(foto.stock, null)
})

test('RPC complementario identifica el campo y conserva seguridad Admin/Vendedor', () => {
  assert.match(sqlHistoricos, /CAMPO_INVALIDO: Precio de venta/)
  assert.match(sqlHistoricos, /CAMPO_INVALIDO: Existencias/)
  assert.match(sqlHistoricos, /auth\.uid\(\)/)
  assert.match(sqlHistoricos, /u\.activo = true and u\.rol = 'Admin'/)
  assert.doesNotMatch(sqlHistoricos, /disable row level security|grant .* on (table )?public\.productos|rol = 'Vendedor'/i)
})

test('un rechazo conserva formulario y libera el estado de guardado', () => {
  assert.match(pagina, /try \{\s*await ejecutarGuardadoProducto\(\)\s*\} finally \{[\s\S]*setGuardandoProducto\(false\)/)
  assert.match(pagina, /if \(!respuesta\.ok[\s\S]*alert\([\s\S]*return/)
})

test('la migración no toca ventas y deja sus descuentos de stock intactos', () => {
  assert.doesNotMatch(sql, /create or replace function public\.procesar_venta|update public\.ventas|delete from public\.ventas/i)
  assert.doesNotMatch(pagina, /service_role|SUPABASE_SERVICE_ROLE_KEY/i)
})
