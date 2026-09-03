import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { crearLineaInventario, esLineaInventario, esLineaPersonalizada, obtenerLineasInventario, obtenerTotalLinea, validarCheckoutInventario } from '../utils/carritoMixto.ts'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { agregarProductoAVenta, agregarVentaPendiente, cantidadComprometidaOtros, crearEstadoVentasInicial, restaurarVentasPendientes } from '../utils/ventasPendientes.ts'
import type { LineaPersonalizada, Producto } from '../types/index.ts'

const producto: Producto = { id:'p1',codigo:'FL-1',nombre:'Producto',tipo:'REFACCION',precio:20,costo:10,stock:5,stock_minimo:1,ubicacion:'',proveedor:'',imagen_url:'' }
const personalizada: LineaPersonalizada = { tipoLinea:'personalizado',idLocal:'local-1',tipoPersonalizado:'SERVICIO_MOTO',nombre:'Servicio',resumen:'Normal',configuracion:{nivel:'Normal',precio_final:70},precioUnitarioMostrado:70,cantidad:2 }

test('representa y discrimina línea de inventario',()=>{const linea=crearLineaInventario(producto,2);assert.ok(esLineaInventario(linea));assert.equal(linea.producto.id,'p1')})
test('representa y discrimina línea personalizada',()=>{assert.ok(esLineaPersonalizada(personalizada));assert.equal(personalizada.tipoPersonalizado,'SERVICIO_MOTO')})
test('calcula total de inventario',()=>assert.equal(obtenerTotalLinea(crearLineaInventario(producto,3)),60))
test('calcula total personalizado',()=>assert.equal(obtenerTotalLinea(personalizada),140))
test('stock comprometido ignora personalizados',()=>{let e=agregarVentaPendiente(crearEstadoVentasInicial(),'v2');e={...e,ventas:e.ventas.map(v=>v.id==='venta-inicial'?{...v,carrito:[personalizada]}:v)};assert.equal(cantidadComprometidaOtros(e,'v2','p1'),0);e=agregarProductoAVenta(e,'venta-inicial',producto).estado;assert.equal(cantidadComprometidaOtros(e,'v2','p1'),1)})
test('obtiene únicamente líneas de inventario',()=>assert.deepEqual(obtenerLineasInventario([crearLineaInventario(producto),personalizada]).map(l=>l.producto.id),['p1']))
test('adaptador 4A todavía identifica checkout no exclusivo de inventario',()=>{const r=validarCheckoutInventario([crearLineaInventario(producto),personalizada]);assert.equal(r.ok,false)})
test('normaliza localStorage antiguo como inventario',()=>{const viejo={ventas:[{id:'v1',nombre:'Cliente 1',carrito:[{...producto,cantidad:2}],metodoPago:'Efectivo',createdAt:1,updatedAt:1}],activaId:'v1'};const r=restaurarVentasPendientes(JSON.stringify(viejo));assert.ok(r);assert.ok(esLineaInventario(r.ventas[0].carrito[0]));assert.equal(r.ventas[0].carrito[0].cantidad,2)})
test('restaura el nuevo formato sin perder personalizados',()=>{const nuevo={ventas:[{id:'v1',nombre:'Cliente 1',carrito:[crearLineaInventario(producto),personalizada],metodoPago:'Tarjeta',createdAt:1,updatedAt:1}],activaId:'v1'};const r=restaurarVentasPendientes(JSON.stringify(nuevo));assert.ok(r);assert.ok(esLineaPersonalizada(r.ventas[0].carrito[1]));assert.equal(r.ventas[0].carrito[1].cantidad,2)})
