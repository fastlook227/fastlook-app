import { X } from 'lucide-react'
import type { MotivoDevolucion, TicketDevolucion } from '@/types/devoluciones'
import { monedaDevolucion } from '@/utils/devoluciones'

export default function ConfirmarDevolucion({ ticket, cantidades, motivo, motivoOtro, procesando, onVolver, onConfirmar }: {
  ticket: TicketDevolucion; cantidades: Record<string, number>; motivo: MotivoDevolucion; motivoOtro: string; procesando: boolean; onVolver: () => void; onConfirmar: () => void
}) {
  const lineas = ticket.lineas.filter((linea) => (cantidades[linea.id] || 0) > 0)
  const total = lineas.reduce((suma, linea) => suma + Number(linea.precio || 0) * cantidades[linea.id], 0)
  return <div className="fl-return-modal-backdrop" role="presentation"><section className="fl-return-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-confirmar-devolucion">
    <header><div><span>3. Confirmar</span><h2 id="titulo-confirmar-devolucion">Confirmar devolución</h2></div><button type="button" onClick={onVolver} aria-label="Cerrar"><X /></button></header>
    <div className="fl-return-confirm-meta"><span>Folio <b>{ticket.folio}</b></span><span>Método original <b>{ticket.metodoPago}</b></span><span>Motivo <b>{motivo === 'Otro' ? motivoOtro : motivo}</b></span></div>
    <div className="fl-return-confirm-lines">{lineas.map((linea) => <div key={linea.id}><span><b>{linea.nombre}</b><small>{cantidades[linea.id]} × {monedaDevolucion(Number(linea.precio || 0))}</small></span><strong>{monedaDevolucion(cantidades[linea.id] * Number(linea.precio || 0))}</strong></div>)}</div>
    <div className="fl-return-confirm-total"><span>Total a devolver</span><strong>{monedaDevolucion(total)}</strong></div>
    <footer><button type="button" onClick={onVolver} disabled={procesando}>Volver</button><button type="button" className="is-primary" onClick={onConfirmar} disabled={procesando}>Confirmar devolución</button></footer>
  </section></div>
}
