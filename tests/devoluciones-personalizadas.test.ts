import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { agruparVentasPorTicket, detallesPersonalizadosDevolucion, lineasPersonalizadasDevolucion, separarLineasDevolucion } from '../utils/devoluciones.ts'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { consolidarCorte } from '../utils/corteConsolidado.ts'

const sql = readFileSync(new URL('../fastlook_devoluciones_personalizadas.sql', import.meta.url), 'utf8')
const codigo = sql.replace(/--.*$/gm, '')
const funcion = codigo.slice(codigo.indexOf('function public.procesar_devolucion_mixta'), codigo.indexOf('revoke all on function public.procesar_devolucion_mixta'))
const pagina = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const componente = readFileSync(new URL('../components/devoluciones/Devoluciones.tsx', import.meta.url), 'utf8')
const voz = readFileSync(new URL('../components/VentaVozGlobal.tsx', import.meta.url), 'utf8')

const fecha = '2026-10-22T18:00:00.000Z'
const normal = { id: 'n1', ticket_id: 't1', folio: 'F-1', producto_id: 'prod', codigo: 'C1', nombre: 'Cadena', precio: 100, cantidad: 2, total: 200, metodo_pago: 'Efectivo', created_at: fecha }
const personalizada = (id: string, ticket: string, extra = {}) => ({ id, ticket_id: ticket, folio: `F-${ticket}`, created_at: fecha, nombre: 'Servicio de moto - Normal', tipo_personalizado: 'SERVICIO_MOTO', precio_unitario: 75, cantidad: 3, total: 225, metodo_pago: 'Efectivo', ...extra })

