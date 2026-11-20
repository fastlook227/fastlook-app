import 'server-only'

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DetalleEjecucionProducto,
  DetalleErrorEjecucion,
  ResultadoEjecucionAsistente,
} from '@/types/asistente'

type ProductoEjecucion = {
  id: string
  codigo: string | null
  nombre: string | null
  stock: number | null
  ubicacion: string | null
  archivado: boolean | null
}

type ContextoEjecucion = {
  usuarioRol: 'Admin' | 'Vendedor'
  accionAsistenteId: string
  cliente?: SupabaseClient
}

const mensajeSupabase = (error: { code?: string; message?: string }) => {
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message || '')) {
    return 'Supabase rechazó la operación por sus políticas RLS.'
  }
  return error.message || 'Supabase no está disponible.'
}

const validarAdmin = (rol: ContextoEjecucion['usuarioRol']) => {
  if (rol !== 'Admin') throw new Error('Esta acción requiere permisos de Administrador.')
}

const obtenerProducto = async (productoId: string, cliente: SupabaseClient = supabase): Promise<ProductoEjecucion> => {
  const { data, error } = await cliente
    .from('productos')
    .select('id,codigo,nombre,stock,ubicacion,archivado')
    .eq('id', productoId)
    .maybeSingle()
  if (error) throw new Error(mensajeSupabase(error))
  if (!data) throw new Error('Producto no encontrado.')
  const producto = data as ProductoEjecucion
  if (producto.archivado) throw new Error('El producto está archivado.')
  return producto
}

// Stock, ubicación y movimiento se escriben juntos en el servidor (RLS impide UPDATE directo de productos).
const operarProducto = async (cliente: SupabaseClient, productoId: string, operacion: 'SUMAR_STOCK' | 'RESTAR_STOCK' | 'CAMBIAR_UBICACION', contexto: ContextoEjecucion, valores: { cantidad?: number; ubicacion?: string }) => {
  const { data, error } = await cliente.rpc('operar_producto_admin', {
    p_idempotency_key: crypto.randomUUID(), p_producto_id: productoId, p_operacion: operacion,
    p_cantidad: valores.cantidad ?? null, p_ubicacion: valores.ubicacion ?? null, p_origen: 'ASISTENTE',
    p_nota: `${operacion === 'CAMBIAR_UBICACION' ? 'CAMBIO_UBICACION' : operacion === 'SUMAR_STOCK' ? 'ENTRADA_STOCK' : 'SALIDA_STOCK'} ejecutado por el Asistente.`,
    p_accion_asistente_id: contexto.accionAsistenteId,
  })
  if (error) throw new Error(mensajeSupabase(error))
  return data as { stock_anterior: number; stock_nuevo: number }
}

const resultadoError = (
  accion: ResultadoEjecucionAsistente['accion'],
  mensaje: string,
  productoId?: string
): ResultadoEjecucionAsistente => ({
  ok: false,
  mensaje,
  accion,
  productosAfectados: 0,
  productosOmitidos: 0,
  detalles: [],
  errores: [{ productoId, mensaje }],
})

export async function ejecutarCambioUbicacion(
  productoId: string,
  nuevaUbicacionOriginal: string,
  contexto: ContextoEjecucion
): Promise<ResultadoEjecucionAsistente> {
  try {
    validarAdmin(contexto.usuarioRol)
    const nuevaUbicacion = nuevaUbicacionOriginal.trim()
    if (!nuevaUbicacion || nuevaUbicacion.length > 100) {
      return resultadoError('CAMBIAR_UBICACION', 'La nueva ubicación no es válida.', productoId)
    }
    const cliente = contexto.cliente || supabase
    const producto = await obtenerProducto(productoId, cliente)
    const ubicacionAnterior = producto.ubicacion || ''
    if (ubicacionAnterior.trim() === nuevaUbicacion) {
      return {
        ok: true, mensaje: 'El producto ya tiene esa ubicación.',
        accion: 'CAMBIAR_UBICACION', productosAfectados: 0, productosOmitidos: 1,
        detalles: [], errores: [],
      }
    }
    await operarProducto(cliente, producto.id, 'CAMBIAR_UBICACION', contexto, { ubicacion: nuevaUbicacion })

    return {
      ok: true, mensaje: 'Ubicación actualizada correctamente.', accion: 'CAMBIAR_UBICACION',
      productosAfectados: 1, productosOmitidos: 0, errores: [],
      detalles: [{ productoId: producto.id, codigo: producto.codigo || '', nombre: producto.nombre || '', campo: 'ubicacion', valorAnterior: producto.ubicacion, valorNuevo: nuevaUbicacion }],
    }
  } catch (error) {
    return resultadoError('CAMBIAR_UBICACION', error instanceof Error ? error.message : 'No fue posible cambiar la ubicación.', productoId)
  }
}

