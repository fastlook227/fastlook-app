import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { CarritoLinea } from '../types/index.ts'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { ajustarAlBorde, CLAVE_POSICION_CARRITO_DESKTOP, CLAVE_POSICION_CARRITO_MOBILE, limitarPosicionCarrito, obtenerClavePosicionCarrito, obtenerModoViewportCarrito, obtenerResumenVentaActiva, restaurarPosicionCarrito, serializarPosicionCarrito, superoUmbralArrastre, resumirCarritoFlotante } from '../utils/carritoFlotante.ts'

const inventario = (cantidad: number, precio = 100): CarritoLinea => ({ tipoLinea: 'inventario', cantidad, producto: { id: 'p', codigo: 'P', nombre: 'Producto', tipo: 'X', precio, costo: 0, stock: 10, stock_minimo: 1, ubicacion: '', proveedor: '', imagen_url: '' } })
const personalizado = (cantidad: number): CarritoLinea => ({ tipoLinea: 'personalizado', cantidad, idLocal: 'x', tipoPersonalizado: 'CADENA', nombre: 'Cadena', resumen: '', configuracion: {}, precioUnitarioMostrado: 250 })
const entorno = { anchoViewport: 390, altoViewport: 844, anchoBurbuja: 60, altoBurbuja: 60, margen: 12, safeTop: 20, safeRight: 4, safeBottom: 16, safeLeft: 4, reservaInferior: 78 }
const componente = readFileSync(new URL('../components/CarritoFlotanteGlobal.tsx', import.meta.url), 'utf8')
const pagina = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const estilos = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

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
test('móvil y tablet usan modo mobile', () => { assert.equal(obtenerModoViewportCarrito(390), 'mobile'); assert.equal(obtenerModoViewportCarrito(1023), 'mobile') })
test('desktop se activa donde aparece el Sidebar', () => assert.equal(obtenerModoViewportCarrito(1024), 'desktop'))
test('posiciones desktop y mobile usan claves independientes', () => { assert.equal(obtenerClavePosicionCarrito('mobile'), CLAVE_POSICION_CARRITO_MOBILE); assert.equal(obtenerClavePosicionCarrito('desktop'), CLAVE_POSICION_CARRITO_DESKTOP); assert.notEqual(CLAVE_POSICION_CARRITO_MOBILE, CLAVE_POSICION_CARRITO_DESKTOP) })
test('clamp desktop respeta el Sidebar', () => { const escritorio = { ...entorno, anchoViewport: 1440, altoViewport: 900, safeTop: 0, safeLeft: 0, safeRight: 0, safeBottom: 0, reservaIzquierda: 264, reservaInferior: 0 }; assert.deepEqual(limitarPosicionCarrito({ x: 0, y: 0 }, escritorio), { x: 276, y: 12 }); assert.equal(ajustarAlBorde({ x: 300, y: 400 }, escritorio).x, 276) })
test('carrito vacío conserva badge cero', () => assert.deepEqual(resumirCarritoFlotante([]), { unidades: 0, total: 0 }))
test('mouse y touch comparten el mismo threshold', () => { const inicio = { x: 10, y: 10 }; assert.equal(superoUmbralArrastre(inicio, { x: 18, y: 10 }), true); assert.equal(superoUmbralArrastre(inicio, { x: 13, y: 14 }), false) })
test('burbuja es visible en mobile y desktop', () => { assert.match(estilos, /\.fl-global-cart\s*\{[^}]*display:\s*grid/); assert.doesNotMatch(estilos, /\.fl-global-cart\s*\{\s*display:\s*none/) })
test('login y carga retornan antes de montar el carrito', () => { const acceso = pagina.indexOf('if (!perfilUsuario || !usuarioRol)'); const carrito = pagina.indexOf('floatingCart={<CarritoFlotanteGlobal'); assert.ok(acceso >= 0 && carrito > acceso) })
test('desktop usa el carrito de la venta activa y no crea otro', () => { assert.match(pagina, /const carrito = ventaActiva\.carrito/); assert.match(pagina, /CarritoFlotanteGlobal carrito=\{carrito\}/) })
test('Pointer Events cubren mouse touch pen y cancelaci\u00f3n', () => { for (const evento of ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel']) assert.match(componente, new RegExp(evento)); assert.match(estilos, /touch-action:\s*none/) })
test('tap abre venta y drag suprime el click', () => { assert.match(componente, /ignorarClick\.current = true/); assert.match(componente, /if \(ignorarClick\.current\)/); assert.match(componente, /onAbrirVenta\(\)/) })
test('modales quedan por encima y bloquean interacci\u00f3n del carrito', () => { assert.match(estilos, /\.fl-global-cart[^}]*z-index:\s*850/); assert.match(estilos, /body:has\(\[aria-modal="true"\]\) \.fl-global-cart[^}]*pointer-events:\s*none/); assert.match(estilos, /\.fl-pos-backdrop[^}]*z-index:1700/) })
