import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ErrorAutenticacion, exigirAdministrador } from '@/lib/auth/servidor'
import { ejecutarCambioUbicacion } from '@/lib/asistente/ejecutarAcciones'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase'
import type { ResultadoEjecucionAsistente } from '@/types/asistente'

const EsquemaDatosUbicacion = z.object({
  accion: z.literal('CAMBIAR_UBICACION'),
  productoId: z.string().uuid(),
  nuevaUbicacion: z.string().trim().min(1).max(100),
})

const EsquemaSolicitud = z.discriminatedUnion('operacion', [
  z.object({
    operacion: z.literal('PREPARAR'),
    propuestaId: z.string().uuid(),
    mensajeOriginal: z.string().max(1000),
    datos: EsquemaDatosUbicacion,
  }),
  z.object({ operacion: z.literal('EJECUTAR'), propuestaId: z.string().uuid() }),
  z.object({ operacion: z.literal('CANCELAR'), propuestaId: z.string().uuid() }),
])

type AccionRegistrada = {
  id: string
  propuesta_id: string
  accion: string
  datos_propuestos: unknown
  estado: string
}

const clienteAutenticado = (request: Request) => {
  const autorizacion = request.headers.get('authorization') || ''
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

const mensajeSupabase = (error: { code?: string; message?: string }) =>
  error.code === '42501' || /row-level security|permission denied/i.test(error.message || '')
    ? 'Supabase rechazó la operación por sus políticas RLS.'
    : error.message || 'Supabase no está disponible.'

export async function POST(request: Request) {
  try {
    const perfil = await exigirAdministrador(request)
    const solicitud = EsquemaSolicitud.safeParse(await request.json())
    if (!solicitud.success) {
      return NextResponse.json(
        { ok: false, mensaje: 'En esta etapa solo está habilitado CAMBIAR_UBICACION.' },
        { status: 400 }
      )
    }
    const entrada = solicitud.data
    const cliente = clienteAutenticado(request)
    const buscarAccion = async () => {
      console.log('PASO 1: consultar acciones_asistente')
      const { data, error } = await cliente.from('acciones_asistente')
        .select('id,propuesta_id,accion,datos_propuestos,estado')
        .eq('propuesta_id', entrada.propuestaId).maybeSingle()
      if (error) throw new Error(mensajeSupabase(error))
      return data as AccionRegistrada | null
    }

    if (entrada.operacion === 'PREPARAR') {
      const existente = await buscarAccion()
      if (existente) {
        return NextResponse.json({ ok: true, accionId: existente.id, estado: existente.estado })
      }
      const ahora = new Date().toISOString()
      const datosInsertar = {
        propuesta_id: entrada.propuestaId,
        usuario_rol: perfil.rol,
        mensaje_original: entrada.mensajeOriginal,
        accion: 'CAMBIAR_UBICACION',
        datos_propuestos: entrada.datos,
        estado: 'PROPUESTA',
        requiere_confirmacion: true,
        error: null,
        creado_en: ahora,
        actualizado_en: ahora,
        confirmado_en: null,
        ejecutado_en: null,
      }
      const perfilActual = await cliente
        .from('usuarios')
        .select('id, correo, rol, activo')
        .single()
      console.log({
        perfilActual: perfilActual.data,
        errorPerfil: perfilActual.error,
      })
      const { data: usuarioJWT } = await cliente.auth.getUser()
      console.log(usuarioJWT.user?.id)
      console.log('PASO 2: insertar acciones_asistente')
      console.log('Objeto enviado a acciones_asistente:', datosInsertar)
      const { data, error } = await cliente.from('acciones_asistente').insert(datosInsertar).select('id').single()
      console.log('Error de acciones_asistente:', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
      })
      if (error) throw new Error(mensajeSupabase(error))
      return NextResponse.json({ ok: true, accionId: data.id, estado: 'PROPUESTA' })
    }

    const accion = await buscarAccion()
    if (!accion) {
      return NextResponse.json({ ok: false, mensaje: 'La propuesta no existe.' }, { status: 404 })
    }
    if (accion.estado === 'EJECUTADA') {
      return NextResponse.json({
        ok: true, mensaje: 'Esta propuesta ya fue procesada.', accion: 'CAMBIAR_UBICACION',
        productosAfectados: 0, productosOmitidos: 0, detalles: [], errores: [], duplicada: true,
      } satisfies ResultadoEjecucionAsistente)
    }
    if (entrada.operacion === 'CANCELAR') {
      console.log('PASO CANCELAR: actualizar acciones_asistente')
      const { error } = await cliente.from('acciones_asistente').update({
        estado: 'CANCELADA', actualizado_en: new Date().toISOString(), error: null,
      }).eq('id', accion.id).in('estado', ['PROPUESTA', 'ERROR'])
      if (error) throw new Error(mensajeSupabase(error))
      return NextResponse.json({ ok: true, mensaje: 'Propuesta cancelada.' })
    }
    if (accion.estado === 'CONFIRMADA') {
      return NextResponse.json({ ok: false, mensaje: 'La propuesta ya se está procesando.' }, { status: 409 })
    }
    if (accion.estado === 'CANCELADA') {
      return NextResponse.json({ ok: false, mensaje: 'La propuesta fue cancelada.' }, { status: 409 })
    }

    const datos = EsquemaDatosUbicacion.safeParse(accion.datos_propuestos)
    if (!datos.success || accion.accion !== 'CAMBIAR_UBICACION') {
      return NextResponse.json({ ok: false, mensaje: 'La propuesta no corresponde a un cambio de ubicación válido.' }, { status: 409 })
    }
    const confirmadoEn = new Date().toISOString()
    console.log('PASO 3: actualizar acciones_asistente a CONFIRMADA')
    const { data: reclamada, error: errorConfirmar } = await cliente.from('acciones_asistente')
      .update({ estado: 'CONFIRMADA', confirmado_en: confirmadoEn, actualizado_en: confirmadoEn, error: null })
      .eq('id', accion.id).in('estado', ['PROPUESTA', 'ERROR']).select('id')
    if (errorConfirmar) throw new Error(mensajeSupabase(errorConfirmar))
    if (!reclamada?.length) {
      return NextResponse.json({ ok: false, mensaje: 'La propuesta ya se está procesando.' }, { status: 409 })
    }

    const resultado = await ejecutarCambioUbicacion(
      datos.data.productoId,
      datos.data.nuevaUbicacion,
      { usuarioRol: perfil.rol, accionAsistenteId: accion.id, cliente }
    )
    const finalizadoEn = new Date().toISOString()
    console.log('PASO 6: actualizar acciones_asistente con el resultado final')
    const { error: errorFinal } = await cliente.from('acciones_asistente').update({
      estado: resultado.ok ? 'EJECUTADA' : 'ERROR',
      datos_confirmados: resultado,
      ejecutado_en: resultado.ok ? finalizadoEn : null,
      actualizado_en: finalizadoEn,
      error: resultado.ok ? null : resultado.mensaje.slice(0, 500),
    }).eq('id', accion.id).eq('estado', 'CONFIRMADA')
    if (errorFinal) throw new Error(mensajeSupabase(errorFinal))
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 409 })
  } catch (error) {
    if (error instanceof ErrorAutenticacion) {
      return NextResponse.json({ ok: false, mensaje: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { ok: false, mensaje: error instanceof Error ? error.message : 'No fue posible ejecutar el cambio de ubicación.' },
      { status: 500 }
    )
  }
}
