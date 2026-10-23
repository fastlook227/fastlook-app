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
  const visibles = useMemo(() => {
    const ticketsVistos = new Set<string>()
    return movimientos.filter((movimiento) => {
      if (!movimiento.ticket_id) return true
      if (ticketsVistos.has(movimiento.ticket_id)) return false
      ticketsVistos.add(movimiento.ticket_id); return true
    })
  }, [movimientos])
  const ejecutar = async (ticketId: string, accion: (id: string) => Promise<void>) => {
    if (generandoRef.current) return
    generandoRef.current = ticketId; setGenerando(ticketId)
    try { await accion(ticketId) } finally { generandoRef.current = null; setGenerando(null) }
  }
  return <section className="fl-movements"><header className="fl-movements-heading"><div><span>FAST LOOK</span><h2>Historial de movimientos</h2></div><strong>{visibles.length} registros</strong></header><div className="fl-movement-grid">{visibles.map((m) => {
    const lineasTicket = m.ticket_id ? movimientos.filter((item) => item.ticket_id === m.ticket_id) : [m]
    const esVenta = Boolean(m.ticket_id) && lineasTicket.some((item) => item.tipo_movimiento?.toLocaleLowerCase('es-MX') === 'venta')
    return <article key={m.ticket_id || m.id} className={`fl-movement-card${esVenta ? ' is-sale' : ''}`}>
      <header><div className="fl-movement-card-icon">{esVenta ? <ReceiptText /> : <Package />}</div><div><small>{esVenta ? 'TICKET DE VENTA' : m.tipo_movimiento || 'MOVIMIENTO'}</small><strong>{esVenta ? m.folio || m.ticket_id : m.nombre || m.codigo || 'Movimiento de inventario'}</strong></div>{esVenta && m.total != null && <b>${Number(m.total).toFixed(2)}</b>}</header>
      <div className="fl-movement-products">{lineasTicket.map((linea) => { const ajuste = linea.tipo_movimiento === 'AJUSTE_STOCK', diferencia = Number(linea.cantidad || 0), motivo = linea.nota?.replace(/^Cambio manual de stock:\s*/i, ''); return <div key={linea.id} className={ajuste ? 'is-stock-adjustment' : ''}><span><strong>{linea.nombre}</strong><small>{linea.codigo || 'Sin código'} · {ajuste ? 'Ajuste de stock' : `${linea.cantidad} unidad(es)`}</small></span>{ajuste ? <b>{diferencia > 0 ? '+' : ''}{diferencia}</b> : <b>{linea.stock_anterior} → {linea.stock_nuevo}</b>}{ajuste && <p>Stock {linea.stock_anterior} → {linea.stock_nuevo} · {motivo && motivo !== 'Cambio manual de stock' ? motivo : 'Sin motivo especificado'}</p>}</div> })}</div>
      <footer><div className="fl-movement-meta"><span><Clock3 />{formatearFechaHoraFastLook(m.created_at)}</span>{esVenta && <span>Recibido <b>{m.efectivo_recibido != null ? `$${Number(m.efectivo_recibido).toFixed(2)}` : '—'}</b> · Cambio <b>{m.cambio != null ? `$${Number(m.cambio).toFixed(2)}` : '—'}</b></span>}</div>{esVenta && m.ticket_id && <div className="fl-movement-ticket-actions"><button type="button" className="fl-movement-ticket-button" disabled={Boolean(generando)} onClick={() => void ejecutar(m.ticket_id!, onGenerarTicket)}><ReceiptText size={17} />{generando === m.ticket_id ? 'Generando…' : 'Ticket PDF'}</button>{permitirReimpresion && <button type="button" className="fl-movement-ticket-button" disabled={Boolean(generando)} onClick={() => void ejecutar(m.ticket_id!, onReimprimirTicket)}><ReceiptText size={17} />Reimprimir ticket</button>}</div>}</footer>
    </article>
  })}</div></section>
}
