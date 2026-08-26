import type { Producto } from '@/types'

export const normalizarCodigoBarras = (valor: unknown) =>
  typeof valor === 'string' ? valor.trim() : ''

export const esCodigoBarrasExacto = (producto: Producto, codigo: string) => {
  const buscado = normalizarCodigoBarras(codigo)
  return buscado !== '' && normalizarCodigoBarras(producto.codigo_barras) === buscado
}

export const buscarCodigoBarrasExacto = (productos: Producto[], codigo: string) =>
  productos.find((producto) => esCodigoBarrasExacto(producto, codigo))

export const crearMapaCodigosBarras = (productos: Producto[]) => {
  const mapa = new Map<string, Producto>()
  productos.forEach((producto) => {
    const codigo = normalizarCodigoBarras(producto.codigo_barras)
    if (codigo) mapa.set(codigo, producto)
  })
  return mapa
}

export type UltimaLecturaContinua = { codigo: string; vistoEn: number } | null

export const evaluarLecturaContinua = (
  ultima: UltimaLecturaContinua,
  codigo: string,
  ahora: number,
  ausenciaMinimaMs: number
) => ({
  aceptar: !ultima || ultima.codigo !== codigo || ahora - ultima.vistoEn >= ausenciaMinimaMs,
  siguiente: { codigo, vistoEn: ahora },
})

export const detenerMediaStream = (stream: Pick<MediaStream, 'getTracks'> | null) => {
  stream?.getTracks().forEach((track) => track.stop())
}
