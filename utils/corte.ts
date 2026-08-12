import type { Producto, Venta } from '@/types'
import type { DatosCorte, ProductoVendidoResumen, ResumenMetodoPago, VentaAgrupadaFecha } from '@/types/corte'
import { obtenerFechaLocal, obtenerHoraLocalFastLook, obtenerRangoFechasFastLook } from '@/utils/fechas'
import { calcularResumenVentas } from '@/utils/ventas'

const numeroSeguro = (valor: unknown) => {
  const numero = Number(valor || 0)
  return Number.isFinite(numero) ? numero : 0
}

const normalizarMetodo = (metodo?: string) => {
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

export const filtrarVentasCorte = (ventas: Venta[], inicio: string, fin: string) => {
  const rango = obtenerRangoFechasFastLook(inicio, fin)
  const desde = Date.parse(rango.inicioIso)
  const hasta = Date.parse(rango.finExclusivoIso)
  return ventas.filter((venta) => { const instante = Date.parse(venta.created_at); return instante >= desde && instante < hasta })
}

export const calcularDatosCorte = (
  ventas: Venta[],
  productos: Producto[],
  fechaInicio: string,
  fechaFin: string
): DatosCorte => {
  const resumenExistente = calcularResumenVentas(ventas, productos)
  const productosPorId = new Map(productos.map((producto) => [producto.id, producto]))
  const dias = diferenciaDias(fechaInicio, fechaFin)
  const agrupadas = new Map<string, VentaAgrupadaFecha>()
  const metodos = new Map<string, { total: number; numeroVentas: number }>()
  const vendidos = new Map<string, ProductoVendidoResumen>()
  const sinCosto = new Set<string>()

  ventas.forEach((venta) => {
    const cantidad = numeroSeguro(venta.cantidad)
    const total = numeroSeguro(venta.total)
    const precio = numeroSeguro(venta.precio)
    const producto = venta.producto_id ? productosPorId.get(venta.producto_id) : undefined
    const costoUnitario = numeroSeguro(producto?.costo)
    const costo = costoUnitario * cantidad
    const ganancia = producto ? (precio - costoUnitario) * cantidad : 0
    const fechaLocal = obtenerFechaLocal(venta.created_at)
    const fecha = dias === 1
      ? `${String(obtenerHoraLocalFastLook(venta.created_at)).padStart(2, '0')}:00`
      : dias <= 31
        ? fechaLocal
        : fechaLocal.slice(0, 7)
    const grupo = agrupadas.get(fecha) || { fecha, total: 0, ganancia: 0, costo: 0, numeroVentas: 0 }
    grupo.total += total
    grupo.ganancia += ganancia
    grupo.costo += costo
    grupo.numeroVentas += 1
    agrupadas.set(fecha, grupo)

    const metodo = normalizarMetodo(venta.metodo_pago)
    const metodoActual = metodos.get(metodo) || { total: 0, numeroVentas: 0 }
    metodoActual.total += total
    metodoActual.numeroVentas += 1
    metodos.set(metodo, metodoActual)

    if (venta.codigo !== 'ABONO') {
      const clave = venta.producto_id || `${venta.codigo || ''}-${venta.nombre || ''}`
      const vendido = vendidos.get(clave) || {
        productoId: venta.producto_id || undefined,
        codigo: venta.codigo,
        nombre: venta.nombre || 'Producto sin nombre',
        cantidad: 0,
        total: 0,
        ganancia: 0,
      }
      vendido.cantidad += cantidad
      vendido.total += total
      vendido.ganancia += ganancia
      vendidos.set(clave, vendido)
      if (!producto || costoUnitario <= 0) sinCosto.add(clave)
    }
  })

  const resumenMetodos: ResumenMetodoPago[] = [...metodos.entries()]
    .map(([metodo, valor]) => ({
      metodo,
      total: valor.total,
      porcentaje: resumenExistente.total > 0 ? (valor.total / resumenExistente.total) * 100 : 0,
      numeroVentas: valor.numeroVentas,
    }))
    .sort((a, b) => b.total - a.total)

  return {
    resumen: {
      totalVendido: resumenExistente.total,
      ganancia: resumenExistente.ganancia,
      numeroVentas: resumenExistente.numeroVentas,
      productosVendidos: resumenExistente.productosVendidos,
      ticketPromedio: resumenExistente.numeroVentas > 0
        ? resumenExistente.total / resumenExistente.numeroVentas
        : 0,
    },
    ventasAgrupadas: [...agrupadas.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    metodos: resumenMetodos,
    productos: [...vendidos.values()].sort((a, b) => b.cantidad - a.cantidad),
    productosSinCosto: sinCosto.size,
  }
}
