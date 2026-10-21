import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ErrorAutenticacion, exigirKikeadminNomina, obtenerPerfilAutenticado } from '@/lib/auth/servidor'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase'
import { obtenerSupabaseAdmin } from '@/lib/supabaseAdmin'
import { BUCKET_FOTOS_TIANGUIS, extensionFotoTianguis, MAX_BYTES_FOTO_TIANGUIS, MIME_FOTOS_TIANGUIS, rutaFotoTianguisValida } from '@/utils/tianguis'

export const runtime = 'nodejs'
const tokenDe = (request: Request) => request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || ''
const clienteDe = (request: Request) => createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${tokenDe(request)}` } }, auth: { persistSession: false, autoRefreshToken: false } })
const errorRespuesta = (error: unknown) => Response.json({ ok: false, mensaje: error instanceof Error ? error.message : 'No fue posible procesar la fotografía.' }, { status: error instanceof ErrorAutenticacion ? error.status : 500 })

export async function POST(request: Request) {
  const rutasNuevas: string[] = []
  let conservarPorEstadoAmbiguo = false
  try {
    const perfil = await obtenerPerfilAutenticado(request)
    const form = await request.formData()
    const foto = form.get('foto'); const thumb = form.get('miniatura')
    const semana = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(form.get('semana'))
    const operacion = z.string().uuid().safeParse(form.get('idempotencyKey'))
    if (!(foto instanceof File) || !(thumb instanceof File) || !semana.success || !operacion.success) return Response.json({ ok: false, mensaje: 'La fotografía enviada no es válida.' }, { status: 400 })
    if (![foto, thumb].every((archivo) => MIME_FOTOS_TIANGUIS.has(archivo.type) && archivo.size > 0 && archivo.size <= MAX_BYTES_FOTO_TIANGUIS)) return Response.json({ ok: false, mensaje: 'Las fotografías deben ser WebP o JPEG y pesar máximo 1.5 MB.' }, { status: 413 })
    const base = `${semana.data}/${perfil.id}/${operacion.data}`
    const ruta = `${base}/foto.${extensionFotoTianguis(foto.type)}`; const miniaturaRuta = `${base}/thumb.${extensionFotoTianguis(thumb.type)}`
    const admin = obtenerSupabaseAdmin()
    for (const [archivo, destino] of [[foto, ruta], [thumb, miniaturaRuta]] as const) {
      const { error } = await admin.storage.from(BUCKET_FOTOS_TIANGUIS).upload(destino, new Uint8Array(await archivo.arrayBuffer()), { contentType: archivo.type, cacheControl: '3600', upsert: false })
      if (error && !/already exists|Duplicate/i.test(error.message)) throw new Error(`No se pudo subir la fotografía: ${error.message}`)
      if (!error) rutasNuevas.push(destino)
    }
    const cliente = clienteDe(request)
    const { data, error } = await cliente.rpc('registrar_foto_tianguis', { p_operacion: operacion.data, p_semana: semana.data, p_ruta: ruta, p_miniatura_ruta: miniaturaRuta, p_mime: foto.type })
    if (error) {
      const verificacion = await cliente.rpc('verificar_foto_tianguis', { p_operacion: operacion.data })
      if (!verificacion.error && verificacion.data?.id) return Response.json({ ok: true, resultado: verificacion.data })
      if (verificacion.error) { conservarPorEstadoAmbiguo = true; throw new Error('No se pudo confirmar el guardado. Los archivos nuevos se conservaron para evitar pérdida; reintenta al recuperar la conexión.') }
      if (rutasNuevas.length) await admin.storage.from(BUCKET_FOTOS_TIANGUIS).remove(rutasNuevas)
      throw new Error(error.message)
    }
    return Response.json({ ok: true, resultado: data })
  } catch (error) {
    if (rutasNuevas.length && !conservarPorEstadoAmbiguo) await obtenerSupabaseAdmin().storage.from(BUCKET_FOTOS_TIANGUIS).remove(rutasNuevas)
    return errorRespuesta(error)
  }
}

export async function DELETE(request: Request) {
  try {
    await exigirKikeadminNomina(request)
    const validada = z.object({ id: z.string().uuid() }).safeParse(await request.json())
    if (!validada.success) return Response.json({ ok: false, mensaje: 'La fotografía no es válida.' }, { status: 400 })
    const cliente = clienteDe(request)
    const { data, error } = await cliente.rpc('obtener_rutas_foto_tianguis', { p_id: validada.data.id })
    if (error) throw new Error(error.message)
    const rutas = [data?.ruta, data?.miniatura_ruta].filter((ruta): ruta is string => typeof ruta === 'string' && rutaFotoTianguisValida(ruta))
    if (rutas.length !== 2) throw new Error('Las rutas registradas no son válidas; no se eliminó ningún archivo ajeno.')
    const { error: errorStorage } = await obtenerSupabaseAdmin().storage.from(BUCKET_FOTOS_TIANGUIS).remove(rutas)
    if (errorStorage) throw new Error(`Storage rechazó la eliminación; la fotografía permanece registrada: ${errorStorage.message}`)
    const { error: errorRegistro } = await cliente.rpc('retirar_foto_tianguis', { p_id: validada.data.id })
    if (errorRegistro) throw new Error(`Los archivos se eliminaron, pero no fue posible actualizar la referencia: ${errorRegistro.message}`)
    return Response.json({ ok: true })
  } catch (error) { return errorRespuesta(error) }
}
