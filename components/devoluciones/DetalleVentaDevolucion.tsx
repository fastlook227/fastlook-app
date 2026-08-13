import { ArrowLeft, Minus, Plus } from 'lucide-react'
import type { TicketDevolucion } from '@/types/devoluciones'
import { formatearFechaHoraFastLook } from '@/utils/fechas'
import { monedaDevolucion } from '@/utils/devoluciones'

export default function DetalleVentaDevolucion({ ticket, cantidades, onCantidad, onVolver, onContinuar }: {
  ticket: TicketDevolucion; cantidades: Record<string, number>; onCantidad: (id: string, cantidad: number) => void; onVolver: () => void; onContinuar: () => void
}) {
  const seleccionadas = ticket.lineas.filter((linea) => (cantidades[linea.id] || 0) > 0)
  const piezas = seleccionadas.reduce((total, linea) => total + cantidades[linea.id], 0)
  const total = seleccionadas.reduce((suma, linea) => suma + Number(linea.precio || 0) * cantidades[linea.id], 0)
  return <section className="fl-return-detail-panel">
    <header><button type="button" onClick={onVolver} aria-label="Volver a buscar"><ArrowLeft /></button><div><span>2. Productos</span><h2>{ticket.folio}</h2><p>{formatearFechaHoraFastLook(ticket.createdAt)} · {ticket.metodoPago} · {monedaDevolucion(ticket.total)}</p></div></header>
    <div className="fl-return-lines">{ticket.lineas.map((linea) => {
      const actual = cantidades[linea.id] || 0
      return <article key={linea.id} className={linea.disponibles === 0 ? 'is-complete' : ''}>
        <div><strong>{linea.nombre || 'Producto'}</strong><small>Código: {linea.codigo || 'Sin código'}</small><span>Precio original: {monedaDevolucion(Number(linea.precio || 0))}</span></div>
        <dl><div><dt>Vendidas</dt><dd>{Number(linea.cantidad || 0)}</dd></div><div><dt>Devueltas</dt><dd>{linea.devueltas}</dd></div><div><dt>Disponibles</dt><dd>{linea.disponibles}</dd></div></dl>
        {linea.disponibles === 0 ? <em>Devuelto completamente</em> : <div className="fl-return-quantity"><button type="button" disabled={actual <= 0} onClick={() => onCantidad(linea.id, actual - 1)}><Minus /></button><input aria-label={`Cantidad de ${linea.nombre}`} type="number" min={0} max={linea.disponibles} step={1} value={actual} onChange={(e) => onCantidad(linea.id, Number(e.target.value))} /><button type="button" disabled={actual >= linea.disponibles} onClick={() => onCantidad(linea.id, actual + 1)}><Plus /></button></div>}
      </article>
    })}</div>
    <div className="fl-return-summary"><span>Productos seleccionados <b>{seleccionadas.length}</b></span><span>Piezas a devolver <b>{piezas}</b></span><span>Total a devolver <strong>{monedaDevolucion(total)}</strong></span></div>
    <button className="fl-return-primary" type="button" disabled={piezas === 0} onClick={onContinuar}>Continuar</button>
  </section>
}
