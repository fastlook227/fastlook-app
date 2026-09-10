'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { TicketPOS } from '@/utils/pos'
import { aCentavos, calcularCambioCentavos, efectivoSuficiente, debeAbrirCajon } from '@/utils/pos'

const moneda = (centavos: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(centavos / 100)

export function CobroEfectivoDesktop({ total, onCancelar, onCobrar }: { total: number; onCancelar: () => void; onCobrar: (recibido: number) => Promise<boolean> }) {
  const totalCentavos = aCentavos(total)
  const [valor, setValor] = useState('')
  const [procesando, setProcesando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const recibidoCentavos = aCentavos(Number(valor || 0))
  const valido = efectivoSuficiente(totalCentavos, recibidoCentavos)
  const cambio = calcularCambioCentavos(totalCentavos, recibidoCentavos)
  const rapidos = useMemo(() => [...new Set([totalCentavos, 35000, 40000, 50000, 100000].filter((monto) => monto >= totalCentavos))], [totalCentavos])
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !procesando) onCancelar() }; document.addEventListener('keydown', tecla); return () => document.removeEventListener('keydown', tecla) }, [onCancelar, procesando])
  const cobrar = async () => { if (!valido || procesando) return; setProcesando(true); const ok = await onCobrar(recibidoCentavos / 100); setProcesando(false); if (!ok) inputRef.current?.focus() }
  return <div className="fl-pos-backdrop"><form className="fl-pos-dialog" role="dialog" aria-modal="true" onSubmit={(e) => { e.preventDefault(); void cobrar() }}><header><span>FAST LOOK POS</span><h2>Cobro en efectivo</h2></header><div className="fl-pos-total"><small>TOTAL</small><strong>{moneda(totalCentavos)}</strong></div><label>¿CON CUÁNTO PAGA?<input ref={inputRef} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="$0.00" /></label><div className="fl-pos-change"><span>CAMBIO</span><strong className={cambio < 0 ? 'is-invalid' : ''}>{moneda(Math.max(0, cambio))}</strong></div><div className="fl-pos-quick">{rapidos.map((monto) => <button type="button" key={monto} onClick={() => setValor(String(monto / 100))}>{monto === totalCentavos ? 'EXACTO' : moneda(monto)}</button>)}</div><footer><button type="button" onClick={onCancelar} disabled={procesando}>Cancelar</button><button type="submit" className="is-primary" disabled={!valido || procesando}>{procesando ? 'Cobrando…' : 'Cobrar'}</button></footer></form></div>
}

export function ConfirmarImpresionDesktop({ ticket, onCerrar }: { ticket: TicketPOS; onCerrar: () => void }) {
  const [estado, setEstado] = useState<'pregunta' | 'imprimiendo' | 'error' | 'impreso' | 'cajon-error'>('pregunta')
  const imprimir = async () => {
    setEstado('imprimiendo')
    try {
      const { servicioPOSLocal } = await import('@/lib/pos/servicioPOS')
      await servicioPOSLocal.imprimirTicket(ticket)
      if (debeAbrirCajon(true, true, ticket.metodoPago)) {
        try { await servicioPOSLocal.abrirCajon() } catch { setEstado('cajon-error'); return }
      }
      setEstado('impreso')
    } catch { setEstado('error') }
  }
  return <div className="fl-pos-backdrop"><section className="fl-pos-dialog" role="dialog" aria-modal="true"><header><span>VENTA REGISTRADA</span><h2>{ticket.folio}</h2></header><div className="fl-pos-result"><p>Total <b>{moneda(aCentavos(ticket.total))}</b></p>{ticket.efectivoRecibido != null && <p>Recibido <b>{moneda(aCentavos(ticket.efectivoRecibido))}</b></p>}{ticket.cambio != null && <p>Cambio <b>{moneda(aCentavos(ticket.cambio))}</b></p>}</div>{estado === 'pregunta' && <p>¿Quieres imprimir el ticket?</p>}{estado === 'imprimiendo' && <p role="status">Enviando a la impresora USB…</p>}{estado === 'error' && <p className="fl-pos-error">No se pudo imprimir el ticket. La venta ya quedó registrada.</p>}{estado === 'impreso' && <p className="fl-pos-ok">Ticket impreso correctamente.</p>}{estado === 'cajon-error' && <p className="fl-pos-error">Ticket impreso. No se pudo abrir el cajón.</p>}<footer>{estado === 'pregunta' && <><button type="button" onClick={onCerrar}>No</button><button type="button" className="is-primary" onClick={() => void imprimir()}>Imprimir</button></>}{estado === 'error' && <><button type="button" onClick={onCerrar}>Cerrar</button><button type="button" className="is-primary" onClick={() => void imprimir()}>Reintentar</button></>}{(estado === 'impreso' || estado === 'cajon-error') && <button type="button" className="is-primary" onClick={onCerrar}>Cerrar</button>}</footer></section></div>
}
