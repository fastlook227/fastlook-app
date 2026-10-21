export const ZONA_HORARIA_TIANGUIS = 'America/Mexico_City'
export const BUCKET_FOTOS_TIANGUIS = 'tianguis-sobrantes'
export const MAX_BYTES_FOTO_TIANGUIS = 1_500_000
export const MIME_FOTOS_TIANGUIS = new Set(['image/webp', 'image/jpeg'])

export function domingoDeSemana(fecha: string) {
  const [year, month, day] = fecha.split('-').map(Number)
  const fechaUtc = new Date(Date.UTC(year, month - 1, day))
  const diaIso = fechaUtc.getUTCDay() || 7
  fechaUtc.setUTCDate(fechaUtc.getUTCDate() + 7 - diaIso)
  return fechaUtc.toISOString().slice(0, 10)
}

export function diaSemanaLocal(fecha: string) {
  const [year, month, day] = fecha.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export const tianguisDebeIrPrimero = (fecha: string) => [0, 6].includes(diaSemanaLocal(fecha))
export const filtrarTareasTianguis = <T extends { nombre: string }>(tareas: T[], busqueda: string) => {
  const termino = busqueda.trim().toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!termino) return tareas
  return tareas.filter((tarea) => tarea.nombre.toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(termino))
}

export const rutaFotoTianguisValida = (ruta: string) => /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(foto|thumb)\.(webp|jpg)$/i.test(ruta)
export const extensionFotoTianguis = (mime: string) => mime === 'image/webp' ? 'webp' : 'jpg'
