import type { Producto } from '@/types'

export type CascoCatalogo = Producto

export interface GrupoPrecioCascos {
  id: string
  titulo: string
  cascos: CascoCatalogo[]
}
