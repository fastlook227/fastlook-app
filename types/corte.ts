export type PeriodoCorte = 'hoy' | 'ayer' | 'ultimos7' | 'mesActual' | 'mesAnterior' | 'personalizado'

export interface ResumenCorte {
  totalVendido: number
  ganancia: number
  numeroVentas: number
  productosVendidos: number
  ticketPromedio: number
}

export interface VentaAgrupadaFecha {
  fecha: string
  total: number
  ganancia: number
  costo: number
  numeroVentas: number
}

export interface ResumenMetodoPago {
  metodo: string
  total: number
  porcentaje: number
  numeroVentas: number
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
  productosSinCosto: number
}
