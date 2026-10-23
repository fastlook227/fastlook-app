import { Clock3, Package, ReceiptText } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { MovimientoInventario } from '@/types'
import { formatearFechaHoraFastLook } from '@/utils/fechas'

export default function Movimientos({ movimientos, onGenerarTicket, onReimprimirTicket, permitirReimpresion }: {
  movimientos: MovimientoInventario[]
  onGenerarTicket: (ticketId: string) => Promise<void>
  onReimprimirTicket: (ticketId: string) => Promise<void>
  permitirReimpresion: boolean
}) {
  const [generando, setGenerando] = useState<string | null>(null)
  const generandoRef = useRef<string | null>(null)
  const visibles = useMemo(() => movimientos, [movimientos])
  const ejecutar = async (ticketId: string, accion: (id: string) => Promise<void>) => {
    if (generandoRef.current) return
    generandoRef.current = ticketId; setGenerando(ticketId)
    try { await accion(ticketId) } finally { generandoRef.current = null; setGenerando(null) }
  }
  return <section className="fl-movements"><header className="fl-movements-heading"><div><span>FAST LOOK</span><h2>Historial de movimientos</h2></div><strong>{visibles.length} registros</strong></header><div className="fl-movement-grid">{visibles.map((m) => {
    const lineasTicket = (m.lineas_ticket || [m]) as Array<MovimientoInventario & { personalizada?: boolean }>
    const esVenta = Boolean(m.es_ticket && m.ticket_id), pendiente = Boolean(m.pendiente_conciliacion)
    return <article key={m.id} className={`fl-movement-card${esVenta ? ' is-sale' : ''}${pendiente ? ' is-pending' : ''}`}>
      <header><div className="fl-movement-card-icon">{esVenta ? <ReceiptText /> : <Package />}</div><div><small>{esVenta ? 'TICKET DE VENTA' : pendiente ? 'PENDIENTE DE CONCILIACIÓN' : m.tipo_movimiento || 'MOVIMIENTO'}</small><strong>{esVenta ? m.folio || m.ticket_id : m.nombre || m.codigo || 'Movimiento de inventario'}</strong>{esVenta && <em>{m.metodo_pago || 'Método no disponible'}</em>}</div>{(esVenta || pendiente) && m.total != null && <b>${Number(m.total).toFixed(2)}</b>}</header>
      <div className="fl-movement-products">{lineasTicket.map((linea) => { const ajuste = linea.tipo_movimiento === 'AJUSTE_STOCK', personalizada = 'personalizada' in linea && linea.personalizada, diferencia = Number(linea.cantidad || 0), motivo = linea.nota?.replace(/^Cambio manual de stock:\s*/i, ''); return <div key={linea.id} className={ajuste ? 'is-stock-adjustment' : personalizada ? 'is-custom' : ''}><span><strong>{linea.nombre}</strong><small>{personalizada ? 'Producto personalizado' : linea.codigo || 'Sin código'} · {ajuste ? 'Ajuste de stock' : `${linea.cantidad} unidad(es)`}</small></span>{ajuste ? <b>{diferencia > 0 ? '+' : ''}{diferencia}</b> : !esVenta && !pendiente ? <b>{linea.stock_anterior} → {linea.stock_nuevo}</b> : null}{ajuste && <p>Stock {linea.stock_anterior} → {linea.stock_nuevo} · {motivo && motivo !== 'Cambio manual de stock' ? motivo : 'Sin motivo especificado'}</p>}</div> })}</div>
      <footer><div className="fl-movement-meta"><span><Clock3 />{formatearFechaHoraFastLook(m.created_at)}</span>{esVenta && <span>Recibido <b>{m.efectivo_recibido != null ? `$${Number(m.efectivo_recibido).toFixed(2)}` : '—'}</b> · Cambio <b>{m.cambio != null ? `$${Number(m.cambio).toFixed(2)}` : '—'}</b></span>}</div>{esVenta && m.ticket_id && <div className="fl-movement-ticket-actions"><button type="button" className="fl-movement-ticket-button" disabled={Boolean(generando)} onClick={() => void ejecutar(m.ticket_id!, onGenerarTicket)}><ReceiptText size={17} />{generando === m.ticket_id ? 'Generando…' : 'Ticket PDF'}</button>{permitirReimpresion && <button type="button" className="fl-movement-ticket-button" disabled={Boolean(generando)} onClick={() => void ejecutar(m.ticket_id!, onReimprimirTicket)}><ReceiptText size={17} />Reimprimir ticket</button>}</div>}</footer>
    </article>
  })}</div></section>
}
