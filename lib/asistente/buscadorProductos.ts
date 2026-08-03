import 'server-only'

import { supabase } from '@/lib/supabase'
import type {
  ProductoAsistente,
  ResultadoBusquedaProducto,
  FiltroProductosMasivo,
  ProductoSeleccionMasiva,
} from '@/types/asistente'
import type { RolUsuario } from '@/types'

interface ProductoConsultado {
  id: string
  nombre: string | null
  codigo: string | null
  precio: number | null
  costo: number | null
  stock: number | null
  ubicacion: string | null
  proveedor: string | null
  tipo: string | null
  archivado?: boolean | null
  activo?: boolean | null
}

const normalizarTexto = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const compactarTexto = (valor: string) => normalizarTexto(valor).replace(/\s/g, '')

const distanciaLevenshtein = (origen: string, destino: string) => {
  if (!origen.length) return destino.length
  if (!destino.length) return origen.length

  const filaAnterior = Array.from({ length: destino.length + 1 }, (_, indice) => indice)

  for (let indiceOrigen = 1; indiceOrigen <= origen.length; indiceOrigen += 1) {
    const filaActual = [indiceOrigen]

    for (let indiceDestino = 1; indiceDestino <= destino.length; indiceDestino += 1) {
      const costo = origen[indiceOrigen - 1] === destino[indiceDestino - 1] ? 0 : 1
      filaActual[indiceDestino] = Math.min(
        filaActual[indiceDestino - 1] + 1,
        filaAnterior[indiceDestino] + 1,
        filaAnterior[indiceDestino - 1] + costo
      )
    }

    filaAnterior.splice(0, filaAnterior.length, ...filaActual)
  }

  return filaAnterior[destino.length]
}

const similitudTexto = (busqueda: string, valor: string) => {
  const busquedaNormalizada = normalizarTexto(busqueda)
  const valorNormalizado = normalizarTexto(valor)
  const busquedaCompacta = compactarTexto(busqueda)
  const valorCompacto = compactarTexto(valor)

  if (!busquedaNormalizada || !valorNormalizado) return 0
  if (busquedaCompacta === valorCompacto) return 1
  if (valorCompacto.startsWith(busquedaCompacta)) return 0.94
  if (valorCompacto.includes(busquedaCompacta)) return 0.9
  if (busquedaCompacta.includes(valorCompacto)) return 0.82

  const palabrasBusqueda = busquedaNormalizada.split(' ')
  const palabrasValor = new Set(valorNormalizado.split(' '))
  const palabrasCoincidentes = palabrasBusqueda.filter((palabra) =>
    palabrasValor.has(palabra)
  ).length
  const proporcionPalabras = palabrasCoincidentes / palabrasBusqueda.length
  const distancia = distanciaLevenshtein(busquedaCompacta, valorCompacto)
  const similitudEdicion = 1 - distancia / Math.max(busquedaCompacta.length, valorCompacto.length)

  return Math.max(proporcionPalabras * 0.88, similitudEdicion * 0.8)
}

const presentarProducto = (
  producto: ProductoConsultado,
  rol: RolUsuario
): ProductoAsistente => ({
  id: producto.id,
  nombre: producto.nombre || '',
  codigo: producto.codigo || '',
  existencia: Number(producto.stock || 0),
  precio: Number(producto.precio || 0),
  ...(rol === 'Admin' ? { costo: Number(producto.costo || 0) } : {}),
  ubicacion: producto.ubicacion || '',
  proveedor: producto.proveedor || '',
  categoria: producto.tipo || '',
})

