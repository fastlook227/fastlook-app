import type { RolUsuario } from '@/types'

export interface JornadaCheckIn {
  id: string
  fecha: string
  entrada: string
  salida: string | null
  tarifa_normal: number
  tarifa_extra: number
  limite_horas_normales: number
  es_anterior?: boolean
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

export type EstadoTrabajoMecanico = 'Pendiente' | 'Pagada' | 'Cancelada'

export interface TrabajoMecanico {
  id: string
  empleado_id: string
  empleado_nombre: string
  descripcion: string
  fecha: string
  importe_mano_obra: number
  porcentaje_aplicado: number
  comision: number
  estado: EstadoTrabajoMecanico
  created_at: string
}
