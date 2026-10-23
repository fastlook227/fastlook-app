import type { CarritoLinea, Venta } from '../types/index.ts'
// @ts-expect-error Las pruebas nativas de Node requieren la extensión explícita.
import { obtenerNombreLinea, obtenerPrecioLinea } from './carritoMixto.ts'

export const BREAKPOINT_POS_DESKTOP = 1024
export const esViewportPOSDesktop = (ancho: number, punteroFino: boolean) => ancho >= BREAKPOINT_POS_DESKTOP && punteroFino
export const aCentavos = (valor: number) => Math.round((Number(valor) + Number.EPSILON) * 100)
export const calcularCambioCentavos = (totalCentavos: number, recibidoCentavos: number) => recibidoCentavos - totalCentavos
export const efectivoSuficiente = (totalCentavos: number, recibidoCentavos: number) => recibidoCentavos >= totalCentavos
export const requiereCapturaEfectivo = (esDesktop: boolean, metodo: string) => esDesktop && metodo === 'Efectivo'
export const rpcPOS = (mixta: boolean) => mixta ? 'procesar_venta_mixta_pos' : 'procesar_venta_pos'
const DENOMINACIONES_EFECTIVO = [50, 100, 150, 200, 250, 300, 350, 400, 500]
export const obtenerMontosRapidosEfectivo = (totalCentavos: number) => {
  const total = Math.max(0, totalCentavos)
  const redondeos = [20, 50, 100].map((salto) => Math.ceil(total / (salto * 100)) * salto * 100)
  return [...new Set([total, ...redondeos, ...DENOMINACIONES_EFECTIVO.map((monto) => monto * 100)].filter((monto) => monto >= total))].sort((a, b) => a - b)
}

export interface TicketPOS {
  ticketId: string
  folio: string
  fecha: string
  cajero: string
  metodoPago: string
  total: number
  efectivoRecibido: number | null
  cambio: number | null
  lineas: Array<{ nombre: string; cantidad: number; precio: number; subtotal: number; personalizada: boolean }>
}

export const crearTicketPOS = (datos: Omit<TicketPOS, 'lineas'>, carrito: readonly CarritoLinea[]): TicketPOS => ({ ...datos, lineas: carrito.map((linea) => { const precio = obtenerPrecioLinea(linea); return { nombre: obtenerNombreLinea(linea), cantidad: linea.cantidad, precio, subtotal: precio * linea.cantidad, personalizada: linea.tipoLinea === 'personalizado' } }) })

export const obtenerDatosEfectivoHistorico = (lineas: readonly Venta[]) => {
  const primera = lineas[0]
  return { efectivoRecibido: primera?.efectivo_recibido == null ? null : Number(primera.efectivo_recibido), cambio: primera?.cambio == null ? null : Number(primera.cambio) }
}

export const debeAbrirCajon = (ventaConfirmada: boolean, impresionCorrecta: boolean, metodoPago: string) => ventaConfirmada && impresionCorrecta && metodoPago === 'Efectivo'
