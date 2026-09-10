import assert from 'node:assert/strict'
import test from 'node:test'
import type { CarritoLinea } from '../types/index.ts'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { ajustarAlBorde, limitarPosicionCarrito, obtenerResumenVentaActiva, restaurarPosicionCarrito, serializarPosicionCarrito, superoUmbralArrastre, resumirCarritoFlotante } from '../utils/carritoFlotante.ts'

const inventario = (cantidad: number, precio = 100): CarritoLinea => ({ tipoLinea: 'inventario', cantidad, producto: { id: 'p', codigo: 'P', nombre: 'Producto', tipo: 'X', precio, costo: 0, stock: 10, stock_minimo: 1, ubicacion: '', proveedor: '', imagen_url: '' } })
const personalizado = (cantidad: number): CarritoLinea => ({ tipoLinea: 'personalizado', cantidad, idLocal: 'x', tipoPersonalizado: 'CADENA', nombre: 'Cadena', resumen: '', configuracion: {}, precioUnitarioMostrado: 250 })
const entorno = { anchoViewport: 390, altoViewport: 844, anchoBurbuja: 60, altoBurbuja: 60, margen: 12, safeTop: 20, safeRight: 4, safeBottom: 16, safeLeft: 4, reservaInferior: 78 }

test('suma cantidades y no sólo líneas', () => assert.deepEqual(resumirCarritoFlotante([inventario(2), inventario(3)]), { unidades: 5, total: 500 }))
test('ignora ventas no activas', () => assert.equal(obtenerResumenVentaActiva([{ id: 'a', carrito: [inventario(2)] }, { id: 'b', carrito: [inventario(7)] }], 'a').unidades, 2))
test('posición se clampa al viewport', () => assert.deepEqual(limitarPosicionCarrito({ x: 999, y: 999 }, entorno), { x: 314, y: 678 }))
test('clamp respeta margen y safe area', () => assert.deepEqual(limitarPosicionCarrito({ x: -20, y: -20 }, entorno), { x: 16, y: 32 }))
test('clamp reserva zona inferior de navegación', () => assert.equal(limitarPosicionCarrito({ x: 20, y: 800 }, entorno).y, 678))
test('restaura posición válida', () => assert.deepEqual(restaurarPosicionCarrito('{"x":100,"y":200}', entorno), { x: 100, y: 200 }))
test('corrige posición persistida fuera de límites', () => assert.deepEqual(restaurarPosicionCarrito('{"x":900,"y":900}', entorno), { x: 314, y: 678 }))
test('drag supera threshold de ocho píxeles', () => assert.equal(superoUmbralArrastre({ x: 0, y: 0 }, { x: 8, y: 0 }), true))
test('movimiento pequeño sigue siendo tap', () => assert.equal(superoUmbralArrastre({ x: 0, y: 0 }, { x: 4, y: 3 }), false))
test('drag queda marcado para suprimir navegación', () => { const arrastro = superoUmbralArrastre({ x: 10, y: 10 }, { x: 25, y: 10 }); assert.equal(arrastro, true) })
test('snap elige borde izquierdo', () => assert.equal(ajustarAlBorde({ x: 80, y: 200 }, entorno).x, 16))
test('snap elige borde derecho', () => assert.equal(ajustarAlBorde({ x: 260, y: 200 }, entorno).x, 314))
test('cambio de viewport reclampa', () => assert.equal(limitarPosicionCarrito({ x: 314, y: 678 }, { ...entorno, anchoViewport: 320, altoViewport: 600 }).x, 244))
test('personalizado cuenta en badge y total', () => assert.deepEqual(resumirCarritoFlotante([personalizado(3)]), { unidades: 3, total: 750 }))
test('cambio de venta activa cambia contador', () => { const ventas = [{ id: 'a', carrito: [inventario(1)] }, { id: 'b', carrito: [personalizado(4)] }]; assert.equal(obtenerResumenVentaActiva(ventas, 'a').unidades, 1); assert.equal(obtenerResumenVentaActiva(ventas, 'b').unidades, 4) })
test('posición se serializa y restaura sin datos del carrito', () => { const guardada = serializarPosicionCarrito({ x: 100, y: 250 }); assert.equal(guardada, '{"x":100,"y":250}'); assert.deepEqual(restaurarPosicionCarrito(guardada, entorno), { x: 100, y: 250 }) })
