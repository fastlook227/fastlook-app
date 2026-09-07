import type { RolUsuario } from '@/types'

export type EstadoConexionInterphone = 'desconectado' | 'conectando' | 'conectado' | 'reconectando' | 'sin-microfono' | 'error'

export interface UsuarioInterphone {
  id: string
  nombre: string
  rol: RolUsuario
  hablando: boolean
  onlineAt: string
}

export interface SenalWebRTC {
  origen: string
  destino: string
  descripcion?: RTCSessionDescriptionInit
  candidato?: RTCIceCandidateInit
}

