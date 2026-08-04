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

type EtapaGET =
  | 'validar_sesion'
  | 'validar_perfil_admin'
  | 'inicializar_cliente_admin'
  | 'listar_usuarios_auth'
  | 'consultar_perfiles'
  | 'combinar_resultados'
  | 'responder'

type EtapaPOST =
  | 'validar_sesion'
  | 'validar_perfil_admin'
  | 'validar_body'
  | 'inicializar_cliente_admin'
  | 'crear_usuario_auth'
  | 'insertar_perfil'
  | 'compensacion_si_falla'
  | 'responder'

type EtapaUsuarios = EtapaGET | EtapaPOST

const detalleError = (error: unknown) => {
  const objeto = typeof error === 'object' && error !== null
    ? error as Record<string, unknown>
    : null
  return {
    name: error instanceof Error ? error.name : 'Error desconocido',
    status: typeof objeto?.status === 'number' ? objeto.status : undefined,
    code: typeof objeto?.code === 'string' ? objeto.code : undefined,
    message: error instanceof Error
      ? error.message
      : typeof objeto?.message === 'string'
        ? objeto.message
        : 'Error desconocido',
  }
}

const registrarError = (etapa: EtapaUsuarios, error: unknown) => {
  const detalle = detalleError(error)
  console.error('Error seguro en /api/usuarios:', { etapa, ...detalle })
  return detalle
}

const respuestaError = (error: unknown, etapa: EtapaUsuarios) => {
  const detalle = registrarError(etapa, error)
  if (error instanceof ErrorAutenticacion) {
    return NextResponse.json({
      ok: false,
      etapa,
      mensaje: error.message,
      ...(detalle.code ? { codigo: detalle.code } : {}),
      statusExterno: error.status,
    }, { status: error.status })
  }
  return NextResponse.json({
    ok: false,
    etapa,
    mensaje: detalle.message,
    ...(detalle.code ? { codigo: detalle.code } : {}),
    ...(detalle.status !== undefined ? { statusExterno: detalle.status } : {}),
  }, { status: 500 })
}

export async function GET(request: Request) {
  let etapa: EtapaGET = 'validar_sesion'
  try {
    try {
      await exigirAdministrador(request)
    } catch (error) {
      if (error instanceof ErrorAutenticacion && error.status === 403) etapa = 'validar_perfil_admin'
      throw error
    }

    etapa = 'inicializar_cliente_admin'
    const admin = obtenerSupabaseAdmin()

    etapa = 'listar_usuarios_auth'
    const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (authError) throw authError
    console.log('Diagnóstico seguro en /api/usuarios:', {
      etapa,
      dataPresente: Boolean(authData),
      usersEsArreglo: Array.isArray(authData?.users),
      cantidadUsuariosAuth: Array.isArray(authData?.users) ? authData.users.length : 0,
    })
    if (!authData || !Array.isArray(authData.users)) {
      throw new Error('La respuesta de Auth no contiene una lista de usuarios válida.')
    }

    etapa = 'consultar_perfiles'
    const { data: perfiles, error: perfilesError } = await admin
      .from('usuarios')
      .select('id,correo,nombre,rol,activo')
    if (perfilesError) throw perfilesError
    console.log('Diagnóstico seguro en /api/usuarios:', {
      etapa,
      perfilesEsArreglo: Array.isArray(perfiles),
      cantidadPerfiles: Array.isArray(perfiles) ? perfiles.length : 0,
    })
    if (perfiles !== null && !Array.isArray(perfiles)) {
      throw new Error('La consulta de perfiles devolvió una estructura inválida.')
    }

    etapa = 'combinar_resultados'
    const perfilesPorId = new Map((perfiles || []).map((perfil) => [perfil.id, perfil]))
    console.log('Diagnóstico seguro en /api/usuarios:', {
      etapa,
      usuariosAuthSinPerfil: authData.users.filter((usuario) => !perfilesPorId.has(usuario.id)).length,
    })
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

    etapa = 'responder'
    return NextResponse.json({ ok: true, usuarios })
  } catch (error) {
    return respuestaError(error, etapa)
  }
}

export async function POST(request: Request) {
  let etapa: EtapaPOST = 'validar_sesion'
  try {
    try {
      await exigirAdministrador(request)
    } catch (error) {
      if (error instanceof ErrorAutenticacion && error.status === 403) etapa = 'validar_perfil_admin'
      throw error
    }

    etapa = 'validar_body'
    let body: unknown
    try {
      body = await request.json()
    } catch (error) {
      return respuestaError(error, etapa)
    }
    const entrada = EsquemaCrearUsuario.safeParse(body)
    if (!entrada.success) {
      const mensaje = entrada.error.issues[0]?.message || 'Los datos no son válidos.'
      registrarError(etapa, new Error(mensaje))
      return NextResponse.json({ ok: false, etapa, mensaje }, { status: 400 })
    }

    etapa = 'inicializar_cliente_admin'
    const admin = obtenerSupabaseAdmin()
    const correo = entrada.data.correo.toLowerCase()

    etapa = 'crear_usuario_auth'
    const { data: perfilExistente, error: errorPerfilExistente } = await admin
      .from('usuarios')
      .select('id')
      .eq('correo', correo)
      .maybeSingle()
    if (errorPerfilExistente) throw errorPerfilExistente
    if (perfilExistente) {
      return NextResponse.json({
        ok: false,
        etapa,
        mensaje: 'Ya existe un usuario con ese correo.',
      }, { status: 409 })
    }

    const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
      email: correo,
      password: entrada.data.password,
      email_confirm: true,
      user_metadata: { nombre: entrada.data.nombre },
    })
    if (errorAuth) throw errorAuth
    console.log('Diagnóstico seguro en /api/usuarios:', {
      etapa,
      dataPresente: Boolean(creado),
      usuarioCreadoPresente: Boolean(creado?.user),
    })
    if (!creado || !creado.user) {
      throw new Error('La respuesta de Auth no contiene el usuario creado.')
    }

    etapa = 'insertar_perfil'
    const { error: errorPerfil } = await admin.from('usuarios').insert({
      id: creado.user.id,
      correo,
      nombre: entrada.data.nombre,
      rol: entrada.data.rol,
      activo: entrada.data.activo,
    })
    if (errorPerfil) {
      etapa = 'compensacion_si_falla'
      const { error: errorCompensacion } = await admin.auth.admin.deleteUser(creado.user.id)
      if (errorCompensacion) registrarError(etapa, errorCompensacion)
      return respuestaError(errorPerfil, 'insertar_perfil')
    }

    etapa = 'responder'
    return NextResponse.json({
      ok: true,
      mensaje: `Usuario ${entrada.data.rol} creado correctamente.`,
      usuario: {
        id: creado.user.id,
        correo,
        nombre: entrada.data.nombre,
        rol: entrada.data.rol,
        activo: entrada.data.activo,
      },
    }, { status: 201 })
  } catch (error) {
    if (etapa === 'crear_usuario_auth') {
      const detalle = detalleError(error)
      const duplicado = /already|registered|exists/i.test(detalle.message)
      if (duplicado) {
        registrarError(etapa, error)
        return NextResponse.json({
          ok: false,
          etapa,
          mensaje: 'Ya existe un usuario con ese correo.',
          ...(detalle.code ? { codigo: detalle.code } : {}),
          ...(detalle.status !== undefined ? { statusExterno: detalle.status } : {}),
        }, { status: 409 })
      }
    }
    return respuestaError(error, etapa)
  }
}
