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
  jornadas?: JornadaCheckIn[]
  trabajos?: TrabajoMecanico[]
}

export interface PanelNominaCheckIn {
  modo: 'administrador' | 'empleado'
  desde: string
  hasta: string
  porcentaje_actual: number
  empleados: EmpleadoCheckIn[]
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
  descripcion: string | null
  fecha: string
  importe_mano_obra: number
  porcentaje_aplicado: number
  comision: number
  estado: EstadoTrabajoMecanico
  created_at: string
  foto_ruta: string | null
  foto_expira_at: string | null
  foto_eliminada_at: string | null
}
