import type { Producto } from '@/types'

export const obtenerProductosActivos = <T extends Pick<Producto, 'archivado'>>(productos: readonly T[]) =>
  productos.filter((producto) => producto.archivado !== true)

export const esProductoActivo = (producto: Pick<Producto, 'archivado'>) => producto.archivado !== true

export const esRespuestaArchivadoExitosa = (respuesta: { ok?: boolean; codigo?: string } | null | undefined) =>
  respuesta?.ok === true && ['PRODUCTO_ARCHIVADO', 'PRODUCTO_YA_ARCHIVADO'].includes(respuesta.codigo || '')
