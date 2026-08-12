export const ZONA_HORARIA_FAST_LOOK = 'America/Mexico_City'

const formateadorPartes = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA_FAST_LOOK, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })

const partesFechaHora = (valor: string | Date) => {
  const fecha = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(fecha.getTime())) throw new Error('Timestamp no válido.')
  const partes = Object.fromEntries(formateadorPartes.formatToParts(fecha).map((parte) => [parte.type, parte.value]))
  return { year: Number(partes.year), month: Number(partes.month), day: Number(partes.day), hour: Number(partes.hour), minute: Number(partes.minute), second: Number(partes.second) }
}

export const obtenerFechaLocal = (valor: string | Date = new Date()) => {
  const { year, month, day } = partesFechaHora(valor)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export const obtenerFechaActualFastLook = () => obtenerFechaLocal(new Date())
export const obtenerHoraLocalFastLook = (valor: string | Date) => partesFechaHora(valor).hour

export const sumarDiasFechaLocal = (fecha: string, dias: number) => {
  const [year, month, day] = fecha.split('-').map(Number)
  const resultado = new Date(Date.UTC(year, month - 1, day + dias))
  return `${resultado.getUTCFullYear()}-${String(resultado.getUTCMonth() + 1).padStart(2, '0')}-${String(resultado.getUTCDate()).padStart(2, '0')}`
}

const instanteDesdeFechaLocal = (fecha: string) => {
  const [year, month, day] = fecha.split('-').map(Number)
  const objetivoUtc = Date.UTC(year, month - 1, day)
  let instante = objetivoUtc
  for (let intento = 0; intento < 3; intento += 1) {
    const local = partesFechaHora(new Date(instante))
    const representacionLocalUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second)
    instante = objetivoUtc - (representacionLocalUtc - instante)
  }
  return new Date(instante)
}

export const obtenerInicioDiaLocal = (fecha: string) => instanteDesdeFechaLocal(fecha)
export const obtenerSiguienteInicioDiaLocal = (fecha: string) => instanteDesdeFechaLocal(sumarDiasFechaLocal(fecha, 1))
export const obtenerRangoFechasFastLook = (inicio: string, finInclusivo: string) => ({ inicio, fin: finInclusivo, inicioIso: obtenerInicioDiaLocal(inicio).toISOString(), finExclusivoIso: obtenerSiguienteInicioDiaLocal(finInclusivo).toISOString() })
export const obtenerRangoDiaLocal = (fecha = obtenerFechaActualFastLook()) => obtenerRangoFechasFastLook(fecha, fecha)
export const obtenerRangoAyerFastLook = (ahora: string | Date = new Date()) => { const ayer = sumarDiasFechaLocal(obtenerFechaLocal(ahora), -1); return obtenerRangoFechasFastLook(ayer, ayer) }

const fechaCalendario = (year: number, monthIndex: number, day: number) => {
  const fecha = new Date(Date.UTC(year, monthIndex, day))
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(fecha.getUTCDate()).padStart(2, '0')}`
}

export type PeriodoCalendarioFastLook = 'hoy' | 'ayer' | 'ultimos7' | 'mesActual' | 'mesAnterior'
export const obtenerRangoPeriodoFastLook = (periodo: PeriodoCalendarioFastLook, ahora: string | Date = new Date()) => {
  const hoy = obtenerFechaLocal(ahora)
  const [year, month] = hoy.split('-').map(Number)
  if (periodo === 'ayer') return obtenerRangoAyerFastLook(ahora)
  if (periodo === 'ultimos7') return obtenerRangoFechasFastLook(sumarDiasFechaLocal(hoy, -6), hoy)
  if (periodo === 'mesActual') return obtenerRangoFechasFastLook(fechaCalendario(year, month - 1, 1), hoy)
  if (periodo === 'mesAnterior') { const inicio = fechaCalendario(year, month - 2, 1); return obtenerRangoFechasFastLook(inicio, sumarDiasFechaLocal(fechaCalendario(year, month - 1, 1), -1)) }
  return obtenerRangoDiaLocal(hoy)
}

export const formatearFechaHoraFastLook = (valor: string | Date) => new Intl.DateTimeFormat('es-MX', { timeZone: ZONA_HORARIA_FAST_LOOK, day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(valor instanceof Date ? valor : new Date(valor)).replace(',', ' ·')
