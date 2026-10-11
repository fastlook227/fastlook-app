export const BUCKET_FOTOS_TRABAJOS = 'trabajos-mecanicos-temporales'
export const ZONA_HORARIA_TRABAJOS = 'America/Mexico_City'
export const MAX_BYTES_FOTO_TRABAJO = 1_500_000
export const MIME_FOTOS_TRABAJO = new Set(['image/webp', 'image/jpeg'])

export const fechaEnMexico = (ahora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA_TRABAJOS }).format(ahora)

export const fotoTrabajoVigente = (expiraAt: string | null | undefined, eliminadaAt: string | null | undefined, ahora = new Date()) =>
  Boolean(expiraAt && !eliminadaAt && new Date(expiraAt).getTime() > ahora.getTime())

export const rutaFotoTrabajoValida = (ruta: string) =>
  /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/i.test(ruta)

export const extensionParaMime = (mime: string) => mime === 'image/webp' ? 'webp' : 'jpg'

export const contenidoTrabajoValido = (descripcion: string, tieneFoto: boolean) => descripcion.trim().length > 0 || tieneFoto

export const rutasVencidasDelModulo = (rutas: string[], fechaActualMexico: string) =>
  [...new Set(rutas.filter((ruta) => rutaFotoTrabajoValida(ruta) && ruta.slice(0, 10) < fechaActualMexico))]

