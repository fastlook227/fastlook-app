import type { Venta } from '@/types'
import type { DevolucionDetalle, EstadoDevolucionVenta, TicketDevolucion, VentaConDevolucion } from '@/types/devoluciones'
import { normalizarTextoBusqueda } from '@/utils/busqueda'

const numero = (valor: unknown) => {
  const resultado = Number(valor || 0)
  return Number.isFinite(resultado) ? resultado : 0
}

export const monedaDevolucion = (valor: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor)

export const cantidadesDevueltasPorVenta = (detalles: DevolucionDetalle[]) => detalles.reduce((acumulado, detalle) => {
  const clave = String(detalle.venta_id)
  acumulado.set(clave, (acumulado.get(clave) || 0) + numero(detalle.cantidad))
  return acumulado
}, new Map<string, number>())

const estadoTicket = (lineas: VentaConDevolucion[]): EstadoDevolucionVenta => {
  const vendidas = lineas.reduce((total, linea) => total + numero(linea.cantidad), 0)
  const devueltas = lineas.reduce((total, linea) => total + linea.devueltas, 0)
  if (devueltas <= 0) return 'sin_devoluciones'
  return devueltas >= vendidas ? 'total' : 'parcial'
}

export const agruparVentasPorTicket = (ventas: Venta[], detalles: DevolucionDetalle[]) => {
  const devueltas = cantidadesDevueltasPorVenta(detalles)
  const tickets = new Map<string, TicketDevolucion>()
  const heredadas: Venta[] = []

  ventas.forEach((venta) => {
    if (venta.codigo === 'ABONO') return
    if (!venta.ticket_id || !venta.folio) { heredadas.push(venta); return }
    const cantidad = numero(venta.cantidad)
    const yaDevueltas = devueltas.get(String(venta.id)) || 0
    const linea: VentaConDevolucion = { ...venta, devueltas: yaDevueltas, disponibles: Math.max(0, cantidad - yaDevueltas) }
    const existente = tickets.get(venta.ticket_id)
    if (existente) {
      existente.lineas.push(linea)
      existente.total += numero(venta.total)
    } else {
      tickets.set(venta.ticket_id, {
        ticketId: venta.ticket_id,
        folio: venta.folio,
        createdAt: venta.created_at,
        metodoPago: venta.metodo_pago || 'Efectivo',
        lineas: [linea],
        total: numero(venta.total),
        estado: 'sin_devoluciones',
      })
    }
  })

  const lista = [...tickets.values()].map((ticket) => ({ ...ticket, estado: estadoTicket(ticket.lineas) }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return { tickets: lista, heredadas: heredadas.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)) }
}

export const filtrarTicketsDevolucion = (tickets: TicketDevolucion[], busqueda: string) => {
  const termino = normalizarTextoBusqueda(busqueda)
  if (!termino) return tickets
  return tickets.filter((ticket) => normalizarTextoBusqueda([
    ticket.folio,
    ...ticket.lineas.flatMap((linea) => [linea.codigo || '', linea.nombre || '']),
  ].join(' ')).includes(termino))
}

const mensajes: Record<string, string> = {
  SIN_SESION: 'Tu sesión terminó. Inicia sesión nuevamente.',
  USUARIO_INACTIVO: 'Tu usuario está inactivo y no puede procesar devoluciones.',
  ROL_NO_PERMITIDO: 'Tu usuario no tiene permiso para procesar devoluciones.',
  IDEMPOTENCIA_INVALIDA: 'No fue posible identificar esta operación. Inténtalo nuevamente.',
  MOTIVO_INVALIDO: 'Selecciona un motivo válido.',
  LINEAS_INVALIDAS: 'Revisa los productos y cantidades seleccionados.',
  VENTA_INEXISTENTE: 'La venta seleccionada ya no está disponible.',
  ABONO_NO_DEVOLVIBLE: 'Los abonos no se pueden devolver.',
  TICKET_INVALIDO: 'El ticket contiene información incompleta o inconsistente.',
  PRODUCTO_INEXISTENTE: 'Uno de los productos de la venta ya no existe.',
  CANTIDAD_EXCEDIDA: 'Parte de esta venta ya fue devuelta. Actualiza la información e inténtalo nuevamente.',
  METODO_INCONSISTENTE: 'El ticket contiene métodos de pago inconsistentes.',
  PRODUCTO_INVALIDO: 'No fue posible actualizar el inventario de uno de los productos.',
}

export const mensajeErrorDevolucion = (mensaje?: string) => {
  const prefijo = Object.keys(mensajes).find((clave) => mensaje?.includes(`${clave}:`))
  return prefijo ? mensajes[prefijo] : 'No fue posible procesar la devolución. Conservamos la misma operación para que puedas reintentar con seguridad.'
}

export const esErrorCantidadExcedida = (mensaje?: string) => Boolean(mensaje?.includes('CANTIDAD_EXCEDIDA:'))
