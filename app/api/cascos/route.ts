import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ErrorAutenticacion, exigirAdministrador } from '@/lib/auth/servidor'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase'
import { comprobarCodigoProducto, normalizarCodigoProducto } from '@/utils/codigosProducto'
import { esProductoCasco } from '@/utils/cascos'

const CamposCasco = z.object({
  codigo: z.string().trim().min(1).max(80), nombre: z.string().trim().min(1).max(200),
  precio: z.number().nonnegative(), costo: z.number().nonnegative(), stock: z.number().int().nonnegative(),
  stock_minimo: z.number().int().nonnegative(), talla: z.string().trim().min(1).max(40),
  certificacion: z.enum(['DOT', 'ECE', 'DOT + ECE', 'Sin especificar']), ubicacion: z.string().trim().max(100),
  proveedor: z.string().trim().max(200), imagen_url: z.string().trim().max(2000), imagen_thumbnail_url: z.string().trim().max(2000).optional().default(''), codigoAutomatico: z.boolean(),
})
const Solicitud = z.discriminatedUnion('operacion', [
  z.object({ operacion: z.literal('CREAR'), solicitudId: z.string().uuid(), casco: CamposCasco }),
  z.object({ operacion: z.literal('EDITAR'), productoId: z.string().uuid(), casco: CamposCasco.omit({ codigoAutomatico: true }) }),
  z.object({ operacion: z.literal('REPONER'), productoId: z.string().uuid(), cantidad: z.number().int().min(1).max(10000) }),
  z.object({ operacion: z.literal('ARCHIVAR'), productoId: z.string().uuid() }),
  z.object({ operacion: z.literal('ELIMINAR'), productoId: z.string().uuid(), confirmacion: z.literal('ELIMINAR') }),
])

const clienteAutenticado = (request: Request) => createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { Authorization: request.headers.get('authorization') || '' } },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const mensajeError = (error: { code?: string; message?: string }) => error.code === '42501' || /row-level security|permission denied/i.test(error.message || '')
  ? 'Supabase rechazó la operación por sus políticas RLS.' : error.message || 'No fue posible completar la operación.'
class ErrorOperacionSupabase extends Error {
  constructor(public etapa: string, public codigo: string | undefined, mensaje: string, public status = 500) { super(mensaje) }
}
const responderError = (error: unknown) => {
  if (error instanceof ErrorAutenticacion) return Response.json({ ok: false, mensaje: error.message }, { status: error.status })
  if (error instanceof ErrorOperacionSupabase) return Response.json({ ok: false, etapa: error.etapa, codigo: error.codigo, mensaje: error.message }, { status: error.status })
  return Response.json({ ok: false, mensaje: error instanceof Error ? error.message : 'No fue posible completar la operación.' }, { status: 500 })
}
const obtenerCasco = async (cliente: SupabaseClient, id: string, permitirArchivado = false) => {
  const { data, error } = await cliente.from('productos').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(mensajeError(error))
  if (!data) throw new Error('El casco no existe.')
  if (!esProductoCasco(data)) throw new Error('El producto seleccionado no es un casco.')
  if (!permitirArchivado && data.archivado === true) throw new Error('El casco está archivado.')
  return data
}
const datosCasco = (casco: z.infer<typeof CamposCasco> | z.infer<ReturnType<typeof CamposCasco.omit>>) => ({
  codigo: normalizarCodigoProducto(casco.codigo), nombre: casco.nombre.trim(), tipo: 'CASCOS', precio: casco.precio,
  costo: casco.costo, stock: casco.stock, stock_minimo: casco.stock_minimo, talla: casco.talla.trim(),
  certificacion: casco.certificacion, ubicacion: casco.ubicacion.trim(), proveedor: casco.proveedor.trim(), imagen_url: casco.imagen_url.trim(), imagen_thumbnail_url: casco.imagen_thumbnail_url?.trim() || null,
})
const registrarMovimiento = async (cliente: SupabaseClient, producto: Record<string, unknown>, tipo: string, cantidad: number, anterior: number, nuevo: number, nota: string) => {
  const { error } = await cliente.from('movimientos_inventario').insert({
    producto_id: producto.id, codigo: producto.codigo || '', nombre: producto.nombre || '', tipo_movimiento: tipo,
    cantidad, stock_anterior: anterior, stock_nuevo: nuevo, nota, valor_anterior: anterior, valor_nuevo: nuevo,
    origen: 'CASCOS', usuario_rol: 'Admin', created_at: new Date().toISOString(),
  })
  if (error) throw new Error(mensajeError(error))
}

