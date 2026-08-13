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
