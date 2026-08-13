import { NextResponse } from 'next/server'
import { ErrorAutenticacion, exigirAccesoCorteCaja } from '@/lib/auth/servidor'
import { obtenerSupabaseAdmin } from '@/lib/supabaseAdmin'
import { obtenerRangoAyerFastLook } from '@/utils/fechas'
import { calcularDatosCorte, normalizarMetodoCorte } from '@/utils/corte'
import type { Venta } from '@/types'
import type { Devolucion, DevolucionDetalle } from '@/types/devoluciones'

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
    const [{ data: ventas, error: errorVentas }, { data: devoluciones, error: errorDevoluciones }] = await Promise.all([
      admin.from('ventas').select('*').gte('created_at', rangoAyer.inicioIso).lt('created_at', rangoAyer.finExclusivoIso),
      admin.from('devoluciones').select('*').gte('created_at', rangoAyer.inicioIso).lt('created_at', rangoAyer.finExclusivoIso),
    ])
    if (errorVentas) throw errorVentas
    if (errorDevoluciones) throw errorDevoluciones
    const idsDevoluciones = (devoluciones || []).map((devolucion) => devolucion.id)
    let detalles: DevolucionDetalle[] = []
    if (idsDevoluciones.length > 0) {
      const { data, error } = await admin.from('devoluciones_detalle').select('*').in('devolucion_id', idsDevoluciones)
      if (error) throw error
      detalles = (data || []) as DevolucionDetalle[]
    }
    const datos = calcularDatosCorte((ventas || []) as Venta[], (devoluciones || []) as Devolucion[], detalles, ayer, ayer)
    const metodos = new Map(datos.metodos.map((metodo) => [normalizarMetodoCorte(metodo.metodo), metodo]))
    const efectivo = metodos.get('Efectivo') || { bruto: 0, devuelto: 0, neto: 0 }
    const transferencia = metodos.get('Transferencia') || { bruto: 0, devuelto: 0, neto: 0 }
    const tarjeta = metodos.get('Tarjeta') || { bruto: 0, devuelto: 0, neto: 0 }
    const resumen = datos.resumen
    const { error: errorCorte } = await admin.from('cortes_caja').insert({
      fecha_inicio: ayer,
      fecha_fin: ayer,
      ventas_brutas: resumen.ventasBrutas,
      total_devoluciones: resumen.devoluciones,
      ventas_netas: resumen.ventasNetas,
      ganancia_bruta: resumen.gananciaBruta,
      utilidad_revertida: resumen.utilidadRevertida,
      ganancia_neta: resumen.gananciaNeta,
      numero_tickets: resumen.numeroTickets,
      numero_devoluciones: resumen.numeroDevoluciones,
      productos_devueltos: resumen.productosDevueltos,
      efectivo_bruto: efectivo.bruto,
      efectivo_devuelto: efectivo.devuelto,
      efectivo_neto: efectivo.neto,
      transferencia_bruta: transferencia.bruto,
      transferencia_devuelta: transferencia.devuelto,
      transferencia_neta: transferencia.neto,
      tarjeta_bruta: tarjeta.bruto,
      tarjeta_devuelta: tarjeta.devuelto,
      tarjeta_neta: tarjeta.neto,
      total: resumen.ventasNetas,
      ganancia: resumen.gananciaNeta,
      efectivo: efectivo.neto,
      transferencia: transferencia.neto,
      tarjeta: tarjeta.neto,
    })
    if (errorCorte) throw errorCorte
    return NextResponse.json({ ok: true, creado: true }, { status: 201 })
  } catch (error) {
    return responderError(error)
  }
}
