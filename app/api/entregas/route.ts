import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ErrorAutenticacion, obtenerPerfilAutenticado } from '@/lib/auth/servidor'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase'
import { ESTADOS_ENTREGA } from '@/types/entregas'

export const dynamic = 'force-dynamic'

const token = (request: Request) => request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || ''
const cliente = (request: Request) => createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token(request)}` } }, auth: { persistSession: false, autoRefreshToken: false } })
const rpc = async (request: Request, nombre: string, parametros: Record<string, unknown> = {}) => {
  const { data, error } = await cliente(request).rpc(nombre, parametros)
  if (error) throw new Error(error.message)
  return data
}
const errorRespuesta = (error: unknown) => Response.json({ ok: false, mensaje: error instanceof Error ? error.message : 'No fue posible procesar la entrega.' }, { status: error instanceof ErrorAutenticacion ? error.status : 500, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request) {
  try {
    await obtenerPerfilAutenticado(request)
    return Response.json({ ok: true, panel: await rpc(request, 'obtener_panel_entregas') }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return errorRespuesta(error) }
}

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const hora = z.string().regex(/^\d{2}:\d{2}$/)
const dinero = z.number().finite().min(0).nullable()
const entrada = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('crear'), idempotencyKey: z.string().uuid(), productos: z.string().trim().min(1).max(1000), clienteNombre: z.string().trim().min(1).max(160), facebookUrl: z.string().trim().max(1000), telefono: z.string().trim().max(30), fecha, hora, ubicacion: z.string().trim().min(1).max(500), mapsUrl: z.string().trim().max(1000), precio: dinero, anticipo: dinero, observaciones: z.string().trim().max(2000), repartidorId: z.string().uuid().nullable() }),
  z.object({ accion: z.literal('asignar'), entregaId: z.string().uuid(), repartidorId: z.string().uuid() }),
  z.object({ accion: z.literal('confirmar-asignacion'), entregaId: z.string().uuid() }),
  z.object({ accion: z.literal('estado'), entregaId: z.string().uuid(), estado: z.enum(ESTADOS_ENTREGA), motivo: z.string().trim().max(1000).nullable(), fechaNueva: fecha.nullable(), horaNueva: hora.nullable() }),
  z.object({ accion: z.literal('comunicacion'), entregaId: z.string().uuid(), estado: z.enum(['Mensaje preparado', 'Mensaje enviado', 'Respuesta confirmada']) }),
])

export async function POST(request: Request) {
  try {
    await obtenerPerfilAutenticado(request)
    const validada = entrada.safeParse(await request.json())
    if (!validada.success) return Response.json({ ok: false, mensaje: 'Revisa los datos enviados.' }, { status: 400 })
    const d = validada.data
    if (d.accion === 'crear') {
      if (!d.facebookUrl && !d.telefono) return Response.json({ ok: false, mensaje: 'Indica teléfono o enlace de contacto.' }, { status: 400 })
      return Response.json({ ok: true, resultado: await rpc(request, 'crear_entrega_proxima', { p_idempotency_key: d.idempotencyKey, p_productos: d.productos, p_cliente_nombre: d.clienteNombre, p_facebook_url: d.facebookUrl || null, p_telefono: d.telefono || null, p_fecha: d.fecha, p_hora: d.hora, p_ubicacion: d.ubicacion, p_maps_url: d.mapsUrl || null, p_precio: d.precio, p_anticipo: d.anticipo, p_observaciones: d.observaciones || null, p_repartidor_id: d.repartidorId }) })
    }
    if (d.accion === 'asignar') return Response.json({ ok: true, resultado: await rpc(request, 'asignar_repartidor_entrega', { p_entrega_id: d.entregaId, p_repartidor_id: d.repartidorId }) })
    if (d.accion === 'confirmar-asignacion') return Response.json({ ok: true, resultado: await rpc(request, 'confirmar_asignacion_entrega', { p_entrega_id: d.entregaId }) })
    if (d.accion === 'comunicacion') return Response.json({ ok: true, resultado: await rpc(request, 'registrar_comunicacion_entrega', { p_entrega_id: d.entregaId, p_estado: d.estado }) })
    if (d.estado === 'Cancelada' && !d.motivo) return Response.json({ ok: false, mensaje: 'El motivo de cancelación es obligatorio.' }, { status: 400 })
    if (d.estado === 'Reprogramada' && (!d.motivo || !d.fechaNueva || !d.horaNueva)) return Response.json({ ok: false, mensaje: 'Indica nueva fecha, hora y motivo.' }, { status: 400 })
    return Response.json({ ok: true, resultado: await rpc(request, 'cambiar_estado_entrega', { p_entrega_id: d.entregaId, p_estado: d.estado, p_motivo: d.motivo, p_fecha_nueva: d.fechaNueva, p_hora_nueva: d.horaNueva }) })
  } catch (error) { return errorRespuesta(error) }
}
