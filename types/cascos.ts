import type { Producto } from '@/types'

export type CascoCatalogo = Producto

export interface OpcionesPDFCascos {
  incluirPrecio: boolean
  incluirStock: boolean
  incluirAgotados: boolean
}

export interface DatosFormularioCasco {
  codigo: string
  codigoAutomatico: boolean
  nombre: string
  precio: number
  costo: number
  stock: number
  stock_minimo: number
  talla: string
  certificacion: 'DOT' | 'ECE' | 'DOT + ECE' | 'Sin especificar'
  ubicacion: string
  proveedor: string
  imagen_url: string
}

export interface GrupoPrecioCascos {
  id: string
  titulo: string
  cascos: CascoCatalogo[]
}
