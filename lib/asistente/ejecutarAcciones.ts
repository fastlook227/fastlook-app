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

const registrarMovimiento = async (datos: {
  producto: ProductoEjecucion
  tipo: 'CAMBIO_UBICACION' | 'ENTRADA_STOCK' | 'SALIDA_STOCK'
  cantidad: number
  stockAnterior: number
  stockNuevo: number
  valorAnterior: string | number | null
  valorNuevo: string | number | null
  contexto: ContextoEjecucion
}) => {
  const cliente = datos.contexto.cliente || supabase
  console.log('PASO 5: insertar movimientos_inventario')
  const { error } = await cliente.from('movimientos_inventario').insert({
    producto_id: datos.producto.id,
    codigo: datos.producto.codigo || '',
    nombre: datos.producto.nombre || '',
    tipo_movimiento: datos.tipo,
    cantidad: datos.cantidad,
    stock_anterior: datos.stockAnterior,
    stock_nuevo: datos.stockNuevo,
    nota: `${datos.tipo} ejecutado por el Asistente.`,
    valor_anterior: datos.valorAnterior,
    valor_nuevo: datos.valorNuevo,
    origen: 'ASISTENTE',
    usuario_rol: datos.contexto.usuarioRol,
    accion_asistente_id: datos.contexto.accionAsistenteId,
    created_at: new Date().toISOString(),
  })
  if (error) throw new Error(mensajeSupabase(error))
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
    console.log('PASO 4: actualizar productos')
    let consulta = cliente.from('productos').update({ ubicacion: nuevaUbicacion }).eq('id', producto.id)
    consulta = producto.ubicacion === null
      ? consulta.is('ubicacion', null)
      : consulta.eq('ubicacion', producto.ubicacion)
    const { data, error } = await consulta.select('id')
    if (error) throw new Error(mensajeSupabase(error))
    if (!data?.length) throw new Error('El producto cambió mientras se confirmaba. Intenta nuevamente.')

    try {
      await registrarMovimiento({
        producto, tipo: 'CAMBIO_UBICACION', cantidad: 0,
        stockAnterior: Number(producto.stock || 0), stockNuevo: Number(producto.stock || 0),
        valorAnterior: producto.ubicacion, valorNuevo: nuevaUbicacion, contexto,
      })
    } catch (errorMovimiento) {
      console.log('PASO ROLLBACK: actualizar productos para restaurar la ubicación')
      await cliente.from('productos').update({ ubicacion: producto.ubicacion }).eq('id', producto.id).eq('ubicacion', nuevaUbicacion)
      throw errorMovimiento
    }

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
    const { data, error } = await cliente
      .from('productos').update({ stock: stockNuevo })
      .eq('id', producto.id).eq('stock', stockAnterior).select('id')
    if (error) throw new Error(mensajeSupabase(error))
    if (!data?.length) throw new Error('El stock cambió mientras se confirmaba. Intenta nuevamente.')

    try {
      await registrarMovimiento({
        producto,
        tipo: accion === 'SUMAR_STOCK' ? 'ENTRADA_STOCK' : 'SALIDA_STOCK',
        cantidad, stockAnterior, stockNuevo,
        valorAnterior: stockAnterior, valorNuevo: stockNuevo, contexto,
      })
    } catch (errorMovimiento) {
      await cliente.from('productos').update({ stock: stockAnterior }).eq('id', producto.id).eq('stock', stockNuevo)
      throw errorMovimiento
    }

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
