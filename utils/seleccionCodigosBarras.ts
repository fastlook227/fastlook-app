import type { Producto } from '@/types'

export type ModoPDFCodigosBarras = 'clasico' | 'etiquetas'

export const ETIQUETAS_POR_PAGINA: Record<ModoPDFCodigosBarras, number> = {
  clasico: 8,
  etiquetas: 24,
}

export const calcularPaginasPDF = (cantidad: number, modo: ModoPDFCodigosBarras) =>
  cantidad > 0 ? Math.ceil(cantidad / ETIQUETAS_POR_PAGINA[modo]) : 0

export const calcularPaginasEtiquetas = (cantidad: number) => calcularPaginasPDF(cantidad, 'clasico')

export const calcularGeometriaPDF = (modo: ModoPDFCodigosBarras, anchoPagina = 210, altoPagina = 297) => {
  const columnas = modo === 'clasico' ? 2 : 3
  const filas = modo === 'clasico' ? 4 : 8
  const margenX = modo === 'clasico' ? 7 : 5
  const inicioY = modo === 'clasico' ? 17 : 14
  const margenInferior = modo === 'clasico' ? 6 : 5
  const separacionX = modo === 'clasico' ? 2 : 1
  const separacionY = modo === 'clasico' ? 2 : 1
  const anchoEtiqueta = (anchoPagina - margenX * 2 - separacionX * (columnas - 1)) / columnas
  const altoEtiqueta = (altoPagina - inicioY - margenInferior - separacionY * (filas - 1)) / filas
  return { columnas, filas, margenX, inicioY, margenInferior, separacionX, separacionY, anchoEtiqueta, altoEtiqueta }
}

export const seleccionarIdsProductos = (productos: readonly Pick<Producto, 'id'>[]) =>
  new Set(productos.map((producto) => producto.id))

export const agregarIdsSeleccionados = (
  seleccionados: ReadonlySet<string>,
  productos: readonly Pick<Producto, 'id'>[]
) => {
  const siguientes = new Set(seleccionados)
  productos.forEach((producto) => siguientes.add(producto.id))
  return siguientes
}

export const quitarIdsSeleccionados = (
  seleccionados: ReadonlySet<string>,
  productos: readonly Pick<Producto, 'id'>[]
) => {
  const siguientes = new Set(seleccionados)
  productos.forEach((producto) => siguientes.delete(producto.id))
  return siguientes
}

export const reconciliarIdsSeleccionados = (
  seleccionados: ReadonlySet<string>,
  productos: readonly Pick<Producto, 'id'>[]
) => {
  const permitidos = new Set(productos.map((producto) => producto.id))
  return new Set([...seleccionados].filter((id) => permitidos.has(id)))
}

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

export const dividirEtiquetasEnPaginas = <T>(elementos: readonly T[], modo: ModoPDFCodigosBarras = 'clasico'): T[][] => {
  const paginas: T[][] = []
  const porPagina = ETIQUETAS_POR_PAGINA[modo]
  for (let indice = 0; indice < elementos.length; indice += porPagina) {
    paginas.push(elementos.slice(indice, indice + porPagina))
  }
  return paginas
}
