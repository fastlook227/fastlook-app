import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ErrorAutenticacion, exigirKikeadminNomina, obtenerPerfilAutenticado } from '@/lib/auth/servidor'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase'
import { obtenerSupabaseAdmin } from '@/lib/supabaseAdmin'
import { BUCKET_FOTOS_TIANGUIS } from '@/utils/tianguis'
import type { FotoTianguis, PanelTianguis } from '@/types/tianguis'

export const dynamic = 'force-dynamic'

const tokenDe = (request: Request) => request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || ''
const clienteDe = (request: Request) => createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${tokenDe(request)}` } }, auth: { persistSession: false, autoRefreshToken: false } })
const responderError = (error: unknown) => {
  const status = error instanceof ErrorAutenticacion ? error.status : 500
  const mensaje = error instanceof Error ? error.message : 'No fue posible procesar la preparación del tianguis.'
  return Response.json({ ok: false, mensaje }, { status, headers: { 'Cache-Control': 'no-store' } })
}
const ejecutarRpc = async (request: Request, nombre: string, parametros: Record<string, unknown>) => {
  const { data, error } = await clienteDe(request).rpc(nombre, parametros)
  if (error) throw new Error(error.message)
  return data
}

export async function GET(request: Request) {
  try {
    await obtenerPerfilAutenticado(request)
    const semana = new URL(request.url).searchParams.get('semana')
    if (semana && !/^\d{4}-\d{2}-\d{2}$/.test(semana)) return Response.json({ ok: false, mensaje: 'La semana no es válida.' }, { status: 400 })
    const panel = await ejecutarRpc(request, 'obtener_preparacion_tianguis', { p_semana: semana || null }) as PanelTianguis
    const admin = obtenerSupabaseAdmin()
    panel.fotos = await Promise.all((panel.fotos || []).map(async (foto: FotoTianguis) => {
      const [{ data: principal }, { data: miniatura }] = await Promise.all([
        admin.storage.from(BUCKET_FOTOS_TIANGUIS).createSignedUrl(foto.ruta, 300),
        admin.storage.from(BUCKET_FOTOS_TIANGUIS).createSignedUrl(foto.miniatura_ruta, 300),
      ])
      return { ...foto, url: principal?.signedUrl, miniatura_url: miniatura?.signedUrl }
    }))
    return Response.json({ ok: true, panel }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return responderError(error) }
}

const entrada = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('vaciado'), semana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), completado: z.boolean() }),
  z.object({ accion: z.literal('tarea'), tareaId: z.string().uuid(), completada: z.boolean() }),
  z.object({ accion: z.literal('guardar-producto'), id: z.string().uuid().nullable(), nombre: z.string().trim().min(1).max(120), orden: z.number().int().min(0).max(100000) }),
  z.object({ accion: z.literal('retirar-producto'), id: z.string().uuid() }),
])

export async function POST(request: Request) {
  try {
    await obtenerPerfilAutenticado(request)
    const validada = entrada.safeParse(await request.json())
    if (!validada.success) return Response.json({ ok: false, mensaje: 'Los datos enviados no son válidos.' }, { status: 400 })
    const dato = validada.data
    if (dato.accion === 'vaciado') return Response.json({ ok: true, resultado: await ejecutarRpc(request, 'marcar_vaciado_tianguis', { p_semana: dato.semana, p_completado: dato.completado }) })
    if (dato.accion === 'tarea') return Response.json({ ok: true, resultado: await ejecutarRpc(request, 'marcar_tarea_tianguis', { p_tarea_id: dato.tareaId, p_completada: dato.completada }) })
    await exigirKikeadminNomina(request)
    if (dato.accion === 'guardar-producto') return Response.json({ ok: true, resultado: await ejecutarRpc(request, 'guardar_producto_tianguis', { p_id: dato.id, p_nombre: dato.nombre, p_orden: dato.orden }) })
    return Response.json({ ok: true, resultado: await ejecutarRpc(request, 'retirar_producto_tianguis', { p_id: dato.id }) })
  } catch (error) { return responderError(error) }
}
