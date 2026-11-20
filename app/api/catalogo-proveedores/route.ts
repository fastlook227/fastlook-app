import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ErrorAutenticacion, exigirAdministrador, obtenerPerfilAutenticado } from '@/lib/auth/servidor'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase'

const Registro = z.object({
  codigoOriginal: z.string().trim().min(1).max(160), codigoBarras: z.string().trim().max(160).nullable().optional(),
  nombre: z.string().trim().min(1).max(300), descripcion: z.string().max(4000).optional(), categoria: z.string().max(160).optional(),
  marca: z.string().max(160).optional(), compatibilidades: z.array(z.string().max(160)).max(200).optional(),
  variantes: z.array(z.string().max(100)).max(100).optional(), precioBase: z.number().nonnegative().nullable().optional(),
  escalas: z.array(z.object({ nivel: z.string().trim().min(1).max(100), descuentoPorcentaje: z.number().min(0).max(100), costoEfectivo: z.number().nonnegative() })).min(1).max(20),
  imagenReferencia: z.string().max(1000).nullable().optional(), origenPagina: z.number().int().positive().nullable().optional(),
  origenFila: z.number().int().positive().nullable().optional(), ambiguo: z.boolean().optional(),
})
const Operacion = z.discriminatedUnion('operacion', [
  z.object({ operacion: z.literal('INICIAR'), proveedor: z.enum(['REMO','CEDIS','AQUILA']), archivo: z.string().trim().min(1).max(500), sha256: z.string().regex(/^[0-9a-f]{64}$/i), fechaCatalogo: z.string().date().nullable() }),
  z.object({ operacion: z.literal('LOTE'), importacionId: z.string().uuid(), loteClave: z.string().trim().min(1).max(100), registros: z.array(Registro).min(1).max(500) }),
  z.object({ operacion: z.literal('REVISAR'), registroId: z.string().uuid(), aprobar: z.boolean() }),
  z.object({ operacion: z.literal('PUBLICAR'), importacionId: z.string().uuid() }),
  z.object({ operacion: z.literal('NIVEL'), proveedor: z.enum(['REMO','CEDIS','AQUILA']), nivel: z.string().trim().max(100) }),
  z.object({ operacion: z.literal('VINCULAR'), catalogoProductoId: z.string().uuid(), productoId: z.string().uuid() }),
])

const cliente = (request: Request) => createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { Authorization: request.headers.get('authorization') || '' } },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const respuestaError = (error: unknown) => {
  if (error instanceof ErrorAutenticacion) return Response.json({ ok: false, mensaje: error.message }, { status: error.status })
  const e = error as { code?: string; message?: string }
  const permisos = e.code === '42501' || /SIN_SESION|ROL_NO_PERMITIDO|permission denied/i.test(e.message || '')
  return Response.json({ ok: false, codigo: e.code, mensaje: permisos ? 'No tienes permiso para esta operación.' : (e.message || 'No fue posible consultar el catálogo.') }, { status: permisos ? 403 : 500 })
}

export async function GET(request: Request) {
  try {
    await obtenerPerfilAutenticado(request)
    const url = new URL(request.url)
    const limite = Math.min(100, Math.max(1, Number(url.searchParams.get('limite') || 60)))
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0))
    const { data, error } = await cliente(request).rpc('obtener_catalogo_proveedores', {
      p_busqueda: url.searchParams.get('q') || '', p_proveedor: url.searchParams.get('proveedor') || null, p_limite: limite, p_offset: offset,
    })
    if (error) throw error
    return Response.json({ ok: true, catalogo: data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return respuestaError(error) }
}

export async function POST(request: Request) {
  try {
    await exigirAdministrador(request)
    const entrada = Operacion.safeParse(await request.json())
    if (!entrada.success) return Response.json({ ok: false, mensaje: `Datos inválidos: ${entrada.error.issues[0]?.path.join('.') || 'solicitud'}.` }, { status: 400 })
    if (entrada.data.operacion === 'INICIAR') {
      const { data, error } = await cliente(request).rpc('iniciar_importacion_catalogo', {
        p_proveedor: entrada.data.proveedor, p_archivo: entrada.data.archivo, p_sha256: entrada.data.sha256, p_fecha: entrada.data.fechaCatalogo,
      })
      if (error) throw error
      return Response.json({ ok: true, importacionId: data })
    }
    const solicitud = entrada.data.operacion === 'LOTE'
      ? cliente(request).rpc('cargar_lote_importacion_catalogo', { p_importacion_id: entrada.data.importacionId, p_lote_clave: entrada.data.loteClave, p_registros: entrada.data.registros })
      : entrada.data.operacion === 'REVISAR'
        ? cliente(request).rpc('revisar_registro_importacion_catalogo', { p_registro_id: entrada.data.registroId, p_aprobar: entrada.data.aprobar })
        : entrada.data.operacion === 'PUBLICAR'
          ? cliente(request).rpc('publicar_importacion_catalogo', { p_importacion_id: entrada.data.importacionId })
          : entrada.data.operacion === 'NIVEL'
            ? cliente(request).rpc('configurar_nivel_catalogo_proveedor', { p_proveedor: entrada.data.proveedor, p_nivel: entrada.data.nivel })
            : cliente(request).rpc('vincular_catalogo_inventario', { p_catalogo_producto_id: entrada.data.catalogoProductoId, p_producto_id: entrada.data.productoId })
    const { data, error } = await solicitud
    if (error) throw error
    return Response.json({ ok: true, resultado: data })
  } catch (error) { return respuestaError(error) }
}
