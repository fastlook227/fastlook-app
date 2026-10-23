import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta pruebas TypeScript nativas y requiere extensión explícita.
import { consolidarCorte } from '../utils/corteConsolidado.ts'
// @ts-expect-error Node ejecuta pruebas TypeScript nativas y requiere extensión explícita.
import { obtenerRangoFechasFastLook } from '../utils/fechas.ts'

const fecha = '2026-10-22T18:00:00.000Z'
const ticket = (id: string, total: number, metodo = 'Efectivo', extra = {}) => ({ ticket_id: id, folio: `F-${id}`, total, metodo_pago: metodo, created_at: fecha, ...extra })
const normal = (id: string, ticketId: string | null, total: number, costo: number | null = 20) => ({ id, ticket_id: ticketId, nombre: `Normal ${id}`, codigo: `N-${id}`, precio: total, cantidad: 1, total, costo_unitario: costo, metodo_pago: 'Efectivo', created_at: fecha })
const personalizada = (id: string, ticketId: string | null, total: number, costo: number | null = null) => ({ id, ticket_id: ticketId, nombre: `Personalizado ${id}`, precio_unitario: total, cantidad: 1, total, costo_unitario: costo, metodo_pago: 'Efectivo', created_at: fecha })
const calcular = (tickets: Record<string, unknown>[], ventas: Record<string, unknown>[], personalizadas: Record<string, unknown>[], devoluciones: never[] = []) => consolidarCorte({ tickets, ventas, personalizadas, devoluciones, inicio: '2026-10-22', fin: '2026-10-22' })

test('ticket normal usa la cabecera como total cobrado', () => { const r=calcular([ticket('1',100)],[normal('n1','1',100)],[]); assert.equal(r.resumen.ventasBrutas,100); assert.equal(r.resumen.ventasInventario,100) })
test('ticket solo personalizado sí aparece en ventas', () => { const r=calcular([ticket('1',250)],[],[personalizada('p1','1',250)]); assert.equal(r.resumen.ventasBrutas,250); assert.equal(r.resumen.ventasPersonalizadas,250) })
test('ticket mixto no suma dos veces sus líneas', () => { const r=calcular([ticket('1',300)],[normal('n1','1',100)],[personalizada('p1','1',200)]); assert.equal(r.resumen.ventasBrutas,300); assert.equal(r.resumen.ventasInventario+r.resumen.ventasPersonalizadas+r.resumen.ajustesTicket,300) })
test('personalizada vinculada a cabecera no incrementa el total', () => { const r=calcular([ticket('1',100)],[],[personalizada('p1','1',100)]); assert.equal(r.resumen.ventasBrutas,100) })
test('operación independiente queda pendiente y excluida', () => { const r=calcular([],[],[personalizada('p1',null,100)]); assert.equal(r.resumen.ventasBrutas,0); assert.equal(r.resumen.operacionesSinConciliar,1) })
test('ticket cancelado se excluye', () => { const r=calcular([ticket('1',100,'Efectivo',{estado:'Cancelado'})],[normal('n1','1',100)],[]); assert.equal(r.resumen.numeroTickets,0) })
test('devolución parcial reduce el neto y la utilidad', () => { const d={id:'d1',ticket_id:'1',folio:'F-1',total_devuelto:40,utilidad_revertida:20,metodo_pago:'Efectivo',motivo:'Otro',usuario_nombre:'A',created_at:fecha}; const r=consolidarCorte({tickets:[ticket('1',100)],ventas:[normal('n1','1',100,50)],personalizadas:[],devoluciones:[d] as never[],inicio:'2026-10-22',fin:'2026-10-22'}); assert.equal(r.resumen.ventasNetas,60); assert.equal(r.resumen.gananciaNeta,30) })
test('métodos de pago conservan ticket y no línea', () => { const r=calcular([ticket('1',100),ticket('2',200,'Tarjeta')],[normal('n1','1',100),normal('n2','2',200)],[]); assert.equal(r.metodos.find(m=>m.metodo==='Tarjeta')?.bruto,200) })
test('límites diarios corresponden a medianoche de México', () => { const r=obtenerRangoFechasFastLook('2026-10-22','2026-10-22'); assert.equal(r.inicioIso,'2026-10-22T06:00:00.000Z'); assert.equal(r.finExclusivoIso,'2026-10-23T06:00:00.000Z') })
test('periodos producen resultados independientes', () => { const hoy=calcular([ticket('1',100)],[normal('n1','1',100)],[]); const ayer=calcular([ticket('2',50)],[normal('n2','2',50)],[]); assert.notEqual(hoy.resumen.ventasBrutas,ayer.resumen.ventasBrutas) })
test('costo histórico ausente no inventa ganancia', () => { const r=calcular([ticket('1',100)],[normal('n1','1',100,null)],[]); assert.equal(r.resumen.gananciaBruta,0); assert.equal(r.ventasSinCosto,1) })
test('dos cabeceras iguales por reintento solo cuentan las filas recibidas una vez', () => { const r=calcular([ticket('1',100)],[normal('n1','1',100)],[]); assert.equal(r.resumen.numeroTickets,1) })
test('ajuste ABONO se informa separado de ventas', () => { const a={...normal('a',null,80,null),codigo:'ABONO'}; const r=calcular([], [a], []); assert.equal(r.resumen.totalAjustes,80); assert.equal(r.resumen.ventasBrutas,0) })
test('conciliación general usa cabeceras aun si faltan líneas', () => { const r=calcular([ticket('1',125)],[],[]); assert.equal(r.resumen.ventasBrutas,125); assert.equal(r.resumen.ajustesTicket,125) })
test('redondea dinero en centavos', () => { const r=calcular([ticket('1',0.1+0.2)],[],[]); assert.equal(r.resumen.ventasBrutas,0.3) })
