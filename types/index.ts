export type RolUsuario = 'Admin' | 'Vendedor'

export interface PerfilUsuario {
  id: string
  correo: string
  nombre: string
  rol: RolUsuario
  activo: boolean
}

export type Tab =
  | 'precios'
  | 'venta'
  | 'stock'
  | 'ia'
  | 'clientes'
  | 'inventario'
  | 'corte'
  | 'proveedores'
  | 'compras'
  | 'movimientos'
  | 'dashboard'
  | 'usuarios'

export interface Producto {
  id: string
  codigo: string
  nombre: string
  tipo: string
  precio: number
  costo: number
  stock: number
  stock_minimo: number
  ubicacion: string
  proveedor: string
  imagen_url: string
  [key: string]: unknown
}

export interface CarritoItem extends Producto {
  cantidad: number
}

export interface Venta {
  id: string
  created_at: string
  producto_id?: string | null
  codigo?: string
  nombre?: string
  precio?: number | string
  cantidad?: number | string
  total?: number | string
  metodo_pago?: string
  [key: string]: unknown
}

export interface Proveedor {
  id: string
  nombre: string
  telefono: string
  productos: string
  tiempo_entrega: string
  notas: string
  [key: string]: unknown
}

export interface MovimientoInventario {
  id: string
  created_at: string
  producto_id?: string
  codigo?: string
  nombre?: string
  tipo_movimiento?: string
  cantidad?: number | string
  stock_anterior?: number | string
  stock_nuevo?: number | string
  nota?: string
  [key: string]: unknown
}

export interface CorteCaja {
  id: string
  created_at?: string
  fecha_inicio?: string
  fecha_fin?: string
  total?: number | string
  ganancia?: number | string
  efectivo?: number | string
  transferencia?: number | string
  tarjeta?: number | string
  [key: string]: unknown
}

export interface Cliente {
  id: string
  nombre: string
  numero: string
  moto: string
  deuda: number
  [key: string]: unknown
}

export interface MovimientoCliente {
  id: string
  created_at: string
  cliente_id: string
  tipo?: string
  monto?: number | string
  nota?: string
  [key: string]: unknown
}

export interface FormProducto {
  id: string
  codigo: string
  nombre: string
  tipo: string
  precio: string | number
  costo: string | number
  stock: string | number
  stock_minimo: string | number
  ubicacion: string
  proveedor: string
  imagen_url: string
}

export interface FormProveedor {
  id: string
  nombre: string
  telefono: string
  productos: string
  tiempo_entrega: string
  notas: string
}

export interface FormCliente {
  id: string
  nombre: string
  numero: string
  moto: string
  deuda: string | number
}

export interface ResumenVentas {
  total: number
  productosVendidos: number
  numeroVentas: number
  ganancia: number
  metodos: Record<string, number>
}
