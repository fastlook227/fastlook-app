import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { agregarCampo, agregarOpcion, agregarRegla, camposCompatibles, destinoRegla, eliminarCampo, eliminarOpcion, eliminarRegla, idsDuplicados, referenciasCompatibles, serializarDefinicion, sugerirId } from '../utils/productosPersonalizados.ts'
import type { CampoPersonalizado, DefinicionProductoPersonalizado } from '../types/productosPersonalizados'

const base: DefinicionProductoPersonalizado={schema_version:1,campos:[],reglas:[]}
const campo=(id:string,tipo:CampoPersonalizado['tipo']='texto'):CampoPersonalizado=>({id,tipo,etiqueta:id,obligatorio:false})
test('genera IDs seguros y estables',()=>{assert.equal(sugerirId('Árbol Dorado 20'),'arbol_dorado_20');assert.match(sugerirId('20 piezas'),/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)})
test('detecta IDs duplicados',()=>assert.deepEqual(idsDuplicados(['a','b','a','b']),['a','b']))
test('agrega y elimina campos junto con reglas dependientes',()=>{const d=agregarRegla(agregarCampo(base,campo('x')),{id:'r',operador:'valor_manual',destino:'precio',campo_id:'x'});assert.equal(eliminarCampo(d,'x').reglas.length,0)})
test('agrega y elimina opciones',()=>{const c=agregarOpcion({...campo('x','opcion'),opciones:[]},{id:'a',etiqueta:'A'});assert.equal(eliminarOpcion(c,'a').opciones?.length,0)})
test('agrega y elimina reglas',()=>{const d=agregarRegla(base,{id:'r',operador:'ajuste_fijo',destino:'precio',importe:1});assert.equal(eliminarRegla(d,'r').reglas.length,0)})
test('serializa schema_version y definición',()=>assert.deepEqual(JSON.parse(serializarDefinicion(base)),base))
test('destino omitido es precio',()=>assert.equal(destinoRegla(),'precio'))
test('filtra campos por operador',()=>assert.deepEqual(camposCompatibles([campo('o','opcion'),campo('n','numero')],'multiplicar_numero').map(c=>c.id),['n']))
test('filtra referencias por permiso de precio/costo',()=>{const cs=[{...campo('p','producto_referencia'),usar_precio:true},{...campo('c','producto_referencia'),usar_costo:true}];assert.deepEqual(referenciasCompatibles(cs,'costo').map(c=>c.id),['c'])})
