import type { Venta } from '@/types'

export type EstadoDevolucionVenta = 'sin_devoluciones' | 'parcial' | 'total'
export type MotivoDevolucion = 'Producto incorrecto' | 'No le quedó' | 'Defecto' | 'Cambio de opinión' | 'Cambio por otro producto' | 'Otro'
export type PeriodoDevoluciones = 'hoy' | 'ultimos7' | 'mesActual' | 'personalizado'

export interface VentaConDevolucion extends Venta {
  devueltas: number
  disponibles: number
}

export interface TicketDevolucion {
  ticketId: string
  folio: string
  createdAt: string
  metodoPago: string
  lineas: VentaConDevolucion[]
  total: number
  estado: EstadoDevolucionVenta
}

export interface DevolucionDetalle {
  id: string | number
  devolucion_id: string | number
  venta_id: string
  producto_id: string
  codigo: string
  nombre: string
  cantidad: number | string
  precio_unitario_original: number | string
  subtotal_devuelto: number | string
  created_at: string
}

export interface Devolucion {
  id: string | number
  ticket_id: string
  folio: string
  total_devuelto: number | string
  utilidad_revertida?: number | string | null
  metodo_pago: string
  motivo: MotivoDevolucion
  motivo_otro?: string | null
  usuario_nombre: string
  created_at: string
}

export interface ResultadoDevolucion {
  ok: boolean
  idempotente?: boolean
  devolucion_id: string | number
  folio: string
  total_devuelto: number
  productos: number
}
