'use client'

import { Lightbulb, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatearFechaHoraFastLook } from '@/utils/fechas'

interface SugerenciaPrecio {
  tipo: 'inventario' | 'externo'
  articulo_id: string
  codigo: string
  nombre: string
  proveedor: string | null
  precio_anterior: number
  precio_candidato: number
  costo: number | null
  margen_estimado_pct: number | null
  tickets: number
  primera_venta: string
  ultima_venta: string
  evidencia: Array<{ ticket_id: string; folio: string; fecha: string; cantidad: number; vendedor: string }>
}

const moneda = (valor: number) => `$${Number(valor).toFixed(2)}`
const clave = (s: SugerenciaPrecio) => `${s.tipo}:${s.articulo_id}:${s.precio_candidato}`

// Sólo propone: el precio oficial cambia únicamente cuando un Admin aprueba y el servidor revalida la evidencia.
export default function SugerenciasPrecio({ onAprobado }: { onAprobado: () => void }) {
  const [sugerencias, setSugerencias] = useState<SugerenciaPrecio[]>([])
  const [disponible, setDisponible] = useState(true)
  const [cargando, setCargando] = useState(false)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    const { data, error: errorRpc } = await supabase.rpc('obtener_sugerencias_precio_admin')
    setCargando(false)
    if (errorRpc?.code === 'PGRST202') { setDisponible(false); return }
    if (errorRpc) { setError('No fue posible consultar las sugerencias de precio.'); return }
    setSugerencias((data || []) as SugerenciaPrecio[])
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const ejecutar = async (s: SugerenciaPrecio, operacion: () => PromiseLike<{ error: { message: string } | null }>) => {
    setProcesando(clave(s)); setError('')
    const { error: errorRpc } = await operacion()
    setProcesando(null)
    if (errorRpc) setError(errorRpc.message.includes('EVIDENCIA_INSUFICIENTE:') || errorRpc.message.includes('SUGERENCIA_INEXISTENTE:') ? 'La evidencia cambió (devolución, cancelación o nuevo precio). Se actualizó la lista.' : 'No fue posible completar la operación.')
    else onAprobado()
    await cargar()
  }

  const aprobar = (s: SugerenciaPrecio) => {
    if (procesando || !confirm(`¿Cambiar el precio oficial de ${s.nombre} de ${moneda(s.precio_anterior)} a ${moneda(s.precio_candidato)}?`)) return
    void ejecutar(s, () => s.tipo === 'inventario'
      ? supabase.rpc('aprobar_sugerencia_precio', { p_producto_id: s.articulo_id, p_precio: s.precio_candidato })
      : supabase.rpc('aprobar_sugerencia_precio_externo', { p_catalogo_producto_id: s.articulo_id, p_precio: s.precio_candidato }))
  }

  const descartar = (s: SugerenciaPrecio) => {
    if (procesando) return
    const motivo = prompt(`Motivo para descartar ${moneda(s.precio_candidato)} en ${s.nombre}:`)?.trim()
    if (!motivo) return
    void ejecutar(s, () => supabase.rpc('descartar_sugerencia_precio', { p_tipo: s.tipo, p_articulo_id: s.articulo_id, p_precio: s.precio_candidato, p_motivo: motivo.slice(0, 250) }))
  }

  if (!disponible || (!sugerencias.length && !error)) return null
  return <details className="fl-inventory-form-card" open>
    <summary><Lightbulb size={18} /> Sugerencias de precio oficial ({sugerencias.length})</summary>
    <p>Basadas en al menos cuatro tickets independientes marcados como “Proponer como precio oficial”. Se excluyen promociones, descuentos, descuentos conjuntos, tickets cancelados, líneas devueltas, precios fuera de ±50 % y evidencia ya descartada.</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" onClick={() => void cargar()} disabled={cargando}><RefreshCw size={16} />Actualizar</button>
    {sugerencias.map((s) => <article key={clave(s)}>
      <h3>{s.nombre} <small>{s.codigo}{s.tipo === 'externo' && ` · Proveedor ${s.proveedor}`}</small></h3>
      <p>Precio actual <b>{moneda(s.precio_anterior)}</b> → candidato <b>{moneda(s.precio_candidato)}</b>{s.margen_estimado_pct != null && <> · margen estimado <b>{s.margen_estimado_pct}%</b> (costo {moneda(Number(s.costo))})</>}</p>
      <p>{s.tickets} tickets · del {formatearFechaHoraFastLook(s.primera_venta)} al {formatearFechaHoraFastLook(s.ultima_venta)}</p>
      <ul>{s.evidencia.map((e) => <li key={e.ticket_id}>{e.folio} · {formatearFechaHoraFastLook(e.fecha)} · {e.cantidad} pza · {e.vendedor}</li>)}</ul>
      <button type="button" disabled={Boolean(procesando)} onClick={() => aprobar(s)}>{procesando === clave(s) ? 'Procesando…' : 'Aprobar precio oficial'}</button>
      <button type="button" disabled={Boolean(procesando)} onClick={() => descartar(s)}>Descartar</button>
    </article>)}
  </details>
}
