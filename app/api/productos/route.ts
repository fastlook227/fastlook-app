import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ErrorAutenticacion, exigirAdministrador } from '@/lib/auth/servidor'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase'

const CamposBase = z.object({
  codigo: z.string().trim().min(1).max(80), nombre: z.string().trim().min(1).max(200),
  tipo: z.string().trim().min(1).max(100), precio: z.number().finite().nonnegative(),
  costo: z.number().finite().nonnegative().nullable(), stock: z.number().int().nullable(),
  stock_minimo: z.number().int().nonnegative().nullable(), ubicacion: z.string().trim().max(100).nullable(),
  proveedor: z.string().trim().max(200).nullable(), imagen_url: z.string().trim().max(2000).nullable(),
  imagen_thumbnail_url: z.string().trim().max(2000).nullable(), usar_imagen_principal: z.boolean().optional(),
})
const Solicitud = z.discriminatedUnion('operacion', [
  z.object({ operacion: z.literal('CREAR'), solicitudId: z.string().uuid(), producto: CamposBase.extend({
    costo: z.number().finite().nonnegative(), stock: z.number().int().nonnegative(), stock_minimo: z.number().int().nonnegative(),
  }) }),
  z.object({ operacion: z.literal('EDITAR'), productoId: z.string().uuid(), producto: CamposBase }),
])

const nombresCampos: Record<string, string> = {
  codigo: 'Código', nombre: 'Nombre', tipo: 'Tipo de producto', precio: 'Precio de venta',
  costo: 'Costo', stock: 'Existencias', stock_minimo: 'Stock mínimo', ubicacion: 'Ubicación',
  proveedor: 'Proveedor', imagen_url: 'URL de imagen', imagen_thumbnail_url: 'Miniatura',
  usar_imagen_principal: 'Preferencia de imagen', solicitudId: 'Identificador de operación', productoId: 'Producto',
}
const errorValidacion = (error: z.ZodError) => {
  const incidencia = error.issues[0]
  const clave = String(incidencia?.path.at(-1) || 'datos')
  return { campo: clave, mensaje: `${nombresCampos[clave] || 'Datos del producto'}: ${incidencia?.message || 'valor inválido'}.` }
}

const traducirError = (error: { code?: string; message?: string }) => {
  const mensaje = error.message || ''
  if (error.code === '42501' || /SIN_SESION|ROL_NO_PERMITIDO|permission denied|row-level security/i.test(mensaje)) return { status: 403, mensaje: 'No tienes permiso para modificar el inventario.' }
  if (error.code === '23505' || /CODIGO_DUPLICADO/i.test(mensaje)) return { status: 409, mensaje: 'El código ya pertenece a otro producto.' }
  if (error.code === '22023' || /DATOS_INVALIDOS|CAMPO_INVALIDO|PRODUCTO_ARCHIVADO/i.test(mensaje)) return { status: 400, mensaje: mensaje.replace(/^[A-Z_]+:\s*/, '') || 'Revisa los datos del producto.' }
  if (error.code === 'P0002' || /PRODUCTO_INEXISTENTE/i.test(mensaje)) return { status: 404, mensaje: 'El producto ya no existe.' }
  return { status: 500, mensaje: 'No fue posible guardar el producto.' }
}

export async function POST(request: Request) {
  try {
    await exigirAdministrador(request)
    const entrada = Solicitud.safeParse(await request.json())
    if (!entrada.success) {
      const detalle = errorValidacion(entrada.error)
      return Response.json({ ok: false, codigo: 'VALIDACION_API', campo: detalle.campo, mensaje: detalle.mensaje }, { status: 400 })
    }
    const cliente = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: request.headers.get('authorization') || '' } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const p = entrada.data.producto
    const esCreacion = entrada.data.operacion === 'CREAR'
    const parametros = { p_codigo: p.codigo, p_nombre: p.nombre, p_tipo: p.tipo, p_precio: p.precio,
      p_costo: p.costo, p_stock: p.stock, p_stock_minimo: p.stock_minimo, p_ubicacion: p.ubicacion,
      p_proveedor: p.proveedor, p_imagen_url: p.imagen_url, p_imagen_thumbnail_url: p.imagen_thumbnail_url,
      p_usar_imagen_principal: p.usar_imagen_principal ?? (esCreacion ? false : null) }
    const llamada = entrada.data.operacion === 'CREAR'
      ? cliente.rpc('crear_producto_admin', { p_solicitud_id: entrada.data.solicitudId, ...parametros })
      : cliente.rpc('actualizar_producto_admin', { p_producto_id: entrada.data.productoId, ...parametros })
    const { data, error } = await llamada
    if (error) {
      console.error('Error controlado en RPC de productos:', { code: error.code, message: error.message, details: error.details, hint: error.hint })
      const respuesta = traducirError(error)
      return Response.json({ ok: false, codigo: error.code, mensaje: respuesta.mensaje }, { status: respuesta.status })
    }
    if (!data) return Response.json({ ok: false, mensaje: 'El producto cambió mientras se guardaba. Intenta nuevamente.' }, { status: 409 })
    return Response.json({ ok: true, producto: data })
  } catch (error) {
    if (error instanceof ErrorAutenticacion) return Response.json({ ok: false, mensaje: error.message }, { status: error.status })
    return Response.json({ ok: false, mensaje: 'No fue posible guardar el producto.' }, { status: 500 })
  }
}
