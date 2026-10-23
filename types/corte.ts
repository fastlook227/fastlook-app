export type PeriodoCorte = 'hoy' | 'ayer' | 'ultimos7' | 'mesActual' | 'mesAnterior' | 'personalizado'

export interface ResumenCorte {
  ventasBrutas: number
  devoluciones: number
  ventasNetas: number
  gananciaBruta: number
  utilidadRevertida: number
  gananciaNeta: number
  numeroTickets: number
  ticketPromedioNeto: number
  productosVendidos: number
  numeroDevoluciones: number
  productosDevueltos: number
}

export interface VentaAgrupadaFecha {
  fecha: string
  ventasBrutas: number
  devoluciones: number
  ventasNetas: number
  numeroTickets: number
}

export interface ResumenMetodoPago {
  metodo: string
  bruto: number
  devuelto: number
  neto: number
  numeroTickets: number
}

export interface ProductoVendidoResumen {
  productoId?: string
  codigo?: string
  nombre: string
  cantidad: number
  total: number
  ganancia: number
}

export interface DatosCorte {
  resumen: ResumenCorte
  ventasAgrupadas: VentaAgrupadaFecha[]
  metodos: ResumenMetodoPago[]
  productos: ProductoVendidoResumen[]
  ventasSinCosto: number
  devolucionesSinUtilidad: number
}

export interface TicketCorte {
  ticketId: string
  folio: string
  createdAt: string
  metodoPago: string
  total: number
  estado: string
  lineasNormales: LineaCorte[]
  lineasPersonalizadas: LineaCorte[]
}

export interface LineaCorte {
  id: string
  nombre: string
  codigo?: string
  cantidad: number
  precioUnitario: number
  total: number
  costoUnitario: number | null
  personalizada: boolean
}

export interface OperacionConciliacionCorte {
  id: string
  createdAt: string
  concepto: string
  total: number
  metodoPago: string
  tipo: 'ajuste' | 'sin_ticket'
}

export interface ReporteCorte {
  resumen: ResumenCorte & { ventasInventario: number; ventasPersonalizadas: number; ajustesTicket: number; operacionesSinConciliar: number; totalAjustes: number }
  ventasAgrupadas: VentaAgrupadaFecha[]
  metodos: ResumenMetodoPago[]
  productos: ProductoVendidoResumen[]
  tickets: TicketCorte[]
  totalTicketsFiltrados: number
  pagina: number
  paginas: number
  conciliacion: OperacionConciliacionCorte[]
  ventasSinCosto: number
  devolucionesSinUtilidad: number
}