test('ticket mixto muestra productos y personalizadas juntos, con tope de unidades', () => {
  const lineas = lineasPersonalizadasDevolucion([personalizada('v1', 't1')], new Set())
  const detalles = detallesPersonalizadosDevolucion([{ id: 'd1', devolucion_id: 'dev', venta_personalizada_id: 'v1', nombre: 'Servicio de moto - Normal', cantidad: 1, precio_unitario_original: 75, subtotal_devuelto: 75, created_at: fecha }])
  const { tickets } = agruparVentasPorTicket([normal, ...lineas], detalles)
  assert.equal(tickets.length, 1)
  assert.equal(tickets[0].lineas.length, 2)
  const linea = tickets[0].lineas.find((l: { id: string }) => l.id === 'p:v1')!
  assert.equal(linea.precio, 75); assert.equal(linea.devueltas, 1); assert.equal(linea.disponibles, 2)
  assert.equal(linea.producto_id, null)
  assert.equal(tickets[0].estado, 'parcial')
})
test('la venta por voz aparece como "Venta rápida por voz"', () => {
  assert.equal(lineasPersonalizadasDevolucion([personalizada('v1', 'voz')], new Set(['voz']))[0].nombre, 'Venta rápida por voz')
  assert.equal(lineasPersonalizadasDevolucion([personalizada('v2', 'otro')], new Set(['voz']))[0].nombre, 'Servicio de moto - Normal')
})
test('una sola operación separa líneas de inventario y personalizadas', () => {
  assert.deepEqual(separarLineasDevolucion([{ venta_id: 'n1', cantidad: 1 }, { venta_id: 'p:v1', cantidad: 2 }]), { normales: [{ venta_id: 'n1', cantidad: 1 }], personalizadas: [{ venta_personalizada_id: 'v1', cantidad: 2 }] })
  assert.match(componente, /rpc\('procesar_devolucion_mixta', \{ \.\.\.comunes, p_lineas: normales, p_lineas_personalizadas: personalizadas \}\)/)
  assert.match(componente, /errorRpc\?\.code === 'PGRST202' && !personalizadas\.length/)
})
test('Devoluciones oculta tickets cancelados y sólo ofrece personalizadas con la tabla nueva', () => {
  assert.match(pagina, /from\('ventas_tickets'\)\.select\('ticket_id'\)\.eq\('estado', 'Cancelado'\)/)
  assert.match(pagina, /filter\(\(venta\) => !ticketsCancelados\.has\(String\(venta\.ticket_id\)\)\)/)
  assert.match(pagina, /const conPersonalizadas = !detallesPersonalizados\.error/)
  assert.match(pagina, /ventas=\{ventasDevolucion\}/)
})
test('Corte resta la devolución personalizada por cabecera sin tocar la ganancia', () => {
  const base = { tickets: [{ ticket_id: 't', folio: 'F', total: 300, metodo_pago: 'Efectivo', created_at: fecha }], ventas: [{ ...normal, ticket_id: 't', precio: 100, cantidad: 1, total: 100, costo_unitario: 60 }], personalizadas: [{ ...personalizada('v', 't'), precio_unitario: 200, cantidad: 1, total: 200, costo_unitario: null }], inicio: '2026-10-22', fin: '2026-10-22' }
  const r = consolidarCorte({ ...base, devoluciones: [{ id: 'd', ticket_id: 't', folio: 'F', total_devuelto: 200, utilidad_revertida: 0, metodo_pago: 'Efectivo', motivo: 'Defecto' as const, usuario_nombre: 'Prueba', created_at: fecha }], devolucionesDetalle: [{ devolucion_id: 'd', cantidad: 1 }] })
  assert.equal(r.resumen.ventasNetas, 100); assert.equal(r.resumen.gananciaBruta, 40); assert.equal(r.resumen.gananciaNeta, 40); assert.equal(r.resumen.productosDevueltos, 1)
})
test('SQL: tabla nueva con FK, checks, índices y RLS de lectura', () => {
  assert.match(codigo, /^begin;/m); assert.match(codigo, /^commit;/m)
  assert.match(codigo, /devolucion_id %s not null references public\.devoluciones\(id\)/)
  assert.match(codigo, /venta_personalizada_id %s not null references public\.ventas_personalizadas\(id\)/)
  assert.match(codigo, /cantidad integer not null check \(cantidad > 0\)/)
  assert.match(codigo, /precio_unitario_original numeric\(12,2\) not null check \(precio_unitario_original >= 0\)/)
  assert.match(codigo, /subtotal_devuelto numeric\(12,2\) not null check \(subtotal_devuelto > 0\)/)
  assert.match(codigo, /devoluciones_personalizadas_detalle\(devolucion_id\)/); assert.match(codigo, /devoluciones_personalizadas_detalle\(venta_personalizada_id\)/)
  assert.match(codigo, /enable row level security/)
  assert.match(codigo, /for select to authenticated\s+using \(exists \(select 1 from public\.usuarios u where u\.id = auth\.uid\(\) and u\.activo = true and u\.rol in \('Admin', 'Vendedor'\)\)\)/)
  assert.doesNotMatch(codigo, /\b(delete from|truncate|drop)\b/i)
  assert.doesNotMatch(codigo, /function public\.procesar_devolucion\(/)
})
test('SQL: misma autenticación, idempotencia y motivos que procesar_devolucion', () => {
  for (const mensaje of ['SIN_SESION: Debes iniciar sesión.', 'ROL_NO_PERMITIDO: El usuario no tiene un perfil autorizado.', 'USUARIO_INACTIVO: El usuario está inactivo.', 'ROL_NO_PERMITIDO: El usuario no puede procesar devoluciones.', 'IDEMPOTENCIA_INVALIDA: Falta idempotency_key.', 'MOTIVO_INVALIDO: El motivo seleccionado no es válido.', 'MOTIVO_INVALIDO: Especifica el motivo de la devolución.', 'LINEAS_INVALIDAS: Venta o cantidad no válida.', 'CANTIDAD_EXCEDIDA: La venta %s sólo tiene %s pieza(s) disponibles.'])
    assert.ok(funcion.includes(mensaje), mensaje)
  assert.match(funcion, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(p_idempotency_key::text, 0\)\)/)
  assert.match(funcion, /when unique_violation then/)
  assert.match(funcion, /security definer set search_path = ''/)
})
test('SQL: personalizadas sólo reembolsan; inventario delega en procesar_devolucion', () => {
  assert.doesNotMatch(funcion, /(update|delete from|insert into)\s+public\.ventas_personalizadas/i)
  assert.doesNotMatch(funcion, /public\.productos|movimientos_inventario|insert into public\.devoluciones_detalle/i)
  assert.match(funcion, /perform public\.procesar_devolucion\(p_idempotency_key, p_motivo, v_lineas, p_motivo_otro\)/)
  assert.match(funcion, /from public\.devoluciones_personalizadas_detalle dpd where dpd\.venta_personalizada_id = v_venta\.id/)
  assert.match(funcion, /v_linea\.cantidad > v_cantidad_disponible/)
  assert.match(funcion, /values \(p_idempotency_key, v_ticket_id, v_folio, v_total_personalizado, null, 0,/)
  assert.match(funcion, /update public\.devoluciones set total_devuelto = total_devuelto \+ v_total_personalizado where id = v_devolucion_id/)
  assert.doesNotMatch(funcion, /set [^;]*utilidad_revertida/)
})
test('SQL: rechaza tickets cancelados y deshacer_venta_voz se bloquea con devolución', () => {
  assert.match(funcion, /where t\.ticket_id::text = v_ticket_texto for update/)
  assert.match(funcion, /v_estado = 'Cancelado'[\s\S]*TICKET_CANCELADO/)
  const deshacer = codigo.slice(codigo.indexOf('function public.deshacer_venta_voz'))
  assert.match(deshacer, /exists \(select 1 from public\.devoluciones d where d\.ticket_id=v_op\.ticket_id\)[\s\S]*VENTA_CON_DEVOLUCION/)
  assert.ok(deshacer.indexOf('VENTA_CON_DEVOLUCION') < deshacer.indexOf("set estado='Cancelado'"))
  assert.match(voz, /VENTA_CON_DEVOLUCION:/)
})
