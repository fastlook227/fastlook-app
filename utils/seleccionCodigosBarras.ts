import type { Producto } from '@/types'

export const ETIQUETAS_POR_PAGINA = 8

export const calcularPaginasEtiquetas = (cantidad: number) =>
  cantidad > 0 ? Math.ceil(cantidad / ETIQUETAS_POR_PAGINA) : 0

export const seleccionarIdsProductos = (productos: readonly Pick<Producto, 'id'>[]) =>
  new Set(productos.map((producto) => producto.id))

export const seleccionarIdsConCodigoBarras = (
  productos: readonly Pick<Producto, 'id' | 'codigo_barras'>[]
) => new Set(productos.filter((producto) => typeof producto.codigo_barras === 'string' && producto.codigo_barras.length > 0).map((producto) => producto.id))

export const separarProductosPorCodigoBarras = <T extends Pick<Producto, 'codigo_barras'>>(productos: readonly T[]) => ({
  conCodigo: productos.filter((producto) => typeof producto.codigo_barras === 'string' && producto.codigo_barras.length > 0),
  sinCodigo: productos.filter((producto) => typeof producto.codigo_barras !== 'string' || producto.codigo_barras.length === 0),
})

export const alternarIdSeleccionado = (seleccionados: ReadonlySet<string>, id: string) => {
  const siguientes = new Set(seleccionados)
  if (siguientes.has(id)) siguientes.delete(id)
  else siguientes.add(id)
  return siguientes
}

export const dividirEtiquetasEnPaginas = <T>(elementos: readonly T[]): T[][] => {
  const paginas: T[][] = []
  for (let indice = 0; indice < elementos.length; indice += ETIQUETAS_POR_PAGINA) {
    paginas.push(elementos.slice(indice, indice + ETIQUETAS_POR_PAGINA))
  }
  return paginas
}
