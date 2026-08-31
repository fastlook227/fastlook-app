import type { Producto } from '../types/index.ts'
// @ts-expect-error Node ejecuta las pruebas TypeScript nativas y requiere la extensión explícita.
import { filtrarProductosPorBusqueda, normalizarCodigoBarras, normalizarTextoBusqueda } from './busqueda.ts'

export type EstadoStockProducto = 'todos' | 'con-stock' | 'sin-stock' | 'stock-bajo'
export type EstadoBarcodeProducto = 'todos' | 'con-barcode' | 'sin-barcode' | 'interno' | 'comercial'
export type EstadoImagenProducto = 'todos' | 'con-imagen' | 'sin-imagen'
export type OrdenProductos =
  | 'nombre-asc' | 'nombre-desc'
  | 'stock-asc' | 'stock-desc'
  | 'precio-asc' | 'precio-desc'
  | 'codigo-asc' | 'ubicacion-asc'
  | 'costo-asc' | 'costo-desc'
export type PresetProductos = 'ninguno' | 'necesitan-atencion'

export interface FiltrosProductos {
  tipos: Set<string>
  proveedores: Set<string>
  ubicaciones: Set<string>
  stock: EstadoStockProducto
  stockMin: number | null
  stockMax: number | null
  barcode: EstadoBarcodeProducto
  imagen: EstadoImagenProducto
  precioMin: number | null
  precioMax: number | null
  costoMin: number | null
  costoMax: number | null
  orden: OrdenProductos
  preset: PresetProductos
}

export interface OpcionesFiltrosProductos {
  permitirBarcode?: boolean
  permitirImagen?: boolean
  permitirPrecio?: boolean
  permitirCosto?: boolean
}

export const crearFiltrosProductosVacios = (): FiltrosProductos => ({
  tipos: new Set(),
  proveedores: new Set(),
  ubicaciones: new Set(),
  stock: 'todos',
  stockMin: null,
  stockMax: null,
  barcode: 'todos',
  imagen: 'todos',
  precioMin: null,
  precioMax: null,
  costoMin: null,
  costoMax: null,
  orden: 'nombre-asc',
  preset: 'ninguno',
})

export const esProductoStockBajo = (producto: Pick<Producto, 'stock' | 'stock_minimo'>) =>
  Number(producto.stock) <= Number(producto.stock_minimo || 5)

const tieneBarcode = (producto: Producto) => Boolean(normalizarCodigoBarras(producto.codigo_barras))
const tieneImagen = (producto: Producto) => Boolean(String(producto.imagen_url ?? '').trim())
const barcodeEsInterno = (producto: Producto) => {
  const barcode = normalizarCodigoBarras(producto.codigo_barras)
  return Boolean(barcode && barcode === normalizarCodigoBarras(producto.codigo))
}

const cumpleStock = (producto: Producto, estado: EstadoStockProducto) => {
  if (estado === 'con-stock') return Number(producto.stock) > 0
  if (estado === 'sin-stock') return Number(producto.stock) <= 0
  if (estado === 'stock-bajo') return esProductoStockBajo(producto)
  return true
}

const cumpleBarcode = (producto: Producto, estado: EstadoBarcodeProducto) => {
  if (estado === 'con-barcode') return tieneBarcode(producto)
  if (estado === 'sin-barcode') return !tieneBarcode(producto)
  if (estado === 'interno') return barcodeEsInterno(producto)
  if (estado === 'comercial') return tieneBarcode(producto) && !barcodeEsInterno(producto)
  return true
}

const cumpleImagen = (producto: Producto, estado: EstadoImagenProducto) => {
  if (estado === 'con-imagen') return tieneImagen(producto)
  if (estado === 'sin-imagen') return !tieneImagen(producto)
  return true
}

const cumpleRango = (valor: number, minimo: number | null, maximo: number | null) =>
  (minimo === null || valor >= minimo) && (maximo === null || valor <= maximo)

const compararTexto = (a: unknown, b: unknown) =>
  normalizarTextoBusqueda(a).localeCompare(normalizarTextoBusqueda(b), 'es', { numeric: true })

