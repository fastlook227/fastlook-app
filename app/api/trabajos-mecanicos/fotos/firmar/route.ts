import { z } from 'zod'
import { ErrorAutenticacion, exigirAdministrador } from '@/lib/auth/servidor'
import { obtenerSupabaseAdmin } from '@/lib/supabaseAdmin'
import { BUCKET_FOTOS_TRABAJOS, fotoTrabajoVigente, rutaFotoTrabajoValida } from '@/utils/fotosTrabajosMecanicos'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    await exigirAdministrador(request)
    const entrada = z.object({ trabajoId: z.string().uuid() }).safeParse(await request.json())
    if (!entrada.success) return Response.json({ ok: false, mensaje: 'El trabajo no es válido.' }, { status: 400 })
    const admin = obtenerSupabaseAdmin()
    const { data: trabajo, error } = await admin.from('trabajos_mecanicos')
      .select('foto_ruta,foto_expira_at,foto_eliminada_at').eq('id', entrada.data.trabajoId).maybeSingle()
    if (error) throw error
    if (!trabajo || !trabajo.foto_ruta || !rutaFotoTrabajoValida(trabajo.foto_ruta) || !fotoTrabajoVigente(trabajo.foto_expira_at, trabajo.foto_eliminada_at)) {
      return Response.json({ ok: false, expirada: true, mensaje: 'La fotografía temporal ya expiró.' }, { status: 410 })
    }
    const segundosRestantes = Math.floor((new Date(trabajo.foto_expira_at).getTime() - Date.now()) / 1000)
    if (segundosRestantes < 1) return Response.json({ ok: false, expirada: true, mensaje: 'La fotografía temporal ya expiró.' }, { status: 410 })
    const duracion = Math.min(60, segundosRestantes)
    const { data, error: errorFirma } = await admin.storage.from(BUCKET_FOTOS_TRABAJOS).createSignedUrl(trabajo.foto_ruta, duracion)
    if (errorFirma || !data?.signedUrl) throw new Error(errorFirma?.message || 'No fue posible abrir la fotografía.')
    return Response.json({ ok: true, url: data.signedUrl, expiraAt: trabajo.foto_expira_at }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const status = error instanceof ErrorAutenticacion ? error.status : 500
    return Response.json({ ok: false, mensaje: error instanceof Error ? error.message : 'No fue posible abrir la fotografía.' }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
}

