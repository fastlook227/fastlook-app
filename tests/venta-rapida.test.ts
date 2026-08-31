import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { agregarProductoAlCarrito } from '../utils/ventas.ts'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { carritoDespuesDeCobro, crearIntentoCobro, intentarBloquearCobro, liberarBloqueoCobro, limitarCantidadAStock, obtenerProductosFrecuentes, obtenerUltimosProductosVendidos } from '../utils/ventaRapida.ts'
import type { CarritoItem, Producto, Venta } from '../types'

const producto = (id: string, cambio: Partial<Producto> = {}): Producto => ({ id, codigo: `FL-${id}`, nombre: `Producto ${id}`, tipo: 'Tipo', precio: 10, costo: 5, stock: 5, stock_minimo: 1, ubicacion: 'Mostrador', proveedor: 'Proveedor', imagen_url: '', archivado: false, ...cambio })
const ventas: Venta[] = [
  { id: 'v1', created_at: '2026-08-30T10:00:00Z', producto_id: '1', cantidad: 2 },
  { id: 'v2', created_at: '2026-08-30T11:00:00Z', producto_id: '2', cantidad: 4 },
  { id: 'v3', created_at: '2026-08-30T12:00:00Z', producto_id: '1', cantidad: 3 },
  { id: 'v4', created_at: '2026-08-30T13:00:00Z', producto_id: 'archivado', cantidad: 99 },
  { id: 'v5', created_at: '2026-08-30T14:00:00Z', producto_id: 'inexistente', cantidad: 99 },
]
const productos = [producto('1'), producto('2'), producto('archivado', { archivado: true })]

test('tocar un frecuente agrega una unidad y varios toques aumentan cantidad', () => {
  const frecuente = obtenerProductosFrecuentes(productos, ventas)[0]
  const primera = agregarProductoAlCarrito([], frecuente)
  const segunda = agregarProductoAlCarrito(primera.carrito, frecuente)
  assert.equal(primera.carrito[0].cantidad, 1)
  assert.equal(segunda.carrito[0].cantidad, 2)
})

test('nunca supera stock y rechaza stock cero', () => {
  const limitado = producto('3', { stock: 1 })
  const primera = agregarProductoAlCarrito([], limitado)
  assert.equal(agregarProductoAlCarrito(primera.carrito, limitado).ok, false)
  assert.equal(agregarProductoAlCarrito([], producto('4', { stock: 0 })).ok, false)
})

test('producto archivado continúa rechazado por la protección compartida', () => {
  assert.equal(agregarProductoAlCarrito([], producto('5', { archivado: true })).ok, false)
})

test('frecuentes ordenan por cantidad y excluyen archivados e inexistentes', () => {
  assert.deepEqual(obtenerProductosFrecuentes(productos, ventas).map((p) => p.id), ['1', '2'])
})

test('últimos vendidos conserva productos distintos, activos y existentes', () => {
  assert.deepEqual(obtenerUltimosProductosVendidos(productos, ventas).map((p) => p.id), ['1', '2'])
})

test('cantidad directa respeta límites de stock', () => {
  assert.equal(limitarCantidadAStock(9, 4), 4)
  assert.equal(limitarCantidadAStock(0, 4), 1)
  assert.equal(limitarCantidadAStock(3.8, 4), 3)
})

test('cambiar entre modos no transforma el carrito compartido', () => {
  const carrito = [{ ...producto('1'), cantidad: 2 }] as CarritoItem[]
  const estado = { modo: 'normal', carrito }
  const siguiente = { ...estado, modo: 'rapida' }
  assert.equal(siguiente.carrito, carrito)
})

test('bloqueo síncrono impide un segundo cobro hasta liberar', () => {
  const control = { current: false }
  assert.equal(intentarBloquearCobro(control), true)
  assert.equal(intentarBloquearCobro(control), false)
  liberarBloqueoCobro(control)
  assert.equal(intentarBloquearCobro(control), true)
})

test('intento de cobro conserva método y líneas exactas', () => {
  const intento = crearIntentoCobro([{ id: '1', cantidad: 3 }], 'Transferencia', 'clave-1')
  assert.deepEqual(intento, { idempotencyKey: 'clave-1', metodoPago: 'Transferencia', lineas: [{ producto_id: '1', cantidad: 3 }] })
})

test('venta exitosa limpia carrito y error lo conserva', () => {
  const carrito = [{ ...producto('1'), cantidad: 1 }] as CarritoItem[]
  assert.deepEqual(carritoDespuesDeCobro(carrito, true), [])
  assert.deepEqual(carritoDespuesDeCobro(carrito, false), carrito)
})
