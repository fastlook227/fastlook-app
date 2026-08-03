import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase'
import type { PerfilUsuario, RolUsuario } from '@/types'

export class ErrorAutenticacion extends Error {
  constructor(public status: 401 | 403, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorAutenticacion'
  }
}

export async function obtenerPerfilAutenticado(request: Request): Promise<PerfilUsuario> {
  const autorizacion = request.headers.get('authorization') || ''
  const token = autorizacion.startsWith('Bearer ') ? autorizacion.slice(7).trim() : ''
  if (!token) throw new ErrorAutenticacion(401, 'Debes iniciar sesión.')

  const cliente = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data: usuarioData, error: errorUsuario } = await cliente.auth.getUser(token)
  if (errorUsuario || !usuarioData.user) {
    throw new ErrorAutenticacion(401, 'La sesión no es válida o expiró.')
  }

  const { data: perfil, error: errorPerfil } = await cliente
    .from('usuarios')
    .select('id,correo,nombre,rol,activo')
    .eq('id', usuarioData.user.id)
    .maybeSingle()
  if (errorPerfil) throw new ErrorAutenticacion(403, 'No fue posible validar el perfil del usuario.')
  if (!perfil) throw new ErrorAutenticacion(403, 'El usuario no tiene un perfil autorizado.')
  if (perfil.activo !== true) throw new ErrorAutenticacion(403, 'El usuario está inactivo.')
  if (!['Admin', 'Vendedor'].includes(perfil.rol)) {
    throw new ErrorAutenticacion(403, 'El usuario no tiene un rol válido.')
  }
  return { ...perfil, rol: perfil.rol as RolUsuario } as PerfilUsuario
}

export async function exigirAdministrador(request: Request): Promise<PerfilUsuario> {
  const perfil = await obtenerPerfilAutenticado(request)
  if (perfil.rol !== 'Admin') {
    throw new ErrorAutenticacion(403, 'Esta acción requiere permisos de Administrador.')
  }
  return perfil
}