export async function buscarProductos(
  termino: string,
  rol: RolUsuario
): Promise<{
  coincidencias: ResultadoBusquedaProducto[]
  productosParecidos: ResultadoBusquedaProducto[]
}> {
  const { data: productos, error: errorProductos } = await supabase
    .from('productos')
    .select('id,nombre,codigo,precio,costo,stock,ubicacion,proveedor,tipo')

  if (errorProductos) {
    throw new Error(`No fue posible consultar productos: ${errorProductos.message}`)
  }

  const resultados = (productos as ProductoConsultado[] | null || [])
    .map((producto): ResultadoBusquedaProducto => {
      const campos = [
        { etiqueta: 'nombre', valor: producto.nombre || '', peso: 1 },
        { etiqueta: 'código', valor: producto.codigo || '', peso: 1 },
        { etiqueta: 'categoría', valor: producto.tipo || '', peso: 0.88 },
        { etiqueta: 'proveedor', valor: producto.proveedor || '', peso: 0.84 },
      ]
      const mejorCampo = campos
        .map((campo) => ({
          ...campo,
          puntaje: similitudTexto(termino, campo.valor) * campo.peso,
        }))
        .sort((a, b) => b.puntaje - a.puntaje)[0]

      return {
        producto: presentarProducto(producto, rol),
        puntaje: Number((mejorCampo?.puntaje || 0).toFixed(4)),
        motivoCoincidencia: mejorCampo?.puntaje
            ? `Coincidencia por ${mejorCampo.etiqueta}`
          : 'Producto parecido',
      }
    })
    .sort((a, b) => b.puntaje - a.puntaje || a.producto.nombre.localeCompare(b.producto.nombre))

  const coincidencias = resultados.filter((resultado) => resultado.puntaje >= 0.62)

  return {
    coincidencias,
    productosParecidos: coincidencias.length === 0
      ? resultados.filter((resultado) => resultado.puntaje >= 0.28).slice(0, 5)
      : [],
  }
}

export async function buscarProductoPorId(
  productoId: string,
  rol: RolUsuario
): Promise<ProductoAsistente | null> {
  const { data, error } = await supabase
    .from('productos')
    .select('id,nombre,codigo,precio,costo,stock,ubicacion,proveedor,tipo')
    .eq('id', productoId)
    .maybeSingle()

  if (error) {
    throw new Error(`No fue posible consultar el producto: ${error.message}`)
  }

  return data ? presentarProducto(data as ProductoConsultado, rol) : null
}

const contieneFiltro = (valor: string | null, filtro: string | null) => {
  if (!filtro) return true
  const valorNormalizado = normalizarTexto(valor || '')
  const tokens = normalizarTexto(filtro).split(' ').filter(Boolean)
  return tokens.every((token) => {
    const raiz = token.length > 4 ? token.replace(/(?:es|s)$/, '') : token
    return valorNormalizado.includes(token) || (raiz.length > 3 && valorNormalizado.includes(raiz))
  })
}

export async function buscarProductosMasivos(
  filtros: FiltroProductosMasivo
): Promise<{ productos: ProductoSeleccionMasiva[]; totalCoincidencias: number }> {
  const { data, error } = await supabase.from('productos').select('*')
  if (error) {
    throw new Error(`No fue posible consultar productos: ${error.message}`)
  }

  const productos = (data as ProductoConsultado[] | null || []).filter((producto) => {
    if (filtros.soloNoArchivados && (producto.archivado === true || producto.activo === false)) {
      return false
    }
    const textoGeneral = [producto.nombre, producto.codigo, producto.tipo, producto.proveedor]
      .filter(Boolean).join(' ')
    return contieneFiltro(textoGeneral, filtros.textoBusqueda)
      && contieneFiltro(producto.tipo, filtros.categoria)
      && contieneFiltro(producto.proveedor, filtros.proveedor)
      && contieneFiltro(producto.nombre, filtros.color)
      && contieneFiltro(`${producto.nombre || ''} ${producto.codigo || ''}`, filtros.modelo)
      && contieneFiltro(producto.codigo, filtros.codigo)
      && contieneFiltro(producto.ubicacion, filtros.ubicacionActual)
  })

  return {
    totalCoincidencias: productos.length,
    productos: productos.slice(0, 100).map((producto) => ({
      id: producto.id,
      codigo: producto.codigo || '',
      nombre: producto.nombre || '',
      categoria: producto.tipo || '',
      proveedor: producto.proveedor || null,
      ubicacionActual: producto.ubicacion || null,
      precio: Number(producto.precio || 0),
      stock: Number(producto.stock || 0),
      seleccionado: true,
    })),
  }
}
