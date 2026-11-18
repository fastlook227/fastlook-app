import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ErrorAutenticacion, exigirAdministrador } from '@/lib/auth/servidor'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase'

const CamposProducto = z.object({
  codigo: z.string().trim().min(1).max(80), nombre: z.string().trim().min(1).max(200),
  tipo: z.string().trim().min(1).max(100), precio: z.number().finite().nonnegative(),
  costo: z.number().finite().nonnegative(), stock: z.number().int().nonnegative(),
  stock_minimo: z.number().int().nonnegative(), ubicacion: z.string().trim().max(100),
  proveedor: z.string().trim().max(200), imagen_url: z.string().trim().max(2000),
  imagen_thumbnail_url: z.string().trim().max(2000).nullable(), usar_imagen_principal: z.boolean(),
})
const Solicitud = z.discriminatedUnion('operacion', [
  z.object({ operacion: z.literal('CREAR'), solicitudId: z.string().uuid(), producto: CamposProducto }),
  z.object({ operacion: z.literal('EDITAR'), productoId: z.string().uuid(), producto: CamposProducto }),
])

const traducirError = (error: { code?: string; message?: string }) => {
  const mensaje = error.message || ''
  if (error.code === '42501' || /SIN_SESION|ROL_NO_PERMITIDO|permission denied|row-level security/i.test(mensaje)) return { status: 403, mensaje: 'No tienes permiso para modificar el inventario.' }
  if (error.code === '23505' || /CODIGO_DUPLICADO/i.test(mensaje)) return { status: 409, mensaje: 'El código ya pertenece a otro producto.' }
  if (error.code === '22023' || /DATOS_INVALIDOS|PRODUCTO_ARCHIVADO/i.test(mensaje)) return { status: 400, mensaje: mensaje.replace(/^[A-Z_]+:\s*/, '') || 'Revisa los datos del producto.' }
  if (error.code === 'P0002' || /PRODUCTO_INEXISTENTE/i.test(mensaje)) return { status: 404, mensaje: 'El producto ya no existe.' }
  return { status: 500, mensaje: 'No fue posible guardar el producto.' }
}

export async function POST(request: Request) {
  try {
    await exigirAdministrador(request)
    const entrada = Solicitud.safeParse(await request.json())
    if (!entrada.success) return Response.json({ ok: false, mensaje: 'Revisa los campos obligatorios, precios y existencias.' }, { status: 400 })
    const cliente = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: request.headers.get('authorization') || '' } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const p = entrada.data.producto
    const parametros = { p_codigo: p.codigo, p_nombre: p.nombre, p_tipo: p.tipo, p_precio: p.precio,
      p_costo: p.costo, p_stock: p.stock, p_stock_minimo: p.stock_minimo, p_ubicacion: p.ubicacion,
      p_proveedor: p.proveedor, p_imagen_url: p.imagen_url, p_imagen_thumbnail_url: p.imagen_thumbnail_url,
      p_usar_imagen_principal: p.usar_imagen_principal }
    const llamada = entrada.data.operacion === 'CREAR'
      ? cliente.rpc('crear_producto_admin', { p_solicitud_id: entrada.data.solicitudId, ...parametros })
      : cliente.rpc('actualizar_producto_admin', { p_producto_id: entrada.data.productoId, ...parametros })
    const { data, error } = await llamada
    if (error) { const respuesta = traducirError(error); return Response.json({ ok: false, codigo: error.code, mensaje: respuesta.mensaje }, { status: respuesta.status }) }
    if (!data) return Response.json({ ok: false, mensaje: 'El producto cambió mientras se guardaba. Intenta nuevamente.' }, { status: 409 })
    return Response.json({ ok: true, producto: data })
  } catch (error) {
    if (error instanceof ErrorAutenticacion) return Response.json({ ok: false, mensaje: error.message }, { status: error.status })
    return Response.json({ ok: false, mensaje: 'No fue posible guardar el producto.' }, { status: 500 })
  }
}
