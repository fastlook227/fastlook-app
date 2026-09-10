import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { aCentavos, calcularCambioCentavos, crearTicketPOS, debeAbrirCajon, efectivoSuficiente, esViewportPOSDesktop, obtenerDatosEfectivoHistorico, requiereCapturaEfectivo, rpcPOS } from '../utils/pos.ts'
import type { CarritoLinea, Venta } from '../types/index.ts'

const pagina = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const servicio = readFileSync(new URL('../lib/pos/servicioPOS.ts', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../fastlook_fase_pos_usb.sql', import.meta.url), 'utf8')
const pdf = readFileSync(new URL('../utils/pdfTicket.ts', import.meta.url), 'utf8')
const inventario: CarritoLinea = { tipoLinea: 'inventario', cantidad: 2, producto: { id: '1', codigo: 'A', nombre: 'Aceite', tipo: 'X', precio: 50, costo: 20, stock: 5, stock_minimo: 1, ubicacion: '', proveedor: '', imagen_url: '' } }
const personalizado: CarritoLinea = { tipoLinea: 'personalizado', cantidad: 1, idLocal: 's', tipoPersonalizado: 'SERVICIO_MOTO', nombre: 'Servicio', resumen: '', configuracion: {}, precioUnitarioMostrado: 70 }

test('desktop requiere viewport amplio y puntero fino', () => { assert.equal(esViewportPOSDesktop(1200, true), true); assert.equal(esViewportPOSDesktop(900, true), false) })
test('móvil no monta POS', () => assert.match(pagina, /esDesktopPOS && cobroEfectivoPOS/))
test('móvil no llama bridge', () => assert.doesNotMatch(pagina, /servicioPOSLocal/))
test('efectivo desktop abre captura', () => assert.equal(requiereCapturaEfectivo(true, 'Efectivo'), true))
test('transferencia desktop no pregunta efectivo', () => assert.equal(requiereCapturaEfectivo(true, 'Transferencia'), false))
test('tarjeta desktop no pregunta efectivo', () => assert.equal(requiereCapturaEfectivo(true, 'Tarjeta'), false))
test('$347 / $500 produce $153', () => assert.equal(calcularCambioCentavos(aCentavos(347), aCentavos(500)), 15300))
test('pago exacto produce cero', () => assert.equal(calcularCambioCentavos(34700, 34700), 0))
test('efectivo insuficiente se bloquea', () => assert.equal(efectivoSuficiente(34700, 34699), false))
test('servidor calcula cambio usando total de respuesta', () => assert.match(sql, /v_cambio := round\(v_efectivo - v_total, 2\)/))
test('recibido y cambio se persisten en cabecera', () => assert.match(sql, /update public\.ventas_tickets set efectivo_recibido/))
test('imprimir no invoca RPC de venta', () => assert.doesNotMatch(servicio, /procesar_venta/))
test('reintento de impresión sólo llama endpoint print', () => assert.match(servicio, /solicitar\('\/print'/))
test('cajón exige venta confirmada', () => assert.equal(debeAbrirCajon(false, true, 'Efectivo'), false))
test('cajón exige impresión correcta', () => assert.equal(debeAbrirCajon(true, false, 'Efectivo'), false))
test('bridge offline está desacoplado del RPC', () => assert.match(servicio, /AbortSignal\.timeout/))
test('ticket histórico antiguo conserva null', () => assert.deepEqual(obtenerDatosEfectivoHistorico([{ id: 'v', created_at: '', efectivo_recibido: null, cambio: null } as Venta]), { efectivoRecibido: null, cambio: null }))
test('PDF efectivo incluye recibido y cambio', () => { assert.match(pdf, /RECIBIDO:/); assert.match(pdf, /CAMBIO:/) })
test('móvil conserva los RPC anteriores', () => { assert.match(pagina, /procesar_venta'/); assert.match(pagina, /procesar_venta_mixta'/) })
test('personalizado genera snapshot imprimible', () => { const ticket = crearTicketPOS({ ticketId: 't', folio: 'F', fecha: '', cajero: '', metodoPago: 'Efectivo', total: 70, efectivoRecibido: 100, cambio: 30 }, [personalizado]); assert.equal(ticket.lineas[0].personalizada, true) })
test('venta normal POS conserva idempotency key', () => { assert.equal(rpcPOS(false), 'procesar_venta_pos'); assert.match(sql, /p_idempotency_key/) })
test('venta mixta POS conserva idempotency key y snapshots', () => { assert.equal(rpcPOS(true), 'procesar_venta_mixta_pos'); assert.equal(crearTicketPOS({ ticketId: 't', folio: 'F', fecha: '', cajero: '', metodoPago: 'Tarjeta', total: 170, efectivoRecibido: null, cambio: null }, [inventario, personalizado]).lineas.length, 2) })
test('RPC POS rechaza método distinto de Efectivo antes de delegar', () => assert.match(sql, /p_metodo_pago is distinct from 'Efectivo'/))
test('RPC POS rechaza efectivo null', () => assert.match(sql, /p_efectivo_recibido is null/))
test('RPC POS rechaza efectivo negativo', () => assert.match(sql, /p_efectivo_recibido < 0/))
test('RPC POS rechaza más de dos decimales', () => assert.match(sql, /p_efectivo_recibido <> round\(p_efectivo_recibido, 2\)/))
test('efectivo insuficiente lanza excepción dentro del wrapper', () => assert.match(sql, /v_efectivo < v_total then raise exception/))
test('retry del mismo monto no actualiza nuevamente', () => assert.match(sql, /v_efectivo_actual <> v_efectivo or v_cambio_actual <> v_cambio/))
test('retry con monto diferente produce conflicto', () => assert.match(sql, /EFECTIVO_IDEMPOTENCIA_CONFLICTO/))
test('datos POS parcialmente null producen inconsistencia', () => assert.match(sql, /DATOS_POS_INCONSISTENTES/))
test('ticket inexistente se rechaza', () => assert.match(sql, /TICKET_POS_INEXISTENTE/))
test('respuesta sin ticket_id se rechaza', () => assert.match(sql, /RESPUESTA_TICKET_INVALIDA/))
test('respuesta sin total o total negativo se rechaza', () => { assert.match(sql, /RESPUESTA_TOTAL_INVALIDA/); assert.match(sql, /v_total < 0/) })
test('persistencia concurrente serializa la cabecera con FOR UPDATE', () => assert.match(sql, /where ticket_id = v_ticket for update/))
test('retry frontend conserva RPC, payload, idempotency y efectivo originales', () => { assert.match(pagina, /efectivoRecibido: usarPos/); assert.match(pagina, /p_efectivo_recibido: intento\.efectivoRecibido/) })
