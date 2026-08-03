import type { RolUsuario } from '@/types'

export interface UsuarioAdministrado {
  id: string
  correo: string
  nombre: string
  rol: RolUsuario
  activo: boolean
  creadoEn: string | null
  ultimaSesion: string | null
}
