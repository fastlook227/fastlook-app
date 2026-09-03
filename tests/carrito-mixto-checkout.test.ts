import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { agregarLineaPersonalizada, construirPayloadVenta, crearCadenaPersonalizada, crearEstrellaPersonalizada, crearKitPersonalizado, crearLineaInventario, crearPinonPersonalizado, crearServicioPersonalizado, seleccionarRpcVenta } from '../utils/carritoMixto.ts'
import type { Producto } from '../types/index.ts'

const producto:Producto={id:'p1',codigo:'FL-1',nombre:'Producto',tipo:'REFACCION',precio:190,costo:100,stock:3,stock_minimo:1,ubicacion:'',proveedor:'',imagen_url:''}
test('Cadena crea LineaPersonalizada correcta',()=>assert.deepEqual(crearCadenaPersonalizada('116L','428 Dorada',190,'c1'),{idLocal:'c1',tipoPersonalizado:'CADENA',nombre:'Cadena 428 Dorada 116L',resumen:'428 Dorada · 116L',configuracion:{longitud:'116L',tipo:'428 Dorada'},precioUnitarioMostrado:190}))
test('Estrella crea configuración correcta',()=>assert.deepEqual(crearEstrellaPersonalizada(45,'Negra',100,'e1').configuracion,{dientes:45,color:'Negra'}))
test('Piñón crea configuración correcta',()=>assert.deepEqual(crearPinonPersonalizado(15,35,'p1').configuracion,{dientes:15,color:'Negro'}))
test('Kit crea configuración anidada correcta',()=>{const l=crearKitPersonalizado({tipo:'428 Negra',longitud:'90L'},{color:'Negra',dientes:45},{color:'Negro',dientes:15},'kit',280,'k1');assert.deepEqual(l.configuracion,{cadena:{tipo:'428 Negra',longitud:'90L'},estrella:{color:'Negra',dientes:45},pinon:{color:'Negro',dientes:15}})})
test('Servicio conserva precio_final',()=>assert.deepEqual(crearServicioPersonalizado('Normal',70,'s1').configuracion,{nivel:'Normal',precio_final:70}))
test('misma configuración profunda aumenta cantidad aunque cambie orden',()=>{let c=agregarLineaPersonalizada([],crearCadenaPersonalizada('90L','428 Negra',90,'a'));c=agregarLineaPersonalizada(c,{...crearCadenaPersonalizada('90L','428 Negra',90,'b'),configuracion:{tipo:'428 Negra',longitud:'90L'}});assert.equal(c.length,1);assert.equal(c[0].cantidad,2)})
test('configuración distinta crea otra línea',()=>{let c=agregarLineaPersonalizada([],crearCadenaPersonalizada('90L','428 Negra',90,'a'));c=agregarLineaPersonalizada(c,crearCadenaPersonalizada('108L','428 Negra',120,'b'));assert.equal(c.length,2)})
test('genera p_lineas_normales',()=>{const p=construirPayloadVenta([crearLineaInventario(producto,2)]);assert.deepEqual(p.lineasNormales,[{producto_id:'p1',cantidad:2}])})
test('genera p_lineas_personalizadas sin datos de presentación ni precio',()=>{const linea=agregarLineaPersonalizada([],crearServicioPersonalizado('Normal',70,'s1'))[0];const p=construirPayloadVenta([linea]);assert.deepEqual(p.lineasPersonalizadas,[{tipo_personalizado:'SERVICIO_MOTO',cantidad:1,configuracion:{nivel:'Normal',precio_final:70}}]);assert.equal('precioUnitarioMostrado' in p.lineasPersonalizadas[0],false);assert.equal('idLocal' in p.lineasPersonalizadas[0],false)})
test('carrito sólo inventario selecciona procesar_venta',()=>assert.equal(seleccionarRpcVenta([crearLineaInventario(producto)]),'procesar_venta'))
test('carrito con personalizado selecciona procesar_venta_mixta',()=>assert.equal(seleccionarRpcVenta(agregarLineaPersonalizada([crearLineaInventario(producto)],crearServicioPersonalizado('Normal',70,'s1'))),'procesar_venta_mixta'))
test('sólo personalizado envía normales vacías',()=>{const c=agregarLineaPersonalizada([],crearServicioPersonalizado('Normal',70,'s1'));assert.deepEqual(construirPayloadVenta(c).lineasNormales,[])})
test('venta mixta divide ambos arrays',()=>{const c=agregarLineaPersonalizada([crearLineaInventario(producto,2)],crearCadenaPersonalizada('90L','428 Negra',90,'c1'));const p=construirPayloadVenta(c);assert.equal(p.lineasNormales.length,1);assert.equal(p.lineasPersonalizadas.length,1)})