const compararProductos = (a: Producto, b: Producto, orden: OrdenProductos) => {
  if (orden === 'nombre-desc') return compararTexto(b.nombre, a.nombre)
  if (orden === 'stock-asc') return Number(a.stock) - Number(b.stock)
  if (orden === 'stock-desc') return Number(b.stock) - Number(a.stock)
  if (orden === 'precio-asc') return Number(a.precio) - Number(b.precio)
  if (orden === 'precio-desc') return Number(b.precio) - Number(a.precio)
  if (orden === 'codigo-asc') return compararTexto(a.codigo, b.codigo)
  if (orden === 'ubicacion-asc') return compararTexto(a.ubicacion, b.ubicacion)
  if (orden === 'costo-asc') return Number(a.costo ?? 0) - Number(b.costo ?? 0)
  if (orden === 'costo-desc') return Number(b.costo ?? 0) - Number(a.costo ?? 0)
  return compararTexto(a.nombre, b.nombre)
}

export const aplicarFiltrosProductos = (
  productos: readonly Producto[],
  busqueda: string,
  filtros: FiltrosProductos,
  opciones: OpcionesFiltrosProductos = {}
): Producto[] => {
  const activos = productos.filter((producto) => producto.archivado !== true)
  const encontrados = filtrarProductosPorBusqueda(activos, busqueda)
  return encontrados
    .map((producto, indice) => ({ producto, indice }))
    .filter(({ producto }) => {
      if (filtros.preset === 'necesitan-atencion' && !(
        Number(producto.stock) <= 0 || esProductoStockBajo(producto) || !tieneImagen(producto) || !tieneBarcode(producto)
      )) return false
      if (filtros.tipos.size && !filtros.tipos.has(producto.tipo)) return false
      if (filtros.proveedores.size && !filtros.proveedores.has(producto.proveedor)) return false
      if (filtros.ubicaciones.size && !filtros.ubicaciones.has(producto.ubicacion)) return false
      if (!cumpleStock(producto, filtros.stock)) return false
      if (!cumpleRango(Number(producto.stock), filtros.stockMin, filtros.stockMax)) return false
      if (opciones.permitirBarcode && !cumpleBarcode(producto, filtros.barcode)) return false
      if (opciones.permitirImagen && !cumpleImagen(producto, filtros.imagen)) return false
      if (opciones.permitirPrecio && !cumpleRango(Number(producto.precio), filtros.precioMin, filtros.precioMax)) return false
      if (opciones.permitirCosto && !cumpleRango(Number(producto.costo ?? 0), filtros.costoMin, filtros.costoMax)) return false
      return true
    })
    .sort((a, b) => compararProductos(a.producto, b.producto, filtros.orden) || a.indice - b.indice)
    .map(({ producto }) => producto)
}

const valoresUnicos = (productos: readonly Producto[], campo: 'tipo' | 'proveedor' | 'ubicacion') =>
  [...new Set(productos.map((producto) => String(producto[campo] ?? '').trim()).filter(Boolean))]
    .sort((a, b) => compararTexto(a, b))

export const obtenerOpcionesFiltrosProductos = (productos: readonly Producto[]) => ({
  tipos: valoresUnicos(productos, 'tipo'),
  proveedores: valoresUnicos(productos, 'proveedor'),
  ubicaciones: valoresUnicos(productos, 'ubicacion'),
})

export const contarFiltrosActivos = (filtros: FiltrosProductos, opciones: OpcionesFiltrosProductos = {}) =>
  filtros.tipos.size + filtros.proveedores.size + filtros.ubicaciones.size
  + Number(filtros.stock !== 'todos') + Number(filtros.stockMin !== null) + Number(filtros.stockMax !== null)
  + Number(Boolean(opciones.permitirBarcode && filtros.barcode !== 'todos'))
  + Number(Boolean(opciones.permitirImagen && filtros.imagen !== 'todos'))
  + Number(Boolean(opciones.permitirPrecio && filtros.precioMin !== null))
  + Number(Boolean(opciones.permitirPrecio && filtros.precioMax !== null))
  + Number(Boolean(opciones.permitirCosto && filtros.costoMin !== null))
  + Number(Boolean(opciones.permitirCosto && filtros.costoMax !== null))
  + Number(filtros.orden !== 'nombre-asc') + Number(filtros.preset !== 'ninguno')
