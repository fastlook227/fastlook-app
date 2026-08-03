import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ErrorAutenticacion, exigirAdministrador } from '@/lib/auth/servidor'
import { obtenerSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    await exigirAdministrador(request)
    const { id } = await contexto.params
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ ok: false, mensaje: 'El usuario no es válido.' }, { status: 400 })
    }
    const admin = obtenerSupabaseAdmin()
    const { data: perfil, error: errorPerfil } = await admin
      .from('usuarios').select('correo').eq('id', id).maybeSingle()
    if (errorPerfil || !perfil?.correo) {
      return NextResponse.json({ ok: false, mensaje: 'Usuario no encontrado.' }, { status: 404 })
    }
    const { error } = await admin.auth.resetPasswordForEmail(perfil.correo)
    if (error) throw new Error('No fue posible enviar el correo de restablecimiento.')
    return NextResponse.json({ ok: true, mensaje: 'Correo de restablecimiento enviado.' })
  } catch (error) {
    if (error instanceof ErrorAutenticacion) {
      return NextResponse.json({ ok: false, mensaje: error.message }, { status: error.status })
    }
    return NextResponse.json({ ok: false, mensaje: error instanceof Error ? error.message : 'No fue posible restablecer la contraseña.' }, { status: 500 })
  }
}
