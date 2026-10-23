import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { construirMovimientosCompletos } from '../utils/movimientos.ts'

const cabecera = (id: string) => ({ ticket_id: id, folio: `F-${id}`, created_at: '2026-10-22T10:00:00Z', total: 300, metodo_pago: 'Efectivo', efectivo_recibido: 500, cambio: 200 })
const normal = (id: string, ticketId: string) => ({ id, ticket_id: ticketId, nombre: `Normal ${id}`, codigo: id, cantidad: 1 })
const personalizada = (id: string, ticketId: string | null) => ({ id, ticket_id: ticketId, nombre: `Personalizado ${id}`, cantidad: 2, created_at: '2026-10-22T09:00:00Z', total: 200 })

test('construye tickets normales, personalizados y mixtos desde la cabecera cobrada', () => {
  const resultado = construirMovimientosCompletos([], [cabecera('n'), cabecera('p'), cabecera('m')], [normal('n1','n'), normal('m1','m')], [personalizada('p1','p'), personalizada('m2','m')])
  assert.equal(resultado.length, 3)
  assert.deepEqual(resultado.find(x=>x.ticket_id==='n')?.lineas_ticket?.map(x=>x.personalizada), [false])
  assert.deepEqual(resultado.find(x=>x.ticket_id==='p')?.lineas_ticket?.map(x=>x.personalizada), [true])
  assert.deepEqual(resultado.find(x=>x.ticket_id==='m')?.lineas_ticket?.map(x=>x.personalizada), [false,true])
  assert.equal(resultado.find(x=>x.ticket_id==='m')?.total, 300)
})
test('cada cabecera genera una sola tarjeta aunque tenga varias líneas', () => { const r=construirMovimientosCompletos([], [cabecera('m')], [normal('1','m'),normal('2','m')], [personalizada('3','m')]); assert.equal(r.filter(x=>x.ticket_id==='m').length,1); assert.equal(r[0].lineas_ticket?.length,3) })
test('personalizado sin ticket queda pendiente y no inventa folio', () => { const r=construirMovimientosCompletos([], [], [], [personalizada('s',null)]); assert.equal(r[0].pendiente_conciliacion,true); assert.equal(r[0].ticket_id == null,true); assert.equal(r[0].folio,undefined) })
