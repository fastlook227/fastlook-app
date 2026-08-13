import { ReceiptText } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { MovimientoInventario } from '@/types'
import { formatearFechaHoraFastLook } from '@/utils/fechas'

export default function Movimientos({ movimientos, styles, onGenerarTicket }: {
  movimientos: MovimientoInventario[]
  styles: { ticketItem: CSSProperties }
  onGenerarTicket: (ticketId: string) => Promise<void>
}) {
  const [generando, setGenerando] = useState<string | null>(null)
  const generandoRef = useRef<string | null>(null)
  const visibles = useMemo(() => {
    const ticketsVistos = new Set<string>()
    return movimientos.filter((movimiento) => {
      if (!movimiento.ticket_id) return true
      if (ticketsVistos.has(movimiento.ticket_id)) return false
      ticketsVistos.add(movimiento.ticket_id)
      return true
    })
  }, [movimientos])

  const generar = async (ticketId: string) => {
    if (generandoRef.current) return
    generandoRef.current = ticketId; setGenerando(ticketId)
    try { await onGenerarTicket(ticketId) } finally { generandoRef.current = null; setGenerando(null) }
  }

  return <><h2>Historial de movimientos</h2>{visibles.map((m) => {
    const lineasTicket = m.ticket_id ? movimientos.filter((item) => item.ticket_id === m.ticket_id) : [m]
    const esVenta = Boolean(m.ticket_id) && lineasTicket.some((item) => item.tipo_movimiento?.toLocaleLowerCase('es-MX') === 'venta')
    return <div key={m.ticket_id || m.id} style={styles.ticketItem}>
      {esVenta && <p><b>Venta {m.folio || ''}</b></p>}
      {lineasTicket.map((linea) => <div key={linea.id} className="fl-movement-line"><p><b>{linea.nombre}</b></p><p>Código: {linea.codigo}</p><p>Tipo: {linea.tipo_movimiento}</p><p>Cantidad: {linea.cantidad}</p><p>Stock anterior: {linea.stock_anterior}</p><p>Stock nuevo: {linea.stock_nuevo}</p><p>Nota: {linea.nota}</p></div>)}
      <p>Fecha: {formatearFechaHoraFastLook(m.created_at)}</p>
      {esVenta && m.ticket_id && <button type="button" className="fl-movement-ticket-button" disabled={Boolean(generando)} onClick={() => void generar(m.ticket_id!)}><ReceiptText size={17} />{generando === m.ticket_id ? 'Generando…' : 'Ticket'}</button>}
    </div>
  })}</>
}
