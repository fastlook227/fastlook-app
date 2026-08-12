import type { Producto } from '@/types'
import type { CascoCatalogo, GrupoPrecioCascos } from '@/types/cascos'
import { normalizarTextoBusqueda } from '@/utils/busqueda'

export const normalizarTextoCasco = (valor: unknown) => normalizarTextoBusqueda(valor)
  .replace(/[-_]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase()

export const esProductoCasco = (producto: Producto) => {
  const tipo = normalizarTextoCasco(producto.tipo).replace(/\s/g, '')
  return tipo === 'CASCO' || tipo === 'CASCOS'
}

export const obtenerCascosDisponibles = (productos: Producto[]): CascoCatalogo[] =>
  productos
    .filter((producto) => esProductoCasco(producto) && Number(producto.stock || 0) > 0 && producto.archivado !== true)
    .sort((a, b) => Number(a.precio || 0) - Number(b.precio || 0))

const dineroSinCentavosInnecesarios = (valor: number) => valor.toLocaleString('es-MX', {
  minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
  maximumFractionDigits: 2,
})

export const agruparCascosPorPrecio = (cascos: CascoCatalogo[]): GrupoPrecioCascos[] => {
  const precios = [...new Set(cascos.map((casco) => Number(casco.precio || 0)))].sort((a, b) => a - b)
  const usarPrecioExacto = precios.length <= 8 || precios.length <= Math.ceil(cascos.length * 0.6)
  if (usarPrecioExacto) {
    return precios.map((precio) => ({
      id: `precio-${precio}`,
      titulo: `Cascos de $${dineroSinCentavosInnecesarios(precio)}`,
      cascos: cascos.filter((casco) => Number(casco.precio || 0) === precio),
    }))
  }

  const cantidadGrupos = Math.min(4, precios.length)
  const grupos: GrupoPrecioCascos[] = []
  for (let indice = 0; indice < cantidadGrupos; indice += 1) {
    const desdeIndice = Math.floor((indice * precios.length) / cantidadGrupos)
    const hastaIndice = Math.floor(((indice + 1) * precios.length) / cantidadGrupos) - 1
    const minimo = precios[desdeIndice]
    const maximo = precios[Math.max(desdeIndice, hastaIndice)]
    const elementos = cascos.filter((casco) => {
      const precio = Number(casco.precio || 0)
      return precio >= minimo && precio <= maximo
    })
    if (elementos.length) {
      grupos.push({
        id: `rango-${minimo}-${maximo}`,
        titulo: minimo === maximo
          ? `Cascos de $${dineroSinCentavosInnecesarios(minimo)}`
          : `$${dineroSinCentavosInnecesarios(minimo)} – $${dineroSinCentavosInnecesarios(maximo)}`,
        cascos: elementos,
      })
    }
  }
  return grupos
}