export async function ejecutarCambioUbicacionMasiva(
  productoIds: string[],
  nuevaUbicacion: string,
  contexto: ContextoEjecucion
): Promise<ResultadoEjecucionAsistente> {
  try {
    validarAdmin(contexto.usuarioRol)
    const ids = [...new Set(productoIds)]
    if (ids.length < 1 || ids.length > 100) {
      return resultadoError('CAMBIAR_UBICACION_MASIVA', 'La operación debe contener entre 1 y 100 productos.')
    }
    const resultados = await Promise.allSettled(
      ids.map((id) => ejecutarCambioUbicacion(id, nuevaUbicacion, contexto))
    )
    const detalles: DetalleEjecucionProducto[] = []
    const errores: DetalleErrorEjecucion[] = []
    let omitidos = 0
    resultados.forEach((resultado, indice) => {
      if (resultado.status === 'rejected') {
        errores.push({ productoId: ids[indice], mensaje: 'No fue posible actualizar el producto.' })
      } else {
        detalles.push(...resultado.value.detalles)
        errores.push(...resultado.value.errores)
        omitidos += resultado.value.productosOmitidos
      }
    })
    const actualizados = detalles.length
    return {
      ok: errores.length === 0,
      mensaje: errores.length
        ? `Se actualizaron ${actualizados} productos y ${errores.length} no pudieron actualizarse.`
        : `Se actualizaron correctamente ${actualizados} productos.`,
      accion: 'CAMBIAR_UBICACION_MASIVA', productosAfectados: actualizados,
      productosOmitidos: omitidos, detalles, errores,
    }
  } catch (error) {
    return resultadoError('CAMBIAR_UBICACION_MASIVA', error instanceof Error ? error.message : 'No fue posible ejecutar la operación masiva.')
  }
}

const ejecutarCambioStock = async (
  accion: 'SUMAR_STOCK' | 'RESTAR_STOCK',
  productoId: string,
  cantidad: number,
  contexto: ContextoEjecucion
): Promise<ResultadoEjecucionAsistente> => {
  try {
    validarAdmin(contexto.usuarioRol)
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 10000) {
      return resultadoError(accion, 'La cantidad debe ser un entero entre 1 y 10000.', productoId)
    }
    const cliente = contexto.cliente || supabase
    const producto = await obtenerProducto(productoId, cliente)
    const stockAnterior = Number(producto.stock || 0)
    if (accion === 'RESTAR_STOCK' && cantidad > stockAnterior) {
      return resultadoError(accion, `No se puede restar esa cantidad. El producto tiene ${stockAnterior} piezas disponibles.`, productoId)
    }
    const stockNuevo = accion === 'SUMAR_STOCK'
      ? stockAnterior + cantidad
      : stockAnterior - cantidad
    await operarProducto(cliente, producto.id, accion, contexto, { cantidad })

    return {
      ok: true, mensaje: 'Stock actualizado correctamente.', accion,
      productosAfectados: 1, productosOmitidos: 0, errores: [],
      detalles: [{ productoId: producto.id, codigo: producto.codigo || '', nombre: producto.nombre || '', campo: 'stock', valorAnterior: stockAnterior, valorNuevo: stockNuevo }],
    }
  } catch (error) {
    return resultadoError(accion, error instanceof Error ? error.message : 'No fue posible actualizar el stock.', productoId)
  }
}

export const ejecutarSumaStock = (productoId: string, cantidad: number, contexto: ContextoEjecucion) =>
  ejecutarCambioStock('SUMAR_STOCK', productoId, cantidad, contexto)

export const ejecutarRestaStock = (productoId: string, cantidad: number, contexto: ContextoEjecucion) =>
  ejecutarCambioStock('RESTAR_STOCK', productoId, cantidad, contexto)
