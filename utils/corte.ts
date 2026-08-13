import type { Venta } from '@/types'
import type { Devolucion, DevolucionDetalle } from '@/types/devoluciones'
import type { DatosCorte, ProductoVendidoResumen, ResumenMetodoPago, VentaAgrupadaFecha } from '@/types/corte'
import { obtenerFechaLocal, obtenerHoraLocalFastLook, obtenerRangoFechasFastLook } from '@/utils/fechas'

const numeroSeguro = (valor: unknown) => {
  const numero = Number(valor || 0)
  return Number.isFinite(numero) ? numero : 0
}

export const normalizarMetodoCorte = (metodo?: string) => {
  const valor = (metodo || 'Efectivo').trim().toLowerCase()
  if (valor === 'efectivo') return 'Efectivo'
  if (valor === 'transferencia') return 'Transferencia'
  if (valor === 'tarjeta') return 'Tarjeta'
  return 'Otros'
}

const diferenciaDias = (inicio: string, fin: string) => {
  const desde = Date.parse(`${inicio}T00:00:00Z`)
  const hasta = Date.parse(`${fin}T00:00:00Z`)
  return Math.max(1, Math.round((hasta - desde) / 86400000) + 1)
}

const dentroDelRango = (createdAt: string, inicio: string, fin: string) => {
  const rango = obtenerRangoFechasFastLook(inicio, fin)
  const instante = Date.parse(createdAt)
  return instante >= Date.parse(rango.inicioIso) && instante < Date.parse(rango.finExclusivoIso)
}

export const filtrarVentasCorte = (ventas: Venta[], inicio: string, fin: string) => ventas.filter((venta) => dentroDelRango(venta.created_at, inicio, fin))
export const filtrarDevolucionesCorte = (devoluciones: Devolucion[], inicio: string, fin: string) => devoluciones.filter((devolucion) => dentroDelRango(devolucion.created_at, inicio, fin))

const clavePeriodo = (createdAt: string, dias: number) => {
  const fechaLocal = obtenerFechaLocal(createdAt)
  if (dias === 1) return `${String(obtenerHoraLocalFastLook(createdAt)).padStart(2, '0')}:00`
  if (dias <= 31) return fechaLocal
  return fechaLocal.slice(0, 7)
}

