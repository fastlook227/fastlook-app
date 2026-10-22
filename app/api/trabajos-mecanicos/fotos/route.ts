import { z } from 'zod'
import { ErrorAutenticacion, exigirKikeadminNomina } from '@/lib/auth/servidor'
import { obtenerSupabaseAdmin } from '@/lib/supabaseAdmin'
import { BUCKET_FOTOS_TRABAJOS, extensionParaMime, fechaEnMexico, MAX_BYTES_FOTO_TRABAJO, MIME_FOTOS_TRABAJO, rutaFotoTrabajoValida } from '@/utils/fotosTrabajosMecanicos'

export const runtime = 'nodejs'

const responderError = (error: unknown) => {
  if (error instanceof ErrorAutenticacion) return Response.json({ ok: false, mensaje: error.message }, { status: error.status })
  return Response.json({ ok: false, mensaje: error instanceof Error ? error.message : 'No fue posible procesar la fotografía.' }, { status: 500 })
}

export async function POST(request: Request) {
  try {
    const perfil = await exigirKikeadminNomina(request)
    const formulario = await request.formData()
    const archivo = formulario.get('foto')
    const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(formulario.get('fecha'))
    const operacion = z.string().uuid().safeParse(formulario.get('idempotencyKey'))
    if (!(archivo instanceof File) || !fecha.success || !operacion.success) {
      return Response.json({ ok: false, mensaje: 'La fotografía enviada no es válida.' }, { status: 400 })
    }
    if (fecha.data !== fechaEnMexico()) {
      return Response.json({ ok: false, mensaje: 'Las fotografías temporales solo pueden adjuntarse a trabajos con fecha de hoy.' }, { status: 400 })
    }
    if (!MIME_FOTOS_TRABAJO.has(archivo.type) || archivo.size <= 0 || archivo.size > MAX_BYTES_FOTO_TRABAJO) {
      return Response.json({ ok: false, mensaje: 'La fotografía debe ser WebP o JPEG y pesar como máximo 1.5 MB.' }, { status: 413 })
    }

    const ruta = `${fecha.data}/${perfil.id}/${operacion.data}.${extensionParaMime(archivo.type)}`
    const bytes = new Uint8Array(await archivo.arrayBuffer())
    const { error } = await obtenerSupabaseAdmin().storage.from(BUCKET_FOTOS_TRABAJOS).upload(ruta, bytes, {
      contentType: archivo.type, cacheControl: '60', upsert: true,
    })
    if (error) throw new Error(`No se pudo subir la fotografía: ${error.message}`)
    return Response.json({ ok: true, ruta, mime: archivo.type })
  } catch (error) { return responderError(error) }
}

export async function DELETE(request: Request) {
  try {
    const perfil = await exigirKikeadminNomina(request)
    const entrada = z.object({ ruta: z.string().refine(rutaFotoTrabajoValida) }).safeParse(await request.json())
    if (!entrada.success || !entrada.data.ruta.split('/')[1]?.toLowerCase().includes(perfil.id.toLowerCase())) {
      return Response.json({ ok: false, mensaje: 'La ruta de fotografía no es válida.' }, { status: 400 })
    }
    const { error } = await obtenerSupabaseAdmin().storage.from(BUCKET_FOTOS_TRABAJOS).remove([entrada.data.ruta])
    if (error) throw new Error(`No se pudo retirar la fotografía: ${error.message}`)
    return Response.json({ ok: true })
  } catch (error) { return responderError(error) }
}

