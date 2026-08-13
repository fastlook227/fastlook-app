import { Search, Undo2 } from 'lucide-react'
import type { TicketDevolucion } from '@/types/devoluciones'
import type { Venta } from '@/types'
import { formatearFechaHoraFastLook } from '@/utils/fechas'
import { monedaDevolucion } from '@/utils/devoluciones'

const etiquetas = { sin_devoluciones: 'Sin devoluciones', parcial: 'Devolución parcial', total: 'Devuelta totalmente' }

export default function BuscarVentaDevolucion({ busqueda, tickets, heredadas, onBusqueda, onSeleccionar }: {
  busqueda: string; tickets: TicketDevolucion[]; heredadas: Venta[]; onBusqueda: (valor: string) => void; onSeleccionar: (ticket: TicketDevolucion) => void
}) {
  return <section className="fl-return-search-panel">
    <header><div><span>1. Buscar</span><h2>Buscar venta</h2></div><Undo2 aria-hidden="true" /></header>
    <label className="fl-return-search"><Search size={19} /><input value={busqueda} onChange={(e) => onBusqueda(e.target.value)} placeholder="Folio, código o producto" /></label>
    <div className="fl-return-ticket-list">
      {tickets.length === 0 && <div className="fl-return-empty">No encontramos tickets devolvibles.</div>}
      {tickets.map((ticket) => <article key={ticket.ticketId} className="fl-return-ticket-card">
        <div><strong>{ticket.folio}</strong><small>{formatearFechaHoraFastLook(ticket.createdAt)}</small></div>
        <span className={`fl-return-status is-${ticket.estado}`}>{etiquetas[ticket.estado]}</span>
        <p>{ticket.lineas.length} producto(s) · {ticket.metodoPago}</p>
        <footer><b>{monedaDevolucion(ticket.total)}</b><button type="button" disabled={ticket.estado === 'total'} onClick={() => onSeleccionar(ticket)}>Ver venta</button></footer>
      </article>)}
      {heredadas.slice(0, 5).map((venta) => <article key={venta.id} className="fl-return-ticket-card is-legacy"><strong>Venta heredada</strong><small>{formatearFechaHoraFastLook(venta.created_at)}</small><p>{venta.nombre || venta.codigo || 'Registro anterior'} — no disponible para devolución</p></article>)}
    </div>
  </section>
}
