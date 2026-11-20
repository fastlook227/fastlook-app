export type ClaveProveedorCatalogo = 'REMO' | 'CEDIS' | 'AQUILA'

export interface OfertaProveedor {
  id: string
  nivel: string
  descuento_porcentaje: number
  costo_efectivo: number
  precio_sugerido: number
  vigente_desde: string | null
}

export interface ProductoCatalogoProveedor {
  id: string
  proveedor_id: string
  proveedor_clave: ClaveProveedorCatalogo
  proveedor_nombre: string
  codigo_original: string
  codigo_barras: string | null
  nombre: string
  descripcion: string
  categoria: string
  marca: string
  compatibilidades: string[]
  variantes: string[]
  imagen_url: string | null
  imagen_thumbnail_url: string | null
  precio_venta_sugerido: number | null
  // Lista que cobra el servidor: precio aprobado o costo × 1.30. Ausente con el RPC de catálogo anterior.
  precio_venta?: number | null
  precio_actualizado_at: string | null
  ambiguo: boolean
  inventario_producto_id: string | null
  inventario_precio: number | null
  ofertas: OfertaProveedor[]
}

export interface ResumenCatalogoProveedor {
  productos: ProductoCatalogoProveedor[]
  proveedores: Array<{ id: string; clave: ClaveProveedorCatalogo; nombre: string; nivel_compra: string | null }>
  es_admin: boolean
}

export interface RegistroImportacionProveedor {
  codigoOriginal: string
  codigoBarras?: string | null
  nombre: string
  descripcion?: string
  categoria?: string
  marca?: string
  compatibilidades?: string[]
  variantes?: string[]
  precioBase?: number | null
  escalas: Array<{ nivel: string; descuentoPorcentaje: number; costoEfectivo: number }>
  imagenReferencia?: string | null
  origenPagina?: number | null
  origenFila?: number | null
  ambiguo?: boolean
}
