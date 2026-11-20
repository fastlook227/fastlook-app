import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { crearArgumentosCambioStock, interpretarStockNuevo } from '../utils/stock.ts'

const modal = readFileSync(new URL('../components/CambiarStockDialog.tsx', import.meta.url), 'utf8')

test('interpreta entradas de stock sin conversiones silenciosas', () => {
  const casos = [
    { entrada: '9', numero: 9, valido: true },
    { entrada: '0', numero: 0, valido: true },
    { entrada: '', numero: Number.NaN, valido: false },
    { entrada: '-1', numero: -1, valido: false },
    { entrada: '1.5', numero: 1.5, valido: false },
    { entrada: 'abc', numero: Number.NaN, valido: false },
    { entrada: '09', numero: 9, valido: true },
  ]

  for (const caso of casos) {
    const resultado = interpretarStockNuevo(caso.entrada)
    assert.equal(resultado.valido, caso.valido, caso.entrada)
    if (Number.isNaN(caso.numero)) assert.ok(Number.isNaN(resultado.numero), caso.entrada)
    else assert.equal(resultado.numero, caso.numero, caso.entrada)
  }
})

test('7 → 9 construye exactamente los argumentos esperados', () => {
  const interpretacion = interpretarStockNuevo('9')
  assert.deepEqual(interpretacion, { texto: '9', numero: 9, valido: true })
  assert.equal(interpretacion.numero - 7, 2)
  assert.deepEqual(crearArgumentosCambioStock({
    productoId: 'producto-prueba',
    stockEsperado: 7,
    stockNuevoTexto: '9',
    motivo: '',
  }), {
    p_producto_id: 'producto-prueba',
    p_stock_esperado: 7,
    p_stock_nuevo: 9,
    p_motivo: null,
  })
})

test('una entrada inválida nunca construye argumentos RPC', () => {
  for (const entrada of ['', '-1', '1.5', 'abc']) {
    assert.equal(crearArgumentosCambioStock({
      productoId: 'producto-prueba',
      stockEsperado: 7,
      stockNuevoTexto: entrada,
      motivo: '',
    }), null)
  }
})

test('cubre diferencias 7 → 9, 7 → 5, 7 → 7 y 7 → 0', () => {
  assert.equal(interpretarStockNuevo('9').numero - 7, 2)
  assert.equal(interpretarStockNuevo('5').numero - 7, -2)
  assert.equal(interpretarStockNuevo('7').numero - 7, 0)
  assert.equal(interpretarStockNuevo('0').numero - 7, -7)
})

test('10 a 15 muestra +5 y separa nueva existencia del motivo', () => {
  assert.equal(interpretarStockNuevo('15').numero - 10, 5)
  assert.match(modal, /De \$\{stockEsperado\} a \$\{interpretacionStock\.numero\}/)
  assert.match(modal, /className="fl-stock-new-value"/)
  assert.match(modal, /Nueva existencia/)
  assert.match(modal, /className="fl-stock-reason"/)
})

test('selecciona el valor actual, usa teclado numérico y bloquea doble envío', () => {
  assert.match(modal, /inputRef\.current\?\.select\(\)/)
  assert.match(modal, /type="number" inputMode="numeric" min="0" step="1"/)
  assert.match(modal, /if \(actualizandoRef\.current \|\| resultado\) return/)
})

test('sin cambios depende del RPC y no registra movimientos desde el modal', () => {
  assert.match(modal, /return 'Sin cambios\.'/)
  assert.match(modal, /STOCK_SIN_CAMBIOS/)
  assert.doesNotMatch(modal, /from\('movimientos_inventario'\)\.insert/)
})
