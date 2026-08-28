export function normalizarTextoBusqueda(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export interface ProductoBuscable {
  codigo_barras?: string | null
  nombre?: string | null
  codigo?: string | null
  tipo?: string | null
  proveedor?: string | null
  ubicacion?: string | null
}

export const normalizarCodigoBarras = (valor: unknown) =>
  typeof valor === 'string' ? valor.trim() : ''

export const buscarCodigoBarrasExacto = <T extends Pick<ProductoBuscable, 'codigo_barras'>>(
  productos: readonly T[],
  codigo: string
) => {
  const buscado = normalizarCodigoBarras(codigo)
  return buscado
    ? productos.find((producto) => normalizarCodigoBarras(producto.codigo_barras) === buscado)
    : undefined
}

export const normalizarCodigoFastLookBusqueda = (valor: unknown) =>
  normalizarTextoBusqueda(valor).replace(/[^a-z0-9]/g, '')

export const coincideProductoPorTexto = (producto: ProductoBuscable, termino: string) => {
  const texto = normalizarTextoBusqueda(termino)
  if (!texto) return true

  const codigoBuscado = normalizarCodigoFastLookBusqueda(termino)
  const codigoProducto = normalizarCodigoFastLookBusqueda(producto.codigo)
  return [producto.nombre, producto.codigo, producto.tipo, producto.proveedor, producto.ubicacion]
    .some((valor) => normalizarTextoBusqueda(valor).includes(texto))
    || Boolean(codigoBuscado && codigoProducto.includes(codigoBuscado))
}

/** El barcode sólo participa como igualdad exacta; nunca entra en la búsqueda parcial. */
export const filtrarProductosPorBusqueda = <T extends ProductoBuscable>(
  productos: readonly T[],
  termino: string
): T[] => {
  if (!normalizarTextoBusqueda(termino)) return [...productos]
  const barcodeExacto = buscarCodigoBarrasExacto(productos, termino)
  return barcodeExacto
    ? [barcodeExacto]
    : productos.filter((producto) => coincideProductoPorTexto(producto, termino))
}