export const calcularDatosCorte = (
  ventas: Venta[],
  devoluciones: Devolucion[],
  detalles: DevolucionDetalle[],
  fechaInicio: string,
  fechaFin: string
): DatosCorte => {
  const dias = diferenciaDias(fechaInicio, fechaFin)
  const ventasProductos = ventas.filter((venta) => venta.codigo !== 'ABONO')
  const ventasBrutas = ventasProductos.reduce((total, venta) => total + numeroSeguro(venta.total), 0)
  const totalDevoluciones = devoluciones.reduce((total, devolucion) => total + numeroSeguro(devolucion.total_devuelto), 0)
  const tickets = new Set(ventasProductos.flatMap((venta) => venta.ticket_id ? [venta.ticket_id] : []))
  const productosVendidos = ventasProductos.reduce((total, venta) => total + numeroSeguro(venta.cantidad), 0)
  const idsDevoluciones = new Set(devoluciones.map((devolucion) => String(devolucion.id)))
  const detallesPeriodo = detalles.filter((detalle) => idsDevoluciones.has(String(detalle.devolucion_id)))
  const productosDevueltos = detallesPeriodo.reduce((total, detalle) => total + numeroSeguro(detalle.cantidad), 0)

  let gananciaBruta = 0
  let ventasSinCosto = 0
  ventasProductos.forEach((venta) => {
    if (venta.costo_unitario === null || venta.costo_unitario === undefined) { ventasSinCosto += 1; return }
    gananciaBruta += (numeroSeguro(venta.precio) - numeroSeguro(venta.costo_unitario)) * numeroSeguro(venta.cantidad)
  })
  let utilidadRevertida = 0
  let devolucionesSinUtilidad = 0
  devoluciones.forEach((devolucion) => {
    if (devolucion.utilidad_revertida === null || devolucion.utilidad_revertida === undefined) { devolucionesSinUtilidad += 1; return }
    utilidadRevertida += numeroSeguro(devolucion.utilidad_revertida)
  })

  const metodos = new Map<string, { bruto: number; devuelto: number; tickets: Set<string> }>()
  const obtenerMetodo = (metodo: string) => {
    const actual = metodos.get(metodo) || { bruto: 0, devuelto: 0, tickets: new Set<string>() }
    metodos.set(metodo, actual)
    return actual
  }
  ventasProductos.forEach((venta) => {
    const actual = obtenerMetodo(normalizarMetodoCorte(venta.metodo_pago))
    actual.bruto += numeroSeguro(venta.total)
    if (venta.ticket_id) actual.tickets.add(venta.ticket_id)
  })
  devoluciones.forEach((devolucion) => { obtenerMetodo(normalizarMetodoCorte(devolucion.metodo_pago)).devuelto += numeroSeguro(devolucion.total_devuelto) })
  ;['Efectivo', 'Transferencia', 'Tarjeta'].forEach(obtenerMetodo)

  const grupos = new Map<string, { datos: VentaAgrupadaFecha; tickets: Set<string> }>()
  const obtenerGrupo = (createdAt: string) => {
    const clave = clavePeriodo(createdAt, dias)
    const actual = grupos.get(clave) || { datos: { fecha: clave, ventasBrutas: 0, devoluciones: 0, ventasNetas: 0, numeroTickets: 0 }, tickets: new Set<string>() }
    grupos.set(clave, actual)
    return actual
  }
  ventasProductos.forEach((venta) => {
    const grupo = obtenerGrupo(venta.created_at)
    grupo.datos.ventasBrutas += numeroSeguro(venta.total)
    if (venta.ticket_id) grupo.tickets.add(venta.ticket_id)
  })
  devoluciones.forEach((devolucion) => { obtenerGrupo(devolucion.created_at).datos.devoluciones += numeroSeguro(devolucion.total_devuelto) })
  const ventasAgrupadas = [...grupos.values()].map(({ datos, tickets: ticketsGrupo }) => ({ ...datos, ventasNetas: datos.ventasBrutas - datos.devoluciones, numeroTickets: ticketsGrupo.size })).sort((a, b) => a.fecha.localeCompare(b.fecha))

  const vendidos = new Map<string, ProductoVendidoResumen>()
  ventasProductos.forEach((venta) => {
    const clave = venta.producto_id || `${venta.codigo || ''}-${venta.nombre || ''}`
    const actual = vendidos.get(clave) || { productoId: venta.producto_id || undefined, codigo: venta.codigo, nombre: venta.nombre || 'Producto sin nombre', cantidad: 0, total: 0, ganancia: 0 }
    actual.cantidad += numeroSeguro(venta.cantidad)
    actual.total += numeroSeguro(venta.total)
    if (venta.costo_unitario !== null && venta.costo_unitario !== undefined) actual.ganancia += (numeroSeguro(venta.precio) - numeroSeguro(venta.costo_unitario)) * numeroSeguro(venta.cantidad)
    vendidos.set(clave, actual)
  })

  const ventasNetas = ventasBrutas - totalDevoluciones
  const ordenMetodos = new Map([['Efectivo', 0], ['Transferencia', 1], ['Tarjeta', 2], ['Otros', 3]])
  const resumenMetodos: ResumenMetodoPago[] = [...metodos.entries()].map(([metodo, valor]) => ({ metodo, bruto: valor.bruto, devuelto: valor.devuelto, neto: valor.bruto - valor.devuelto, numeroTickets: valor.tickets.size })).sort((a, b) => (ordenMetodos.get(a.metodo) ?? 9) - (ordenMetodos.get(b.metodo) ?? 9))
  return {
    resumen: {
      ventasBrutas,
      devoluciones: totalDevoluciones,
      ventasNetas,
      gananciaBruta,
      utilidadRevertida,
      gananciaNeta: gananciaBruta - utilidadRevertida,
      numeroTickets: tickets.size,
      ticketPromedioNeto: tickets.size > 0 ? ventasNetas / tickets.size : 0,
      productosVendidos,
      numeroDevoluciones: devoluciones.length,
      productosDevueltos,
    },
    ventasAgrupadas,
    metodos: resumenMetodos,
    productos: [...vendidos.values()].sort((a, b) => b.cantidad - a.cantidad),
    ventasSinCosto,
    devolucionesSinUtilidad,
  }
}
