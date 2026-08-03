import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ErrorAutenticacion, exigirAdministrador } from '@/lib/auth/servidor'
import { obtenerSupabaseAdmin } from '@/lib/supabaseAdmin'
import type { UsuarioAdministrado } from '@/types/usuarios'

const EsquemaCrearUsuario = z.object({
  nombre: z.string().trim().min(1).max(150),
  correo: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
  confirmarPassword: z.string().min(8).max(200),
  rol: z.enum(['Admin', 'Vendedor']),
  activo: z.boolean().default(true),
}).refine((datos) => datos.password === datos.confirmarPassword, {
  message: 'Las contraseñas no coinciden.', path: ['confirmarPassword'],
})

const respuestaError = (error: unknown) => {
  if (error instanceof ErrorAutenticacion) {
    return NextResponse.json({ ok: false, mensaje: error.message }, { status: error.status })
  }
  const mensaje = error instanceof Error ? error.message : 'No fue posible gestionar los usuarios.'
  return NextResponse.json({ ok: false, mensaje }, { status: 500 })
}

export async function GET(request: Request) {
  try {
    await exigirAdministrador(request)
    const admin = obtenerSupabaseAdmin()
    const [{ data: authData, error: authError }, { data: perfiles, error: perfilesError }] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin.from('usuarios').select('id,correo,nombre,rol,activo'),
    ])
    if (authError) throw new Error('No fue posible listar los usuarios de autenticación.')
    if (perfilesError) throw new Error('No fue posible listar los perfiles de usuarios.')
    const perfilesPorId = new Map((perfiles || []).map((perfil) => [perfil.id, perfil]))
    const usuarios: UsuarioAdministrado[] = authData.users.map((usuario) => {
      const perfil = perfilesPorId.get(usuario.id)
      return {
        id: usuario.id,
        correo: perfil?.correo || usuario.email || '',
        nombre: perfil?.nombre || '',
        rol: perfil?.rol === 'Admin' ? 'Admin' : 'Vendedor',
        activo: perfil?.activo === true,
        creadoEn: usuario.created_at || null,
        ultimaSesion: usuario.last_sign_in_at || null,
      }
    })
    return NextResponse.json({ ok: true, usuarios })
  } catch (error) {
    return respuestaError(error)
  }
}

export async function POST(request: Request) {
  try {
    await exigirAdministrador(request)
    const entrada = EsquemaCrearUsuario.safeParse(await request.json())
    if (!entrada.success) {
      return NextResponse.json(
        { ok: false, mensaje: entrada.error.issues[0]?.message || 'Los datos no son válidos.' },
        { status: 400 }
      )
    }
    const admin = obtenerSupabaseAdmin()
    const correo = entrada.data.correo.toLowerCase()
    const { data: perfilExistente } = await admin.from('usuarios').select('id').eq('correo', correo).maybeSingle()
    if (perfilExistente) {
      return NextResponse.json({ ok: false, mensaje: 'Ya existe un usuario con ese correo.' }, { status: 409 })
    }
    const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
      email: correo,
      password: entrada.data.password,
      email_confirm: true,
      user_metadata: { nombre: entrada.data.nombre },
    })
    if (errorAuth || !creado.user) {
      const duplicado = /already|registered|exists/i.test(errorAuth?.message || '')
      return NextResponse.json(
        { ok: false, mensaje: duplicado ? 'Ya existe un usuario con ese correo.' : 'No fue posible crear el usuario de autenticación.' },
        { status: duplicado ? 409 : 500 }
      )
    }
    const { error: errorPerfil } = await admin.from('usuarios').insert({
      id: creado.user.id,
      correo,
      nombre: entrada.data.nombre,
      rol: entrada.data.rol,
      activo: entrada.data.activo,
    })
    if (errorPerfil) {
      await admin.auth.admin.deleteUser(creado.user.id)
      throw new Error('No fue posible crear el perfil. El usuario de autenticación fue eliminado como compensación.')
    }
    return NextResponse.json({
      ok: true,
      mensaje: `Usuario ${entrada.data.rol} creado correctamente.`,
      usuario: { id: creado.user.id, correo, nombre: entrada.data.nombre, rol: entrada.data.rol, activo: entrada.data.activo },
    }, { status: 201 })
  } catch (error) {
    return respuestaError(error)
  }
}
