import { NextResponse } from 'next/server'
import { ErrorAutenticacion, exigirAccesoCorteCaja } from '@/lib/auth/servidor'
import { obtenerSupabaseAdmin } from '@/lib/supabaseAdmin'
import { obtenerRangoAyerFastLook } from '@/utils/fechas'
import { calcularResumenVentas } from '@/utils/ventas'
import type { Producto, Venta } from '@/types'

const responderError = (error: unknown) => {
  if (error instanceof ErrorAutenticacion) {
    return NextResponse.json({ ok: false, mensaje: error.message }, { status: error.status })
  }
  console.error('Error seguro en /api/corte-caja:', error)
  return NextResponse.json({ ok: false, mensaje: 'No fue posible procesar Corte de caja.' }, { status: 500 })
}

export async function GET(request: Request) {
  try {
    await exigirAccesoCorteCaja(request)
    const { data, error } = await obtenerSupabaseAdmin().from('cortes_caja').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ ok: true, cortes: data || [] })
  } catch (error) {
    return responderError(error)
  }
}

export async function POST(request: Request) {
  try {
    await exigirAccesoCorteCaja(request)
    const admin = obtenerSupabaseAdmin()
    const rangoAyer = obtenerRangoAyerFastLook()
    const ayer = rangoAyer.inicio
    const { data: existente, error: errorExistente } = await admin.from('cortes_caja').select('id').eq('fecha_inicio', ayer).eq('fecha_fin', ayer).limit(1)
    if (errorExistente) throw errorExistente
    if (existente?.length) return NextResponse.json({ ok: true, creado: false })
    const [{ data: ventas, error: errorVentas }, { data: productos, error: errorProductos }] = await Promise.all([
      admin.from('ventas').select('*').gte('created_at', rangoAyer.inicioIso).lt('created_at', rangoAyer.finExclusivoIso),
      admin.from('productos').select('*'),
    ])
    if (errorVentas) throw errorVentas
    if (errorProductos) throw errorProductos
    const resumen = calcularResumenVentas((ventas || []) as Venta[], (productos || []) as Producto[])
    const { error: errorCorte } = await admin.from('cortes_caja').insert({
      fecha_inicio: ayer, fecha_fin: ayer, total: resumen.total, ganancia: resumen.ganancia,
      efectivo: resumen.metodos.Efectivo || 0, transferencia: resumen.metodos.Transferencia || 0, tarjeta: resumen.metodos.Tarjeta || 0,
    })
    if (errorCorte) throw errorCorte
    return NextResponse.json({ ok: true, creado: true }, { status: 201 })
  } catch (error) {
    return responderError(error)
  }
}
