import type { Devolucion } from '../types/devoluciones.ts'
import type { LineaCorte, OperacionConciliacionCorte, ReporteCorte, TicketCorte } from '../types/corte.ts'
// @ts-expect-error Las pruebas nativas de Node requieren extensión explícita.
import { obtenerFechaLocal, obtenerHoraLocalFastLook } from './fechas.ts'

type Fila = Record<string, unknown>
const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0
const centavos = (v: unknown) => Math.round(n(v) * 100)
const dinero = (v: number) => v / 100
const normalizarMetodoCorte = (metodo?: string) => { const v = (metodo || 'Efectivo').trim().toLowerCase(); return v === 'efectivo' ? 'Efectivo' : v === 'transferencia' ? 'Transferencia' : v === 'tarjeta' ? 'Tarjeta' : 'Otros' }
const cancelado = (estado: unknown) => ['cancelado', 'cancelada', 'anulado', 'anulada'].includes(String(estado || '').trim().toLowerCase())
const linea = (fila: Fila, personalizada: boolean): LineaCorte => ({
  id: String(fila.id || ''), nombre: String(fila.nombre || fila.tipo_personalizado || 'Producto'), codigo: fila.codigo ? String(fila.codigo) : undefined,
  cantidad: n(fila.cantidad), precioUnitario: n(personalizada ? fila.precio_unitario : fila.precio), total: dinero(centavos(fila.total)),
  costoUnitario: fila.costo_unitario === null || fila.costo_unitario === undefined ? null : n(fila.costo_unitario), personalizada,
})

