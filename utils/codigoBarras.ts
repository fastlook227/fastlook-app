// @ts-expect-error Node ejecuta las pruebas TypeScript nativas y requiere la extensión explícita.
import { buscarCodigoBarrasExacto, normalizarCodigoBarras } from './busqueda.ts'

// @ts-expect-error Node ejecuta las pruebas TypeScript nativas y requiere la extensión explícita.
export { buscarCodigoBarrasExacto, normalizarCodigoBarras } from './busqueda.ts'

export interface ProductoConCodigoBarras {
  codigo_barras?: string | null
}

export const esCodigoBarrasExacto = (producto: ProductoConCodigoBarras, codigo: string) => {
  const buscado = normalizarCodigoBarras(codigo)
  return buscado !== '' && normalizarCodigoBarras(producto.codigo_barras) === buscado
}

export const crearMapaCodigosBarras = <T extends ProductoConCodigoBarras>(productos: readonly T[]) => {
  const mapa = new Map<string, T>()
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
