import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo con extensión explícita.
import { agruparCatalogoComercial, buscarCodigoCatalogoExacto, claveProveedorCodigo, codigoProveedorAmbiguo, costoConDescuentoProveedor, precioSugeridoProveedor, resumirVistaPreviaImportacion } from '../utils/catalogoProveedores.ts'
import type { ProductoCatalogoProveedor } from '../types/catalogoProveedores.ts'

const sql = readFileSync(new URL('../fastlook_catalogo_proveedores.sql', import.meta.url), 'utf8')
const ventaFlexible = readFileSync(new URL('../fastlook_venta_flexible_proveedores.sql', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/catalogo-proveedores/route.ts', import.meta.url), 'utf8')
const pagina = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const componente = readFileSync(new URL('../components/catalogo-proveedores/CatalogoProveedores.tsx', import.meta.url), 'utf8')
const ventasPendientes = readFileSync(new URL('../utils/ventasPendientes.ts', import.meta.url), 'utf8')
const cascos = readFileSync(new URL('../app/api/cascos/route.ts', import.meta.url), 'utf8')

test('precio sugerido aplica costo por 1.30 con centavos precisos', () => {
  assert.equal(precioSugeridoProveedor(50), 65)
  assert.equal(precioSugeridoProveedor(100), 130)
  assert.equal(precioSugeridoProveedor(250), 325)
  assert.equal(precioSugeridoProveedor(500), 650)
  assert.equal(costoConDescuentoProveedor(100, 15), 85)
  assert.equal(precioSugeridoProveedor(costoConDescuentoProveedor(100, 15)), 110.5)
})

test('proveedor y código forman identidad interna sin perder el original', () => {
  assert.equal(claveProveedorCodigo('AQUILA', 'am-001-*'), 'AQUILA::AM-001-*')
  assert.notEqual(claveProveedorCodigo('REMO', 'ABC'), claveProveedorCodigo('CEDIS', 'ABC'))
  assert.equal(codigoProveedorAmbiguo('AM-001-*'), true)
  assert.equal(codigoProveedorAmbiguo('DA-080-(AM/BL)'), true)
  assert.equal(codigoProveedorAmbiguo('REM2451'), false)
})

test('vista previa repetible identifica duplicados, ambiguos e imágenes faltantes', () => {
  const registros = [
    { codigoOriginal: 'A', nombre: 'Uno', escalas: [{ nivel: 'BASE', descuentoPorcentaje: 0, costoEfectivo: 10 }], imagenReferencia: 'fila-1' },
    { codigoOriginal: 'A', nombre: 'Dos', escalas: [{ nivel: 'BASE', descuentoPorcentaje: 0, costoEfectivo: 11 }] },
    { codigoOriginal: 'X-*', nombre: 'Familia', escalas: [{ nivel: '10%', descuentoPorcentaje: 10, costoEfectivo: 9 }] },
  ]
  assert.deepEqual(resumirVistaPreviaImportacion(registros), { encontrados: 3, validos: 3, ambiguos: 1, duplicados: 1, sinImagen: 2, conErrores: 0 })
  assert.match(sql, /primary key\(importacion_id,lote_clave\)/)
  assert.match(sql, /on conflict\(importacion_id,lote_clave\) do nothing/)
})

const producto = (cambios: Partial<ProductoCatalogoProveedor>): ProductoCatalogoProveedor => ({ id: '1', proveedor_id: 'p', proveedor_clave: 'REMO', proveedor_nombre: 'REMO', codigo_original: 'ABC', codigo_barras: null, nombre: 'Pieza', descripcion: '', categoria: '', marca: '', compatibilidades: [], variantes: [], imagen_url: null, imagen_thumbnail_url: null, precio_venta_sugerido: 130, precio_actualizado_at: null, ambiguo: false, inventario_producto_id: null, inventario_precio: null, ofertas: [], ...cambios })

test('vinculados se agrupan por inventario y códigos repetidos entre proveedores no colisionan', () => {
  const grupos = agruparCatalogoComercial([producto({ id: '1', inventario_producto_id: 'local' }), producto({ id: '2', proveedor_clave: 'CEDIS', inventario_producto_id: 'local' }), producto({ id: '3', proveedor_clave: 'AQUILA' })])
  assert.equal(grupos.length, 2)
  assert.equal(grupos[0].length, 2)
})

test('escáner sólo devuelve coincidencias exactas y nunca familias ambiguas', () => {
  const datos = [producto({ id: '1', codigo_barras: '0123' }), producto({ id: '2', codigo_original: '0123', proveedor_clave: 'CEDIS' }), producto({ id: '3', codigo_original: '0123-*', ambiguo: true })]
  assert.deepEqual(buscarCodigoCatalogoExacto(datos, '0123').map((p) => p.id), ['1', '2'])
  assert.equal(buscarCodigoCatalogoExacto(datos, '123').length, 0)
})

test('RLS permanece activa y escritura sólo pasa por RPC Admin', () => {
  assert.equal((sql.match(/enable row level security/g) || []).length, 8)
  assert.match(sql, /revoke all on table[\s\S]*from anon,authenticated/)
  assert.match(sql, /u\.activo=true and u\.rol='Admin'/)
  assert.doesNotMatch(sql, /service_role|disable row level security|grant (insert|update|delete).*authenticated/i)
  assert.match(api, /await exigirAdministrador\(request\)/)
  assert.match(api, /await obtenerPerfilAutenticado\(request\)/)
})

test('Vendedor consulta venta sugerida sin recibir costos internos', () => {
  assert.match(sql, /case when v_admin then coalesce\(ofs\.ofertas/)
  assert.match(sql, /else '\[\]'::jsonb end/)
  assert.match(componente, /esAdmin && producto\.ofertas\[0\]/)
})

test('catálogo no altera productos, ventas, cascos ni históricos', () => {
  assert.doesNotMatch(sql, /(insert into|update|delete from) public\.(productos|ventas|movimientos_inventario)/i)
  assert.doesNotMatch(sql, /create or replace function public\.procesar_venta/)
  assert.match(cascos, /actualizar_casco_admin/)
  assert.match(pagina, /CatalogoProveedores/)
})

test('venta con stock cero requiere migración del RPC y no se habilita sólo en UI', () => {
  // El tope de stock sólo aplica con venta flexible apagada (RPC original).
  assert.match(ventasPendientes, /if\(limitarStock\)\{const disponible=tope\(e,ventaId,p\);if\(disponible<=0/)
  assert.match(componente, /sin crear inventario/i)
  assert.match(ventaFlexible, /_procesar_venta_flexible/)
  assert.match(ventaFlexible, /ventas_catalogo_proveedores/)
  assert.doesNotMatch(ventaFlexible, /insert into public\.productos/)
})
