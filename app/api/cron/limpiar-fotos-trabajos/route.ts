import { obtenerSupabaseAdmin } from '@/lib/supabaseAdmin'
import { BUCKET_FOTOS_TRABAJOS, fechaEnMexico, rutaFotoTrabajoValida, rutasVencidasDelModulo } from '@/utils/fotosTrabajosMecanicos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const listarArchivos = async (prefijo: string): Promise<string[]> => {
  const admin = obtenerSupabaseAdmin()
  const encontrados: string[] = []
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.storage.from(BUCKET_FOTOS_TRABAJOS).list(prefijo, { limit: 100, offset })
    if (error) throw error
    if (!data?.length) break
    for (const entrada of data) {
      const ruta = prefijo ? `${prefijo}/${entrada.name}` : entrada.name
      if (entrada.id) encontrados.push(ruta)
      else encontrados.push(...await listarArchivos(ruta))
    }
    if (data.length < 100) break
  }
  return encontrados
}

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return Response.json({ ok: false, mensaje: 'No autorizado.' }, { status: 401 })
  }
  try {
    const admin = obtenerSupabaseAdmin()
    const ahora = new Date().toISOString()
    const hoyMexico = fechaEnMexico()
    const { data: vencidas, error } = await admin.from('trabajos_mecanicos')
      .select('id,foto_ruta').not('foto_ruta', 'is', null).is('foto_eliminada_at', null).lte('foto_expira_at', ahora).limit(1000)
    if (error) throw error

    const referenciadas = (vencidas || []).filter((fila) => fila.foto_ruta && rutaFotoTrabajoValida(fila.foto_ruta))
    const todas = await listarArchivos('')
    const huerfanasVencidas = rutasVencidasDelModulo(todas, hoyMexico)
    const rutas = [...new Set([...referenciadas.map((fila) => fila.foto_ruta as string), ...huerfanasVencidas])]
    if (rutas.length) {
      const { error: errorBorrado } = await admin.storage.from(BUCKET_FOTOS_TRABAJOS).remove(rutas)
      if (errorBorrado) throw errorBorrado
    }
    const ids = referenciadas.map((fila) => fila.id)
    if (ids.length) {
      const { error: errorMarca } = await admin.from('trabajos_mecanicos').update({ foto_eliminada_at: ahora }).in('id', ids).is('foto_eliminada_at', null)
      if (errorMarca) throw errorMarca
    }
    return Response.json({ ok: true, archivosEliminados: rutas.length, registrosMarcados: ids.length })
  } catch (error) {
    return Response.json({ ok: false, mensaje: error instanceof Error ? error.message : 'Falló la limpieza.' }, { status: 500 })
  }
}

