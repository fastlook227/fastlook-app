import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { filtrarProductosPorBusqueda } from '../utils/busqueda.ts'
import type { Producto } from '../types'

const producto = (datos: Partial<Producto> & Pick<Producto, 'id' | 'nombre' | 'codigo'>): Producto => ({
  tipo: 'ACCESORIOS',
  precio: 100,
  costo: 50,
  stock: 2,
  stock_minimo: 1,
  ubicacion: 'Exhibición Norte',
  proveedor: 'Proveedor Águila',
  imagen_url: '',
  codigo_barras: null,
  ...datos,
})

const productos = [
  producto({ id: '1', nombre: 'Protección Águila', codigo: 'FL-0448', codigo_barras: '07501234567890' }),
  producto({ id: '2', nombre: 'Guantes urbanos', codigo: 'FL-0449', codigo_barras: '7501234567891', ubicacion: 'Bodega', proveedor: 'Moto Centro' }),
]

test('busca texto sin distinguir acentos, mayúsculas ni espacios repetidos', () => {
  assert.deepEqual(filtrarProductosPorBusqueda(productos, '  PROTECCION   aguila ').map((p) => p.id), ['1'])
  assert.deepEqual(filtrarProductosPorBusqueda(productos, 'proveedor aguila').map((p) => p.id), ['1'])
  assert.deepEqual(filtrarProductosPorBusqueda(productos, 'exhibicion norte').map((p) => p.id), ['1'])
})

test('conserva la búsqueda flexible del código Fast Look', () => {
  assert.deepEqual(filtrarProductosPorBusqueda(productos, 'fl-0448').map((p) => p.id), ['1'])
  assert.deepEqual(filtrarProductosPorBusqueda(productos, 'FL0448').map((p) => p.id), ['1'])
})

test('un barcode exacto tiene prioridad absoluta y conserva el cero inicial', () => {
  assert.deepEqual(filtrarProductosPorBusqueda(productos, '07501234567890').map((p) => p.id), ['1'])
})

test('barcode parecido o inexistente no coincide parcialmente con otro barcode', () => {
  assert.deepEqual(filtrarProductosPorBusqueda(productos, '0750123456789'), [])
  assert.deepEqual(filtrarProductosPorBusqueda(productos, '07501234567891'), [])
})

test('término vacío devuelve todos los productos', () => {
  assert.deepEqual(filtrarProductosPorBusqueda(productos, '   ').map((p) => p.id), ['1', '2'])
})
