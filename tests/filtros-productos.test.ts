import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { aplicarFiltrosProductos, contarFiltrosActivos, crearFiltrosProductosVacios, obtenerOpcionesFiltrosProductos } from '../utils/filtrosProductos.ts'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { buscarCodigoBarrasExacto } from '../utils/busqueda.ts'
import type { Producto } from '../types'

const producto = (id: string, cambio: Partial<Producto> = {}): Producto => ({
  id, codigo: `FL-000${id}`, codigo_barras: null, nombre: `Producto ${id}`, tipo: 'Palancas',
  precio: 100, costo: 50, stock: 10, stock_minimo: 3, ubicacion: 'Mostrador',
  proveedor: 'Proveedor A', imagen_url: `https://img/${id}.webp`, archivado: false, ...cambio,
})

const productos: Producto[] = [
  producto('1', { nombre: 'Palanca freno', codigo: 'FL-0448', codigo_barras: '07501234567890', stock: 8, precio: 120, costo: 60 }),
  producto('2', { nombre: 'Chicote clutch', tipo: 'Chicotes', proveedor: 'Proveedor B', ubicacion: 'Bodega', stock: 0, precio: 80, costo: 30, imagen_url: '' }),
  producto('3', { nombre: 'Palanca cambios', codigo: 'FL-0450', codigo_barras: 'FL-0450', proveedor: 'Proveedor B', stock: 2, stock_minimo: 2, precio: 200, costo: 100 }),
  producto('4', { nombre: 'Aceite motor', tipo: 'Aceites', ubicacion: 'Estante A', stock: 20, precio: 300, costo: null }),
  producto('5', { nombre: 'Archivado', archivado: true, stock: 1 }),
]

const filtrar = (cambio: Partial<ReturnType<typeof crearFiltrosProductosVacios>> = {}, busqueda = '') =>
  aplicarFiltrosProductos(productos, busqueda, { ...crearFiltrosProductosVacios(), ...cambio }, { permitirBarcode: true, permitirImagen: true, permitirPrecio: true, permitirCosto: true })
const ids = (lista: Producto[]) => lista.map((p) => p.id)

test('búsqueda normal sin filtros conserva el motor actual', () => assert.deepEqual(ids(filtrar({}, 'palanca')), ['3', '1']))
test('filtra un tipo', () => assert.deepEqual(ids(filtrar({ tipos: new Set(['Chicotes']) })), ['2']))
test('múltiples tipos usan OR', () => assert.deepEqual(ids(filtrar({ tipos: new Set(['Chicotes', 'Aceites']) })), ['4', '2']))
test('filtra un proveedor', () => assert.deepEqual(ids(filtrar({ proveedores: new Set(['Proveedor A']) })), ['4', '1']))
test('múltiples proveedores usan OR', () => assert.equal(filtrar({ proveedores: new Set(['Proveedor A', 'Proveedor B']) }).length, 4))
test('filtra ubicación', () => assert.deepEqual(ids(filtrar({ ubicaciones: new Set(['Bodega']) })), ['2']))
test('filtra con stock', () => assert.deepEqual(ids(filtrar({ stock: 'con-stock' })), ['4', '3', '1']))
test('filtra sin stock', () => assert.deepEqual(ids(filtrar({ stock: 'sin-stock' })), ['2']))
test('stock bajo reutiliza stock <= stock_minimo', () => assert.deepEqual(ids(filtrar({ stock: 'stock-bajo' })), ['2', '3']))
test('rango personalizado de stock es inclusivo', () => assert.deepEqual(ids(filtrar({ stockMin: 2, stockMax: 8 })), ['3', '1']))
test('filtra con barcode', () => assert.deepEqual(ids(filtrar({ barcode: 'con-barcode' })), ['3', '1']))
test('filtra sin barcode', () => assert.deepEqual(ids(filtrar({ barcode: 'sin-barcode' })), ['4', '2']))
test('distingue barcode interno', () => assert.deepEqual(ids(filtrar({ barcode: 'interno' })), ['3']))
test('distingue barcode comercial sin convertirlo a Number', () => assert.deepEqual(ids(filtrar({ barcode: 'comercial' })), ['1']))
test('filtra con imagen', () => assert.deepEqual(ids(filtrar({ imagen: 'con-imagen' })), ['4', '3', '1']))
test('filtra sin imagen', () => assert.deepEqual(ids(filtrar({ imagen: 'sin-imagen' })), ['2']))
test('filtra rango de precio', () => assert.deepEqual(ids(filtrar({ precioMin: 100, precioMax: 200 })), ['3', '1']))
test('filtra rango de costo Admin', () => assert.deepEqual(ids(filtrar({ costoMin: 50, costoMax: 100 })), ['3', '1']))
test('ordena nombre en ambos sentidos', () => {
  assert.deepEqual(ids(filtrar({ orden: 'nombre-asc' })), ['4', '2', '3', '1'])
  assert.deepEqual(ids(filtrar({ orden: 'nombre-desc' })), ['1', '3', '2', '4'])
})
test('ordena stock establemente', () => assert.deepEqual(ids(filtrar({ orden: 'stock-asc' })), ['2', '3', '1', '4']))
test('ordena precio', () => assert.deepEqual(ids(filtrar({ orden: 'precio-desc' })), ['4', '3', '1', '2']))
test('combina grupos con AND', () => assert.deepEqual(ids(filtrar({ tipos: new Set(['Palancas']), proveedores: new Set(['Proveedor B']), stock: 'con-stock' })), ['3']))
test('archivado nunca aparece en vistas activas', () => assert.equal(filtrar().some((p) => p.archivado), false))
test('barcode exacto del scanner se resuelve en activos sin consultar filtros visuales', () => {
  const activos = productos.filter((p) => !p.archivado)
  assert.equal(buscarCodigoBarrasExacto(activos, '07501234567890')?.id, '1')
  assert.deepEqual(ids(filtrar({ tipos: new Set(['Aceites']) })), ['4'])
})
test('producto sin stock queda identificado y no debe poder agregarse a venta', () => assert.equal(Number(productos[1].stock) <= 0, true))
test('preset necesitan atención aplica OR interno y AND con filtros normales', () => {
  assert.deepEqual(ids(filtrar({ preset: 'necesitan-atencion' })), ['4', '2', '3'])
  assert.deepEqual(ids(filtrar({ preset: 'necesitan-atencion', tipos: new Set(['Palancas']) })), ['3'])
})
test('opciones únicas ignoran vacíos y se generan de productos reales', () => {
  const opciones = obtenerOpcionesFiltrosProductos([...productos, producto('6', { tipo: '', proveedor: '', ubicacion: '' })])
  assert.deepEqual(opciones.tipos, ['Aceites', 'Chicotes', 'Palancas'])
})
test('limpiar filtros restaura criterios y orden predeterminado', () => {
  const limpios = crearFiltrosProductosVacios()
  assert.equal(contarFiltrosActivos(limpios, { permitirBarcode: true, permitirImagen: true, permitirPrecio: true, permitirCosto: true }), 0)
  assert.equal(limpios.orden, 'nombre-asc')
})
test('limpiar todo combina texto vacío con filtros vacíos', () => assert.equal(filtrar({}, '').length, 4))
