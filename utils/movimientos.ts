import type { MovimientoInventario } from '../types/index.ts'

type Fila = Record<string, unknown>
const texto = (valor: unknown) => valor == null ? '' : String(valor)

export function construirMovimientosCompletos(inventario: MovimientoInventario[], cabeceras: Fila[], normales: Fila[], personalizadas: Fila[]): MovimientoInventario[] {
  const normalesPorTicket = new Map<string, NonNullable<MovimientoInventario['lineas_ticket']>>()
  const personalizadasPorTicket = new Map<string, NonNullable<MovimientoInventario['lineas_ticket']>>()
  for (const linea of normales) {
    const ticketId = texto(linea.ticket_id); if (!ticketId) continue
    normalesPorTicket.set(ticketId, [...(normalesPorTicket.get(ticketId) || []), { id: texto(linea.id), nombre: texto(linea.nombre) || 'Producto', codigo: texto(linea.codigo) || null, cantidad: Number(linea.cantidad || 0), personalizada: false }])
  }
  for (const linea of personalizadas) {
    const ticketId = texto(linea.ticket_id); if (!ticketId) continue
    personalizadasPorTicket.set(ticketId, [...(personalizadasPorTicket.get(ticketId) || []), { id: texto(linea.id), nombre: texto(linea.nombre || linea.tipo_personalizado) || 'Producto personalizado', cantidad: Number(linea.cantidad || 0), personalizada: true }])
  }
  const tickets: MovimientoInventario[] = cabeceras.map((ticket) => { const ticketId = texto(ticket.ticket_id); return { ...ticket, id: `ticket:${ticketId}`, ticket_id: ticketId, created_at: texto(ticket.created_at), folio: texto(ticket.folio), tipo_movimiento: 'VENTA', es_ticket: true, lineas_ticket: [...(normalesPorTicket.get(ticketId) || []), ...(personalizadasPorTicket.get(ticketId) || [])] } })
  const pendientes: MovimientoInventario[] = personalizadas.filter((linea) => !linea.ticket_id).map((linea) => ({ ...linea, id: `personalizado:${texto(linea.id)}`, created_at: texto(linea.created_at), nombre: texto(linea.nombre || linea.tipo_personalizado) || 'Producto personalizado', cantidad: Number(linea.cantidad || 0), tipo_movimiento: 'PERSONALIZADO_SIN_TICKET', pendiente_conciliacion: true, lineas_ticket: [{ id: texto(linea.id), nombre: texto(linea.nombre || linea.tipo_personalizado) || 'Producto personalizado', cantidad: Number(linea.cantidad || 0), personalizada: true }] }))
  return [...tickets, ...pendientes, ...inventario.filter((movimiento) => !movimiento.ticket_id)].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}