export function consolidarCorte(args: { tickets: Fila[]; ventas: Fila[]; personalizadas: Fila[]; devoluciones: Devolucion[]; devolucionesDetalle?: Fila[]; inicio: string; fin: string; busqueda?: string; pagina?: number; porPagina?: number }): ReporteCorte {
  const normalesPorTicket = new Map<string, LineaCorte[]>(), personalizadasPorTicket = new Map<string, LineaCorte[]>()
  const conciliacion: OperacionConciliacionCorte[] = []
  let totalAjustes = 0
  for (const fila of args.ventas) {
    const ticketId = fila.ticket_id ? String(fila.ticket_id) : ''
    if (!ticketId) {
      const esAjuste = String(fila.codigo || '').toUpperCase() === 'ABONO'
      if (esAjuste) totalAjustes += centavos(fila.total)
      conciliacion.push({ id: String(fila.id), createdAt: String(fila.created_at), concepto: String(fila.nombre || fila.codigo || 'Operación'), total: dinero(centavos(fila.total)), metodoPago: String(fila.metodo_pago || ''), tipo: esAjuste ? 'ajuste' : 'sin_ticket' })
      continue
    }
    normalesPorTicket.set(ticketId, [...(normalesPorTicket.get(ticketId) || []), linea(fila, false)])
  }
  for (const fila of args.personalizadas) {
    const ticketId = fila.ticket_id ? String(fila.ticket_id) : ''
    if (!ticketId) { conciliacion.push({ id: String(fila.id), createdAt: String(fila.created_at), concepto: String(fila.nombre || fila.tipo_personalizado || 'Personalizado'), total: dinero(centavos(fila.total)), metodoPago: String(fila.metodo_pago || ''), tipo: 'sin_ticket' }); continue }
    personalizadasPorTicket.set(ticketId, [...(personalizadasPorTicket.get(ticketId) || []), linea(fila, true)])
  }

  const tickets: TicketCorte[] = args.tickets.filter((t) => !cancelado(t.estado)).map((t) => ({ ticketId: String(t.ticket_id || t.id), folio: String(t.folio || t.ticket_id || t.id), createdAt: String(t.created_at), metodoPago: String(t.metodo_pago || 'Efectivo'), total: dinero(centavos(t.total)), estado: String(t.estado || 'Cobrado'), lineasNormales: normalesPorTicket.get(String(t.ticket_id || t.id)) || [], lineasPersonalizadas: personalizadasPorTicket.get(String(t.ticket_id || t.id)) || [] }))
  const devoluciones = args.devoluciones.filter((d) => !cancelado((d as unknown as Fila).estado))
  const dias = Math.max(1, Math.round((Date.parse(`${args.fin}T00:00:00Z`) - Date.parse(`${args.inicio}T00:00:00Z`)) / 86400000) + 1)
  const clave = (fecha: string) => dias === 1 ? `${String(obtenerHoraLocalFastLook(fecha)).padStart(2, '0')}:00` : dias <= 31 ? obtenerFechaLocal(fecha) : obtenerFechaLocal(fecha).slice(0, 7)
  let bruto = 0, inventario = 0, personalizados = 0, ajustesTicket = 0, productosVendidos = 0, ganancia = 0, ventasSinCosto = 0
  const metodos = new Map<string, { bruto: number; devuelto: number; tickets: number }>(), grupos = new Map<string, { bruto: number; devuelto: number; tickets: number }>()
  const productos = new Map<string, { productoId?: string; codigo?: string; nombre: string; cantidad: number; total: number; ganancia: number }>()
  for (const ticket of tickets) {
    const total = centavos(ticket.total); bruto += total
    const sumaNormales = ticket.lineasNormales.reduce((a, l) => a + centavos(l.total), 0), sumaPersonalizadas = ticket.lineasPersonalizadas.reduce((a, l) => a + centavos(l.total), 0)
    inventario += sumaNormales; personalizados += sumaPersonalizadas; ajustesTicket += total - sumaNormales - sumaPersonalizadas
    const metodo = normalizarMetodoCorte(ticket.metodoPago), m = metodos.get(metodo) || { bruto: 0, devuelto: 0, tickets: 0 }; m.bruto += total; m.tickets++; metodos.set(metodo, m)
    const k = clave(ticket.createdAt), g = grupos.get(k) || { bruto: 0, devuelto: 0, tickets: 0 }; g.bruto += total; g.tickets++; grupos.set(k, g)
    for (const l of [...ticket.lineasNormales, ...ticket.lineasPersonalizadas]) {
      productosVendidos += l.cantidad
      if (l.costoUnitario === null) ventasSinCosto++; else ganancia += Math.round((l.precioUnitario - l.costoUnitario) * l.cantidad * 100)
      const pk = `${l.personalizada ? 'p' : 'n'}:${l.codigo || l.nombre}`, p = productos.get(pk) || { codigo: l.codigo, nombre: l.nombre, cantidad: 0, total: 0, ganancia: 0 }; p.cantidad += l.cantidad; p.total += l.total; if (l.costoUnitario !== null) p.ganancia += (l.precioUnitario - l.costoUnitario) * l.cantidad; productos.set(pk, p)
    }
  }
  let devuelto = 0, utilidadRevertida = 0, devolucionesSinUtilidad = 0
  for (const d of devoluciones) { const monto = centavos(d.total_devuelto); devuelto += monto; if (d.utilidad_revertida == null) devolucionesSinUtilidad++; else utilidadRevertida += centavos(d.utilidad_revertida); const metodo = normalizarMetodoCorte(d.metodo_pago), m = metodos.get(metodo) || { bruto: 0, devuelto: 0, tickets: 0 }; m.devuelto += monto; metodos.set(metodo, m); const k = clave(d.created_at), g = grupos.get(k) || { bruto: 0, devuelto: 0, tickets: 0 }; g.devuelto += monto; grupos.set(k, g) }
  for (const metodo of ['Efectivo', 'Transferencia', 'Tarjeta']) if (!metodos.has(metodo)) metodos.set(metodo, { bruto: 0, devuelto: 0, tickets: 0 })
  const termino = (args.busqueda || '').trim().toLowerCase(), filtrados = tickets.filter((t) => !termino || [t.folio, t.metodoPago, ...t.lineasNormales.map(l => l.nombre), ...t.lineasPersonalizadas.map(l => l.nombre)].join(' ').toLowerCase().includes(termino))
  const porPagina = Math.min(100, Math.max(1, args.porPagina || 25)), paginas = Math.max(1, Math.ceil(filtrados.length / porPagina)), pagina = Math.min(paginas, Math.max(1, args.pagina || 1))
  const idsDevoluciones = new Set(devoluciones.map(d => String(d.id)))
  const productosDevueltos = (args.devolucionesDetalle || []).filter(d => idsDevoluciones.has(String(d.devolucion_id))).reduce((a,d)=>a+n(d.cantidad),0)
  return { resumen: { ventasBrutas: dinero(bruto), devoluciones: dinero(devuelto), ventasNetas: dinero(bruto - devuelto), gananciaBruta: dinero(ganancia), utilidadRevertida: dinero(utilidadRevertida), gananciaNeta: dinero(ganancia - utilidadRevertida), numeroTickets: tickets.length, ticketPromedioNeto: tickets.length ? dinero(Math.round((bruto - devuelto) / tickets.length)) : 0, productosVendidos, numeroDevoluciones: devoluciones.length, productosDevueltos, ventasInventario: dinero(inventario), ventasPersonalizadas: dinero(personalizados), ajustesTicket: dinero(ajustesTicket), operacionesSinConciliar: conciliacion.filter(c => c.tipo === 'sin_ticket').length, totalAjustes: dinero(totalAjustes) }, ventasAgrupadas: [...grupos.entries()].map(([fecha, g]) => ({ fecha, ventasBrutas: dinero(g.bruto), devoluciones: dinero(g.devuelto), ventasNetas: dinero(g.bruto - g.devuelto), numeroTickets: g.tickets })).sort((a,b)=>a.fecha.localeCompare(b.fecha)), metodos: [...metodos.entries()].map(([metodo,m]) => ({ metodo, bruto: dinero(m.bruto), devuelto: dinero(m.devuelto), neto: dinero(m.bruto-m.devuelto), numeroTickets:m.tickets })), productos: [...productos.values()].sort((a,b)=>b.cantidad-a.cantidad), tickets: filtrados.slice((pagina-1)*porPagina,pagina*porPagina), totalTicketsFiltrados: filtrados.length, pagina, paginas, conciliacion, ventasSinCosto, devolucionesSinUtilidad }
}
