import type { RolUsuario } from '@/types'

export interface JornadaCheckIn {
  id: string
  fecha: string
  entrada: string
  salida: string | null
  tarifa_normal: number
  tarifa_extra: number
  limite_horas_normales: number
}

export interface EmpleadoCheckIn {
  id: string
  nombre: string
  rol: RolUsuario
  activo: boolean
  jornada: JornadaCheckIn | null
}

export interface CalculoJornada {
  totalSegundos: number
  minutosTrabajados: number
  minutosNormales: number
  minutosExtra: number
  pagoNormalCentavos: number
  pagoExtraCentavos: number
  pagoTotalCentavos: number
}
