import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ErrorAutenticacion, exigirAdministrador } from '@/lib/auth/servidor'
import { obtenerSupabaseAdmin } from '@/lib/supabaseAdmin'

const EsquemaActualizar = z.object({
  nombre: z.string().trim().min(1).max(150).optional(),
  rol: z.enum(['Admin', 'Vendedor']).optional(),
  activo: z.boolean().optional(),
}).strict().refine((datos) => Object.keys(datos).length > 0, 'No se proporcionaron cambios.')

export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    await exigirAdministrador(request)
    const { id } = await contexto.params
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ ok: false, mensaje: 'El usuario no es válido.' }, { status: 400 })
    }
    const entrada = EsquemaActualizar.safeParse(await request.json())
    if (!entrada.success) {
      return NextResponse.json({ ok: false, mensaje: entrada.error.issues[0]?.message || 'Los cambios no son válidos.' }, { status: 400 })
    }
    const admin = obtenerSupabaseAdmin()
    const { data: actual, error: errorActual } = await admin
      .from('usuarios').select('id,nombre,rol,activo').eq('id', id).maybeSingle()
    if (errorActual) throw new Error('No fue posible consultar el perfil.')
    if (!actual) return NextResponse.json({ ok: false, mensaje: 'Usuario no encontrado.' }, { status: 404 })

    const dejaDeSerAdminActivo = actual.rol === 'Admin' && actual.activo === true && (
      entrada.data.rol === 'Vendedor' || entrada.data.activo === false
    )
    if (dejaDeSerAdminActivo) {
      const { count, error: errorConteo } = await admin
        .from('usuarios').select('id', { count: 'exact', head: true })
        .eq('rol', 'Admin').eq('activo', true)
      if (errorConteo) throw new Error('No fue posible validar los administradores activos.')
      if ((count || 0) <= 1) {
        return NextResponse.json({ ok: false, mensaje: 'No puedes desactivar ni cambiar el rol del último Admin activo.' }, { status: 409 })
      }
    }

    const { data: actualizado, error } = await admin
      .from('usuarios').update(entrada.data).eq('id', id)
      .select('id,correo,nombre,rol,activo').single()
    if (error) throw new Error('No fue posible actualizar el perfil.')
    return NextResponse.json({ ok: true, mensaje: 'Usuario actualizado correctamente.', usuario: actualizado })
  } catch (error) {
    if (error instanceof ErrorAutenticacion) {
      return NextResponse.json({ ok: false, mensaje: error.message }, { status: error.status })
    }
    return NextResponse.json({ ok: false, mensaje: error instanceof Error ? error.message : 'No fue posible actualizar el usuario.' }, { status: 500 })
  }
}
