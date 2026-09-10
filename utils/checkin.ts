import type { CalculoJornada, EmpleadoCheckIn, JornadaCheckIn } from '@/types/checkin'

export const TARIFA_NORMAL_CENTAVOS = 3500
export const TARIFA_EXTRA_CENTAVOS = 4500
export const LIMITE_NORMAL_MINUTOS = 8 * 60
export const PREFIJO_QR_CHECKIN = 'FASTLOOK-CHECKIN:'

export function calcularJornada(
  entrada: string | Date,
  salida: string | Date,
  tarifaNormalCentavos = TARIFA_NORMAL_CENTAVOS,
  tarifaExtraCentavos = TARIFA_EXTRA_CENTAVOS,
  limiteNormalMinutos = LIMITE_NORMAL_MINUTOS,
): CalculoJornada {
  const inicio = entrada instanceof Date ? entrada.getTime() : new Date(entrada).getTime()
  const fin = salida instanceof Date ? salida.getTime() : new Date(salida).getTime()
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin < inicio) throw new Error('Rango de jornada inválido.')
  const totalSegundos = Math.floor((fin - inicio) / 1000)
  const minutosTrabajados = totalSegundos / 60
  const minutosNormales = Math.min(minutosTrabajados, limiteNormalMinutos)
  const minutosExtra = Math.max(minutosTrabajados - limiteNormalMinutos, 0)
  const pagoNormalCentavos = Math.round((minutosNormales * tarifaNormalCentavos) / 60)
  const pagoExtraCentavos = Math.round((minutosExtra * tarifaExtraCentavos) / 60)
  return { totalSegundos, minutosTrabajados, minutosNormales, minutosExtra, pagoNormalCentavos, pagoExtraCentavos, pagoTotalCentavos: pagoNormalCentavos + pagoExtraCentavos }
}

export const crearContenidoQrCheckIn = (usuarioId: string) => `${PREFIJO_QR_CHECKIN}${usuarioId.toLowerCase()}`

export function resolverQrCheckIn(valor: string) {
  const patron = /^FASTLOOK-CHECKIN:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
  return valor.trim().match(patron)?.[1]?.toLowerCase() ?? null
}

export type AccionCheckIn = 'entrada' | 'salida'
export function accionDisponible(jornada: JornadaCheckIn | null): AccionCheckIn | null {
  if (!jornada) return 'entrada'
  return jornada.salida ? null : 'salida'
}

export function resumirPanelCheckIn(empleados: EmpleadoCheckIn[], ahora = new Date()) {
  let normales = 0
  let extras = 0
  let pago = 0
  let trabajando = 0
  let cerradas = 0
  for (const empleado of empleados) {
    if (!empleado.jornada) continue
    if (empleado.jornada.salida) cerradas += 1
    else trabajando += 1
    const fin = empleado.jornada.salida || ahora
    const calculo = calcularJornada(empleado.jornada.entrada, fin, empleado.jornada.tarifa_normal * 100, empleado.jornada.tarifa_extra * 100, empleado.jornada.limite_horas_normales * 60)
    normales += calculo.minutosNormales
    extras += calculo.minutosExtra
    pago += calculo.pagoTotalCentavos
  }
  return { registrados: trabajando + cerradas, trabajando, cerradas, minutosNormales: normales, minutosExtra: extras, pagoCentavos: pago }
}
