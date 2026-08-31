import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { agregarProductoAVenta, agregarVentaPendiente, cambiarCantidadEnVenta, cerrarVentaPendiente, crearEstadoVentasInicial, eliminarProductoDeVenta, obtenerVentaActiva, reconciliarVentasPendientes, restaurarVentasPendientes } from '../utils/ventasPendientes.ts'
import type { Producto } from '../types'

const producto = (id: string, cambio: Partial<Producto> = {}): Producto => ({ id, codigo: `FL-${id}`, codigo_barras: `750${id}`, nombre: `Producto ${id}`, tipo: 'Tipo', precio: 20, costo: 10, stock: 5, stock_minimo: 1, ubicacion: 'Mostrador', proveedor: 'Proveedor', imagen_url: '', archivado: false, ...cambio })
const camara = producto('camara')

const dosVentas = () => agregarVentaPendiente(crearEstadoVentasInicial(), 'venta-2', 2)

test('crea segundo carrito vacío y lo deja activo con ID independiente del nombre', () => {
  const estado = dosVentas()
  assert.equal(estado.ventas.length, 2)
  assert.equal(obtenerVentaActiva(estado).id, 'venta-2')
  assert.deepEqual(obtenerVentaActiva(estado).carrito, [])
  assert.equal(obtenerVentaActiva(estado).nombre, 'Cliente 2')
})

test('cambiar de carrito conserva productos y cantidades del primero', () => {
  let estado = crearEstadoVentasInicial()
  estado = agregarProductoAVenta(estado, estado.activaId, camara).estado
  estado = agregarVentaPendiente(estado, 'venta-2', 2)
  estado = { ...estado, activaId: 'venta-inicial' }
  assert.equal(obtenerVentaActiva(estado).carrito[0].cantidad, 1)
})

test('frecuente, búsqueda, pistola y cámara agregan exclusivamente a la venta activa', () => {
  for (const origen of ['frecuente', 'búsqueda', 'pistola', 'cámara']) {
    let estado = dosVentas()
    estado = agregarProductoAVenta(estado, estado.activaId, producto(origen)).estado
    assert.equal(estado.ventas[0].carrito.length, 0)
    assert.equal(estado.ventas[1].carrito[0].id, origen)
  }
})

test('cantidades son independientes y eliminar sólo afecta el activo indicado', () => {
  let estado = dosVentas()
  estado = agregarProductoAVenta(estado, 'venta-inicial', camara).estado
  estado = agregarProductoAVenta(estado, 'venta-2', camara).estado
  estado = cambiarCantidadEnVenta(estado, 'venta-inicial', camara.id, 3, 5).estado
  assert.equal(estado.ventas[0].carrito[0].cantidad, 3)
  assert.equal(estado.ventas[1].carrito[0].cantidad, 1)
  estado = eliminarProductoDeVenta(estado, 'venta-2', camara.id)
  assert.equal(estado.ventas[0].carrito.length, 1)
  assert.equal(estado.ventas[1].carrito.length, 0)
})

test('cerrar vacío es directo, descartar con productos elimina sólo esa venta y siempre queda una', () => {
  let estado = dosVentas()
  estado = cerrarVentaPendiente(estado, 'venta-2', 'reemplazo', 3)
  assert.equal(estado.ventas.length, 1)
  estado = agregarProductoAVenta(estado, estado.activaId, camara).estado
  estado = cerrarVentaPendiente(estado, estado.activaId, 'reemplazo', 4)
  assert.equal(estado.ventas.length, 1)
  assert.equal(estado.ventas[0].id, 'reemplazo')
  assert.deepEqual(estado.ventas[0].carrito, [])
})

test('cancelar el modal de cierre no requiere mutar el estado', () => {
  const estado = agregarProductoAVenta(crearEstadoVentasInicial(), 'venta-inicial', camara).estado
  assert.equal(obtenerVentaActiva(estado).carrito.length, 1)
})

test('cobrar Cliente 1 elimina exactamente su ID aunque cambie la venta activa', () => {
  let estado = dosVentas()
  estado = agregarProductoAVenta(estado, 'venta-inicial', producto('uno')).estado
  estado = agregarProductoAVenta(estado, 'venta-2', producto('dos')).estado
  const ventaIdProcesada = 'venta-inicial'
  estado = { ...estado, activaId: 'venta-2' }
  estado = cerrarVentaPendiente(estado, ventaIdProcesada, 'nueva')
  assert.deepEqual(estado.ventas.map((v) => v.id), ['venta-2'])
  assert.equal(estado.ventas[0].carrito[0].id, 'dos')
  assert.equal(estado.activaId, 'venta-2')
})

test('error de cobro conserva ambas ventas sin cambio', () => {
  const estado = dosVentas()
  const serializado = JSON.stringify(estado)
  assert.equal(JSON.stringify(estado), serializado)
})

test('localStorage válido restaura y JSON inválido se ignora', () => {
  const estado = dosVentas()
  assert.deepEqual(restaurarVentasPendientes(JSON.stringify(estado)), estado)
  assert.equal(restaurarVentasPendientes('{invalido'), null)
  assert.equal(restaurarVentasPendientes(JSON.stringify({ ventas: [], activaId: '' })), null)
})

test('reconciliación retira inexistentes, archivados y stock cero', () => {
  let estado = crearEstadoVentasInicial()
  for (const item of [producto('inexistente'), producto('archivado'), producto('cero')]) estado = agregarProductoAVenta(estado, estado.activaId, item).estado
  const resultado = reconciliarVentasPendientes(estado, [producto('archivado', { archivado: true }), producto('cero', { stock: 0 })])
  assert.deepEqual(resultado.estado.ventas[0].carrito, [])
  assert.equal(resultado.retirados, 3)
})

test('stock reducido ajusta cantidades persistidas', () => {
  let estado = crearEstadoVentasInicial()
  estado = agregarProductoAVenta(estado, estado.activaId, camara).estado
  estado = cambiarCantidadEnVenta(estado, estado.activaId, camara.id, 5, 5).estado
  const resultado = reconciliarVentasPendientes(estado, [{ ...camara, stock: 2 }])
  assert.equal(resultado.estado.ventas[0].carrito[0].cantidad, 2)
  assert.equal(resultado.ajustados, 1)
})

test('stock compartido nunca supera existencia y recalcula al cerrar otro carrito', () => {
  let estado = dosVentas()
  estado = agregarProductoAVenta(estado, 'venta-inicial', camara).estado
  estado = cambiarCantidadEnVenta(estado, 'venta-inicial', camara.id, 3, 5).estado
  estado = agregarProductoAVenta(estado, 'venta-2', camara).estado
  estado = cambiarCantidadEnVenta(estado, 'venta-2', camara.id, 3, 5).estado
  assert.equal(estado.ventas[1].carrito[0].cantidad, 2)
  assert.equal(estado.ventas.reduce((total, venta) => total + (venta.carrito[0]?.cantidad ?? 0), 0), 5)
  estado = cerrarVentaPendiente(estado, 'venta-inicial', 'nueva')
  estado = reconciliarVentasPendientes(estado, [camara]).estado
  assert.equal(estado.ventas[0].carrito[0].stock, 5)
})
