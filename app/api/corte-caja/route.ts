import { NextResponse } from 'next/server'
import { ErrorAutenticacion, exigirAccesoCorteCaja } from '@/lib/auth/servidor'
import { obtenerSupabaseAdmin } from '@/lib/supabaseAdmin'
import { obtenerRangoAyerFastLook, obtenerRangoFechasFastLook } from '@/utils/fechas'
import { consolidarCorte } from '@/utils/corteConsolidado'
import { normalizarMetodoCorte } from '@/utils/corte'
import type { Devolucion } from '@/types/devoluciones'

type Fila = Record<string, unknown>
const TAMANO_PAGINA_DB = 1000
const responderError = (error: unknown) => {
  if (error instanceof ErrorAutenticacion) return NextResponse.json({ ok: false, mensaje: error.message }, { status: error.status })
  console.error('Error seguro en /api/corte-caja:', error)
  return NextResponse.json({ ok: false, mensaje: 'No fue posible procesar Corte de caja.' }, { status: 500 })
}

async function consultarRango(tabla: string, inicioIso: string, finIso: string): Promise<Fila[]> {
  const admin = obtenerSupabaseAdmin(), filas: Fila[] = []
  for (let desde = 0; ; desde += TAMANO_PAGINA_DB) {
    const { data, error } = await admin.from(tabla).select('*').gte('created_at', inicioIso).lt('created_at', finIso).order('created_at').range(desde, desde + TAMANO_PAGINA_DB - 1)
    if (error) throw error
    filas.push(...((data || []) as Fila[]))
    if (!data || data.length < TAMANO_PAGINA_DB) break
  }
  return filas
}

async function obtenerReporte(inicio: string, fin: string, busqueda = '', pagina = 1) {
  const rango = obtenerRangoFechasFastLook(inicio, fin)
  const [tickets, ventas, personalizadas, devoluciones] = await Promise.all([
    consultarRango('ventas_tickets', rango.inicioIso, rango.finExclusivoIso), consultarRango('ventas', rango.inicioIso, rango.finExclusivoIso),
    consultarRango('ventas_personalizadas', rango.inicioIso, rango.finExclusivoIso), consultarRango('devoluciones', rango.inicioIso, rango.finExclusivoIso),
  ])
  const idsDevoluciones = devoluciones.map(d => d.id).filter(Boolean), devolucionesDetalle: Fila[] = []
  for (let i = 0; i < idsDevoluciones.length; i += 100) {
    const { data, error } = await obtenerSupabaseAdmin().from('devoluciones_detalle').select('*').in('devolucion_id', idsDevoluciones.slice(i, i + 100))
    if (error) throw error
    devolucionesDetalle.push(...((data || []) as Fila[]))
  }
  return consolidarCorte({ tickets, ventas, personalizadas, devoluciones: devoluciones as unknown as Devolucion[], devolucionesDetalle, inicio, fin, busqueda, pagina })
}

export async function GET(request: Request) {
  try {
    await exigirAccesoCorteCaja(request)
    const url = new URL(request.url), inicio = url.searchParams.get('inicio'), fin = url.searchParams.get('fin'), admin = obtenerSupabaseAdmin()
    const { data: cortes, error } = await admin.from('cortes_caja').select('*').order('created_at', { ascending: false }).limit(366)
    if (error) throw error
    if (!inicio || !fin) return NextResponse.json({ ok: true, cortes: cortes || [] })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fin) || inicio > fin) return NextResponse.json({ ok: false, mensaje: 'El periodo no es válido.' }, { status: 400 })
    const reporte = await obtenerReporte(inicio, fin, url.searchParams.get('q') || '', Number(url.searchParams.get('pagina') || 1))
    return NextResponse.json({ ok: true, reporte, cortes: cortes || [] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return responderError(error) }
}

export async function POST(request: Request) {
  try {
    await exigirAccesoCorteCaja(request)
    const admin = obtenerSupabaseAdmin(), rango = obtenerRangoAyerFastLook(), reporte = await obtenerReporte(rango.inicio, rango.fin)
    if (reporte.resumen.numeroTickets === 0 && reporte.resumen.devoluciones === 0) return NextResponse.json({ ok: true, creado: false, vacio: true })
    const metodos = new Map(reporte.metodos.map((m) => [normalizarMetodoCorte(m.metodo), m])), vacio = { bruto: 0, devuelto: 0, neto: 0 }
    const efectivo = metodos.get('Efectivo') || vacio, transferencia = metodos.get('Transferencia') || vacio, tarjeta = metodos.get('Tarjeta') || vacio, r = reporte.resumen
    const registro = { fecha_inicio: rango.inicio, fecha_fin: rango.fin, ventas_brutas: r.ventasBrutas, total_devoluciones: r.devoluciones, ventas_netas: r.ventasNetas, ganancia_bruta: r.gananciaBruta, utilidad_revertida: r.utilidadRevertida, ganancia_neta: r.gananciaNeta, numero_tickets: r.numeroTickets, numero_devoluciones: r.numeroDevoluciones, productos_devueltos: r.productosDevueltos, efectivo_bruto: efectivo.bruto, efectivo_devuelto: efectivo.devuelto, efectivo_neto: efectivo.neto, transferencia_bruta: transferencia.bruto, transferencia_devuelta: transferencia.devuelto, transferencia_neta: transferencia.neto, tarjeta_bruta: tarjeta.bruto, tarjeta_devuelta: tarjeta.devuelto, tarjeta_neta: tarjeta.neto, total: r.ventasNetas, ganancia: r.gananciaNeta, efectivo: efectivo.neto, transferencia: transferencia.neto, tarjeta: tarjeta.neto }
    const { error } = await admin.from('cortes_caja').upsert(registro, { onConflict: 'fecha_inicio,fecha_fin', ignoreDuplicates: true })
    if (error) throw error
    return NextResponse.json({ ok: true, creado: true }, { status: 201 })
  } catch (error) { return responderError(error) }
}
