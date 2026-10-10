import type { TicketBridge } from './types.js'

const texto = (valor: unknown, maximo: number) => typeof valor === 'string' && valor.trim().length > 0 && valor.length <= maximo
const dinero = (valor: unknown) => typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && Math.round(valor * 100) === valor * 100

export function validarTicket(valor: unknown): TicketBridge {
  if (!valor || typeof valor !== 'object') throw new Error('TICKET_INVALIDO')
  const ticket = valor as Record<string, unknown>
  if (!texto(ticket.ticketId, 100) || !texto(ticket.folio, 80) || !texto(ticket.fecha, 80) || !texto(ticket.cajero, 120) || !texto(ticket.metodoPago, 40) || !dinero(ticket.total)) throw new Error('TICKET_CABECERA_INVALIDA')
  if (ticket.efectivoRecibido !== null && !dinero(ticket.efectivoRecibido)) throw new Error('TICKET_EFECTIVO_INVALIDO')
  if (ticket.cambio !== null && !dinero(ticket.cambio)) throw new Error('TICKET_CAMBIO_INVALIDO')
  if (!Array.isArray(ticket.lineas) || ticket.lineas.length < 1 || ticket.lineas.length > 200) throw new Error('TICKET_LINEAS_INVALIDAS')
  for (const linea of ticket.lineas) {
    if (!linea || typeof linea !== 'object') throw new Error('TICKET_LINEA_INVALIDA')
    const item = linea as Record<string, unknown>
    if (!texto(item.nombre, 200) || !Number.isInteger(item.cantidad) || Number(item.cantidad) < 1 || Number(item.cantidad) > 9999 || !dinero(item.precio) || !dinero(item.subtotal) || typeof item.personalizada !== 'boolean') throw new Error('TICKET_LINEA_INVALIDA')
  }
  return ticket as unknown as TicketBridge
}
