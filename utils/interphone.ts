import type { UsuarioInterphone } from '@/types/interphone'

export interface EstadoPTT {
  conectado: boolean
  transmitiendo: boolean
  usuarioHablandoId: string | null
}

export const estadoPTTInicial = (): EstadoPTT => ({ conectado: false, transmitiendo: false, usuarioHablandoId: null })

export const puedeIniciarPTT = (estado: EstadoPTT, usuarioId: string) => estado.conectado && !estado.transmitiendo && (!estado.usuarioHablandoId || estado.usuarioHablandoId === usuarioId)

export const iniciarPTT = (estado: EstadoPTT, usuarioId: string): EstadoPTT => puedeIniciarPTT(estado, usuarioId)
  ? { ...estado, transmitiendo: true, usuarioHablandoId: usuarioId }
  : estado

export const detenerPTT = (estado: EstadoPTT): EstadoPTT => ({ ...estado, transmitiendo: false, usuarioHablandoId: null })

export const perderConexionPTT = (estado: EstadoPTT): EstadoPTT => ({ ...detenerPTT(estado), conectado: false })

export const actualizarPresencia = (actuales: readonly UsuarioInterphone[], entradas: readonly UsuarioInterphone[], salidas: readonly string[] = []) => {
  const usuarios = new Map(actuales.map((usuario) => [usuario.id, usuario]))
  salidas.forEach((id) => usuarios.delete(id))
  entradas.forEach((usuario) => usuarios.set(usuario.id, usuario))
  return [...usuarios.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export const identificarHablante = (usuarios: readonly UsuarioInterphone[], usuarioId: string | null) => usuarios.find((usuario) => usuario.id === usuarioId)?.nombre || null

export const normalizarVolumen = (volumen: number) => Math.min(100, Math.max(0, volumen)) / 100

export const recepcionSilenciada = (silenciado: boolean, volumen: number) => silenciado || normalizarVolumen(volumen) === 0

