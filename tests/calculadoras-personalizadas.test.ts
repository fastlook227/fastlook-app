import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { LONGITUDES_CADENA, NIVELES_SERVICIO, PRECIOS_KIT_PERMITIDOS, TIPOS_CADENA, calcularCadena, calcularEstrella, calcularPinon, precioKitPermitidoMasCercano, precioServicioPorNivel, redondearMultiplo5 } from '../utils/calculadorasPersonalizadas.ts'

test('calcula las 16 combinaciones de cadena',()=>{for(let l=0;l<LONGITUDES_CADENA.length;l++)for(let t=0;t<TIPOS_CADENA.length;t++)assert.equal(calcularCadena(l,t),LONGITUDES_CADENA[l].precio+TIPOS_CADENA[t].ajuste)})
test('calcula y redondea estrella',()=>{assert.equal(calcularEstrella(45,'Negra'),100);assert.equal(calcularEstrella(45,'Dorada'),135)})
test('calcula y redondea piñón',()=>{assert.equal(calcularPinon(15),35);assert.equal(calcularPinon(18),40)})
test('redondea hacia abajo, arriba y conserva múltiplos',()=>{assert.equal(redondearMultiplo5(101),100);assert.equal(redondearMultiplo5(103),105);assert.equal(redondearMultiplo5(105),105)})
test('elige precios permitidos más cercanos',()=>{assert.equal(precioKitPermitidoMasCercano(291),300);assert.equal(precioKitPermitidoMasCercano(311),320);assert.equal(precioKitPermitidoMasCercano(408),400);for(const p of PRECIOS_KIT_PERMITIDOS)assert.equal(precioKitPermitidoMasCercano(p),p)})
test('en empate del kit elige el mayor',()=>{assert.equal(precioKitPermitidoMasCercano(290),300);assert.equal(precioKitPermitidoMasCercano(310),320);assert.equal(precioKitPermitidoMasCercano(410),420)})
test('devuelve los seis niveles de servicio',()=>NIVELES_SERVICIO.forEach((nivel,i)=>assert.equal(precioServicioPorNivel(i),nivel.precio)))
