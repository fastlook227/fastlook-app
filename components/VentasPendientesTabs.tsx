'use client'

import { Plus, X } from 'lucide-react'
import type { VentaPendiente } from '@/utils/ventasPendientes'
import { resumirCarritoVenta } from '@/utils/ventaRapida'

export default function VentasPendientesTabs({ ventas, activaId, procesandoId, onSeleccionar, onNueva, onCerrar }: {
  ventas: readonly VentaPendiente[]
  activaId: string
  procesandoId: string | null
  onSeleccionar: (id: string) => void
  onNueva: () => void
  onCerrar: (id: string) => void
}) {
  return <section className="fl-pending-sales" aria-label="Ventas abiertas">
    <div className="fl-pending-sales-heading"><strong>{ventas.length} venta{ventas.length === 1 ? '' : 's'} abierta{ventas.length === 1 ? '' : 's'}</strong></div>
    <div className="fl-pending-sales-tabs" role="tablist">{ventas.map((venta) => {
      const resumen = resumirCarritoVenta(venta.carrito)
      const procesando = procesandoId === venta.id
      return <div key={venta.id} className={`fl-pending-sale-tab${activaId === venta.id ? ' is-active' : ''}${procesando ? ' is-processing' : ''}`}>
        <button type="button" role="tab" aria-selected={activaId === venta.id} onClick={() => onSeleccionar(venta.id)}><strong>{venta.nombre}{procesando ? ' · Cobrando…' : ''}</strong><small>{resumen.unidades} · ${resumen.total.toFixed(2)}</small></button>
        <button type="button" className="is-close" onClick={() => onCerrar(venta.id)} disabled={procesando} aria-label={`Cerrar ${venta.nombre}`}><X /></button>
      </div>
    })}<button type="button" className="fl-pending-sale-new" onClick={onNueva}><Plus />Nueva venta</button></div>
  </section>
}
