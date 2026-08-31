import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { buscarCodigoBarrasExacto, crearMapaCodigosBarras, detenerMediaStream, evaluarLecturaContinua, normalizarCodigoBarras } from '../utils/codigoBarras.ts'
import type { CarritoItem, Producto } from '../types'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { agregarProductoAlCarrito } from '../utils/ventas.ts'

const producto = (id: string, codigoBarras: string | null): Producto => ({
  id,
  codigo: `FL-${id}`,
  codigo_barras: codigoBarras,
  nombre: `Producto ${id}`,
  tipo: 'PRUEBA',
  precio: 10,
  costo: 5,
  stock: 3,
  stock_minimo: 1,
  ubicacion: '',
  proveedor: '',
  imagen_url: '',
})

test('normaliza únicamente espacios exteriores y conserva ceros', () => {
  assert.equal(normalizarCodigoBarras('  07501234567890  '), '07501234567890')
  assert.equal(normalizarCodigoBarras('FL-Abc-01'), 'FL-Abc-01')
})

test('barcode sólo coincide de forma exacta', () => {
  const productos = [producto('1', '7501234567890'), producto('2', '7501234567891')]
  assert.equal(buscarCodigoBarrasExacto(productos, '7501234567890')?.id, '1')
  assert.equal(buscarCodigoBarrasExacto(productos, '750123456789'), undefined)
  assert.equal(buscarCodigoBarrasExacto(productos, '7501234567892'), undefined)
})

test('el mapa ignora productos sin barcode y resuelve en O(1)', () => {
  const mapa = crearMapaCodigosBarras([producto('1', null), producto('2', '09')])
  assert.equal(mapa.size, 1)
  assert.equal(mapa.get('09')?.id, '2')
  assert.equal(mapa.get('9'), undefined)
})

test('tres escaneos rápidos acumulan ×3 y respetan el stock máximo', () => {
  const escaneado = producto('3', '7500000000003')
  let carrito: CarritoItem[] = []
  for (let lectura = 1; lectura <= 3; lectura += 1) {
    const resultado = agregarProductoAlCarrito(carrito, escaneado)
    assert.equal(resultado.ok, true)
    assert.equal(resultado.cantidad, lectura)
    carrito = resultado.carrito
  }
  const excedente = agregarProductoAlCarrito(carrito, escaneado)
  assert.equal(excedente.ok, false)
  assert.equal(excedente.carrito[0]?.cantidad, 3)
})

test('un producto archivado nunca puede agregarse a una venta nueva', () => {
  const archivado = { ...producto('4', '7500000000004'), archivado: true }
  const resultado = agregarProductoAlCarrito([], archivado)
  assert.equal(resultado.ok, false)
  assert.deepEqual(resultado.carrito, [])
})

test('modo continuo exige ausencia antes de repetir el mismo código', () => {
  const primera = evaluarLecturaContinua(null, '7501', 0, 900)
  assert.equal(primera.aceptar, true)
  const frameSiguiente = evaluarLecturaContinua(primera.siguiente, '7501', 120, 900)
  assert.equal(frameSiguiente.aceptar, false)
  const sostenido = evaluarLecturaContinua(frameSiguiente.siguiente, '7501', 850, 900)
  assert.equal(sostenido.aceptar, false)
  const reintroducido = evaluarLecturaContinua(sostenido.siguiente, '7501', 1900, 900)
  assert.equal(reintroducido.aceptar, true)
  const diferente = evaluarLecturaContinua(reintroducido.siguiente, '9999', 1950, 900)
  assert.equal(diferente.aceptar, true)
})

test('cerrar cámara detiene todos los tracks', () => {
  let detenidos = 0
  const stream = {
    getTracks: () => [
      { stop: () => { detenidos += 1 } },
      { stop: () => { detenidos += 1 } },
    ],
  } as unknown as Pick<MediaStream, 'getTracks'>
  detenerMediaStream(stream)
  assert.equal(detenidos, 2)
})