export async function POST(request: Request) {
  try {
    await exigirAdministrador(request)
    const entrada = Solicitud.safeParse(await request.json())
    if (!entrada.success) return Response.json({ ok: false, mensaje: 'Los datos enviados no son válidos.' }, { status: 400 })
    const cliente = clienteAutenticado(request)

    if (entrada.data.operacion === 'CREAR') {
      const codigo = normalizarCodigoProducto(entrada.data.casco.codigo)
      const datos = datosCasco({ ...entrada.data.casco, codigo })
      const { data, error } = await cliente.rpc('crear_casco_admin', {
        p_solicitud_id: entrada.data.solicitudId, p_codigo: datos.codigo, p_nombre: datos.nombre,
        p_precio: datos.precio, p_costo: datos.costo, p_stock: datos.stock,
        p_stock_minimo: datos.stock_minimo, p_talla: datos.talla, p_certificacion: datos.certificacion,
        p_ubicacion: datos.ubicacion, p_proveedor: datos.proveedor, p_imagen_url: datos.imagen_url,
        p_imagen_thumbnail_url: datos.imagen_thumbnail_url,
      })
      if (error) {
        const permisos = error.code === '42501' || /row-level security|permission denied|ROL_NO_PERMITIDO|SIN_SESION/i.test(error.message)
        const status = permisos ? 403 : error.code === '23505' ? 409 : error.code === '22023' ? 400 : 500
        throw new ErrorOperacionSupabase('crear_producto', error.code, mensajeError(error), status)
      }
      if (!data) throw new Error('Supabase no devolvió el casco creado.')
      return Response.json({ ok: true, mensaje: 'Casco guardado correctamente.', producto: data })
    }

    if (entrada.data.operacion === 'EDITAR') {
      await obtenerCasco(cliente, entrada.data.productoId)
      const codigo = normalizarCodigoProducto(entrada.data.casco.codigo)
      if (await comprobarCodigoProducto(cliente, codigo, entrada.data.productoId)) return Response.json({ ok: false, mensaje: 'El código ya existe.' }, { status: 409 })
      const datos = datosCasco({ ...entrada.data.casco, codigoAutomatico: false })
      const { data, error } = await cliente.rpc('actualizar_casco_admin', {
        p_producto_id: entrada.data.productoId, p_codigo: datos.codigo, p_nombre: datos.nombre,
        p_precio: datos.precio, p_costo: datos.costo, p_stock: datos.stock,
        p_stock_minimo: datos.stock_minimo, p_talla: datos.talla, p_certificacion: datos.certificacion,
        p_ubicacion: datos.ubicacion, p_proveedor: datos.proveedor, p_imagen_url: datos.imagen_url,
        p_imagen_thumbnail_url: datos.imagen_thumbnail_url,
      })
      if (error) {
        const permisos = error.code === '42501' || /row-level security|permission denied|ROL_NO_PERMITIDO|SIN_SESION/i.test(error.message)
        throw new ErrorOperacionSupabase('actualizar_producto', error.code, mensajeError(error), permisos ? 403 : error.code === '23505' ? 409 : 500)
      }
      if (!data) throw new Error('El casco cambió mientras se editaba. Intenta nuevamente.')
      return Response.json({ ok: true, mensaje: 'Casco actualizado correctamente.', producto: data })
    }

    if (entrada.data.operacion === 'REPONER') {
      const producto = await obtenerCasco(cliente, entrada.data.productoId)
      const anterior = Number(producto.stock || 0)
      const nuevo = anterior + entrada.data.cantidad
      const { data, error } = await cliente.from('productos').update({ stock: nuevo }).eq('id', producto.id).eq('stock', anterior).select('*').maybeSingle()
      if (error) throw new Error(mensajeError(error))
      if (!data) throw new Error('El stock cambió mientras se confirmaba. Intenta nuevamente.')
      try { await registrarMovimiento(cliente, producto, 'ENTRADA_STOCK', entrada.data.cantidad, anterior, nuevo, 'Reposición de casco') }
      catch (errorMovimiento) { await cliente.from('productos').update({ stock: anterior }).eq('id', producto.id).eq('stock', nuevo); throw errorMovimiento }
      return Response.json({ ok: true, mensaje: 'Stock repuesto correctamente.', producto: data })
    }

    if (entrada.data.operacion === 'ARCHIVAR') {
      const producto = await obtenerCasco(cliente, entrada.data.productoId)
      const stock = Number(producto.stock || 0)
      const { data, error } = await cliente.from('productos').update({ archivado: true }).eq('id', producto.id).or('archivado.is.null,archivado.eq.false').select('*').maybeSingle()
      if (error) throw new Error(mensajeError(error))
      if (!data) throw new Error('El casco cambió mientras se confirmaba. Intenta nuevamente.')
      try { await registrarMovimiento(cliente, producto, 'ARCHIVADO', 0, stock, stock, 'Casco archivado desde el catálogo') }
      catch (errorMovimiento) { await cliente.from('productos').update({ archivado: false }).eq('id', producto.id).eq('archivado', true); throw errorMovimiento }
      return Response.json({ ok: true, mensaje: 'Casco archivado correctamente.', producto: data })
    }

    const producto = await obtenerCasco(cliente, entrada.data.productoId)
    const [ventas, movimientos, accionesPropuestas, accionesConfirmadas] = await Promise.all([
      cliente.from('ventas').select('id', { count: 'exact', head: true }).eq('producto_id', producto.id),
      cliente.from('movimientos_inventario').select('id', { count: 'exact', head: true }).eq('producto_id', producto.id),
      cliente.from('acciones_asistente').select('id', { count: 'exact', head: true }).contains('datos_propuestos', { productoId: producto.id }),
      cliente.from('acciones_asistente').select('id', { count: 'exact', head: true }).contains('datos_confirmados', { productoId: producto.id }),
    ])
    const errorHistorial = [ventas.error, movimientos.error, accionesPropuestas.error, accionesConfirmadas.error].find(Boolean)
    if (errorHistorial) throw new Error(mensajeError(errorHistorial!))
    const tieneHistorial = [ventas.count, movimientos.count, accionesPropuestas.count, accionesConfirmadas.count].some((cantidad) => Number(cantidad || 0) > 0)
    if (tieneHistorial || Number(producto.stock || 0) > 0) {
      const { data, error } = await cliente.from('productos').update({ archivado: true }).eq('id', producto.id).select('*').single()
      if (error) throw new Error(mensajeError(error))
      return Response.json({ ok: true, archivado: true, producto: data, mensaje: tieneHistorial ? 'Este casco tiene historial y no puede eliminarse por completo. Se archivará para conservar la información.' : 'Este casco aún tiene existencias y se archivará para conservar la información.' })
    }
    const { error } = await cliente.from('productos').delete().eq('id', producto.id)
    if (error) throw new Error(mensajeError(error))
    return Response.json({ ok: true, eliminado: true, productoId: producto.id, mensaje: 'Casco eliminado definitivamente.' })
  } catch (error) { return responderError(error) }
}
