'use client'

import { useCallback, useEffect, useState } from 'react'
import { Banknote, CircleDollarSign, PackageCheck, ReceiptText, RotateCcw, Search, TrendingUp, WalletCards } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { CorteCaja } from '@/types'
import type { PeriodoCorte, ReporteCorte } from '@/types/corte'
import { formatearFechaHoraFastLook, obtenerFechaActualFastLook, obtenerRangoPeriodoFastLook } from '@/utils/fechas'
import CorteFiltros from './CorteFiltros'
import CorteMetricCard from './CorteMetricCard'
import MetodosPagoChart from './MetodosPagoChart'
import ProductosMasVendidos from './ProductosMasVendidos'
import VentasPeriodoChart from './VentasPeriodoChart'
import LoadingOverlay from '@/components/LoadingOverlay'

const moneda = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const rango = (p: Exclude<PeriodoCorte, 'personalizado'>) => { const r = obtenerRangoPeriodoFastLook(p); return { inicio: r.inicio, fin: r.fin } }

export default function CorteCajaDashboard() {
  const hoy = rango('hoy')
  const [fechaOperativa, setFechaOperativa] = useState(obtenerFechaActualFastLook)
  const [periodo, setPeriodo] = useState<PeriodoCorte>('hoy'), [inicio, setInicio] = useState(hoy.inicio), [fin, setFin] = useState(hoy.fin)
  const [aplicado, setAplicado] = useState(hoy), [reporte, setReporte] = useState<ReporteCorte | null>(null), [cortes, setCortes] = useState<CorteCaja[]>([])
  const [error, setError] = useState(''), [cargando, setCargando] = useState(true), [busqueda, setBusqueda] = useState(''), [consulta, setConsulta] = useState(''), [pagina, setPagina] = useState(1)

  useEffect(() => { const id = window.setInterval(() => setFechaOperativa(obtenerFechaActualFastLook()), 30_000); return () => clearInterval(id) }, [])
  useEffect(() => { if (periodo === 'personalizado') return; const r = rango(periodo); setInicio(r.inicio); setFin(r.fin); setAplicado(r); setPagina(1) }, [periodo, fechaOperativa])
  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    try {
      const { data } = await supabase.auth.getSession(); const token = data.session?.access_token
      if (!token) throw new Error('Debes iniciar sesión nuevamente.')
      const params = new URLSearchParams({ inicio: aplicado.inicio, fin: aplicado.fin, pagina: String(pagina), q: consulta })
      const respuesta = await fetch(`/api/corte-caja?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const resultado = await respuesta.json() as { reporte?: ReporteCorte; cortes?: CorteCaja[]; mensaje?: string }
      if (!respuesta.ok || !resultado.reporte) throw new Error(resultado.mensaje || 'No fue posible cargar el corte.')
      setReporte(resultado.reporte); setCortes(resultado.cortes || [])
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible cargar el corte.') } finally { setCargando(false) }
  }, [aplicado, pagina, consulta])
  useEffect(() => { void cargar() }, [cargar])
  const seleccionar = (p: PeriodoCorte) => { setPeriodo(p); setError(''); if (p !== 'personalizado') { const r = rango(p); setInicio(r.inicio); setFin(r.fin); setAplicado(r); setPagina(1) } }
  const aplicar = () => { if (!inicio || !fin || inicio > fin) { setError('Selecciona un rango de fechas válido.'); return }; setAplicado({ inicio, fin }); setPagina(1) }
  const r = reporte?.resumen
  const metodo = (nombre: string) => reporte?.metodos.find((m) => m.metodo === nombre)?.neto || 0

  return <section className="fl-corte-dashboard">
    <header className="fl-corte-header"><div><span><WalletCards size={20}/>Panel financiero</span><h1>Corte de caja</h1><p>Ventas cobradas consolidadas por ticket · America/Mexico_City</p></div></header>
    <CorteFiltros periodo={periodo} fechaInicio={inicio} fechaFin={fin} error={error} actualizando={cargando} onSeleccionarPeriodo={seleccionar} onCambiarInicio={setInicio} onCambiarFin={setFin} onAplicarPersonalizado={aplicar} onActualizar={() => void cargar()} />
    {r && <>
      <div className="fl-corte-section-title"><h2>Resumen del periodo</h2><p>El total proviene de cabeceras cobradas; las categorías provienen de sus líneas.</p></div>
      <div className="fl-corte-metrics">
        <CorteMetricCard icono={CircleDollarSign} titulo="Total de ventas" valor={moneda(r.ventasBrutas)} detalle="Tickets cobrados" tono="positivo" />
        <CorteMetricCard icono={ReceiptText} titulo="Tickets" valor={String(r.numeroTickets)} detalle="Operaciones únicas" />
        <CorteMetricCard icono={PackageCheck} titulo="Productos vendidos" valor={String(r.productosVendidos)} detalle="Inventario y personalizados" />
        <CorteMetricCard icono={WalletCards} titulo="Personalizados" valor={moneda(r.ventasPersonalizadas)} detalle="Incluidos, no sumados otra vez" />
        <CorteMetricCard icono={TrendingUp} titulo="Ganancia estimada" valor={moneda(r.gananciaNeta)} detalle={reporte.ventasSinCosto ? 'Parcial: faltan costos históricos' : 'Con costos históricos'} tono={reporte.ventasSinCosto ? 'alerta' : 'positivo'} />
        <CorteMetricCard icono={Banknote} titulo="Efectivo neto" valor={moneda(metodo('Efectivo'))} detalle="Ventas menos devoluciones" />
        <CorteMetricCard icono={Banknote} titulo="Transferencia" valor={moneda(metodo('Transferencia'))} detalle="Neto del periodo" />
        <CorteMetricCard icono={Banknote} titulo="Tarjeta" valor={moneda(metodo('Tarjeta'))} detalle="Neto del periodo" />
        <CorteMetricCard icono={RotateCcw} titulo="Devoluciones" valor={`-${moneda(r.devoluciones)}`} detalle={`${r.numeroDevoluciones} operación(es)`} tono="alerta" />
      </div>
      {(reporte.ventasSinCosto > 0 || r.operacionesSinConciliar > 0) && <div className="fl-corte-warning"><strong>Revisión requerida</strong><span>{reporte.ventasSinCosto} línea(s) sin costo histórico y {r.operacionesSinConciliar} operación(es) sin ticket excluidas del total.</span></div>}
      <section className="fl-corte-breakdown"><h2>Desglose conciliado</h2><div><article><span>Inventario</span><strong>{moneda(r.ventasInventario)}</strong></article><article><span>Personalizados</span><strong>{moneda(r.ventasPersonalizadas)}</strong></article><article><span>Ajustes del ticket</span><strong>{moneda(r.ajustesTicket)}</strong></article><article className="is-total"><span>Total general</span><strong>{moneda(r.ventasBrutas)}</strong></article><article><span>Devoluciones</span><strong>-{moneda(r.devoluciones)}</strong></article><article className="is-total"><span>Total neto</span><strong>{moneda(r.ventasNetas)}</strong></article></div><small>Inventario + personalizados + ajustes del ticket = total cobrado. Los abonos ({moneda(r.totalAjustes)}) se muestran como ajustes y no como venta de productos.</small></section>
      <div className="fl-corte-grid"><VentasPeriodoChart datos={reporte.ventasAgrupadas}/><MetodosPagoChart datos={reporte.metodos}/><ProductosMasVendidos productos={reporte.productos}/></div>
      <section className="fl-corte-tickets"><div className="fl-corte-panel-heading"><div><h2>Historial de tickets</h2><p>{reporte.totalTicketsFiltrados} resultado(s), 25 por página.</p></div><form onSubmit={(e)=>{e.preventDefault();setConsulta(busqueda);setPagina(1)}}><Search size={17}/><input value={busqueda} onChange={(e)=>setBusqueda(e.target.value)} placeholder="Folio, producto o método"/><button>Buscar</button></form></div>
        <div className="fl-corte-ticket-list">{reporte.tickets.map((t)=><details key={t.ticketId}><summary><span><b>{t.folio}</b><small>{formatearFechaHoraFastLook(t.createdAt)} · {t.metodoPago} · {t.estado}</small></span><strong>{moneda(t.total)}</strong></summary><div>{t.lineasNormales.map(l=><p key={`n-${l.id}`}><span>{l.cantidad} × {l.nombre}</span><b>{moneda(l.total)}</b></p>)}{t.lineasPersonalizadas.map(l=><p key={`p-${l.id}`} className="is-custom"><span>{l.cantidad} × {l.nombre} <em>Personalizado</em></span><b>{moneda(l.total)}</b></p>)}</div></details>)}</div>
        <footer><button disabled={pagina<=1||cargando} onClick={()=>setPagina(p=>p-1)}>Anterior</button><span>Página {reporte.pagina} de {reporte.paginas}</span><button disabled={pagina>=reporte.paginas||cargando} onClick={()=>setPagina(p=>p+1)}>Siguiente</button></footer>
      </section>
      {reporte.conciliacion.length > 0 && <section className="fl-corte-reconcile"><h2>Operaciones fuera de tickets</h2><p>No se agregan automáticamente al total para evitar duplicaciones.</p>{reporte.conciliacion.map(o=><article key={o.id}><span>{o.concepto}<small>{formatearFechaHoraFastLook(o.createdAt)} · {o.tipo === 'ajuste' ? 'Ajuste/abono' : 'Pendiente de conciliación'}</small></span><strong>{moneda(o.total)}</strong></article>)}</section>}
    </>}
    <section className="fl-corte-history"><div className="fl-corte-panel-heading"><div><h2>Resúmenes diarios</h2><p>Snapshots automáticos; no equivalen a un cierre contable definitivo.</p></div></div>{cortes.length===0?<p className="fl-corte-history-empty">Aún no hay resúmenes guardados.</p>:<div>{cortes.map(c=><article key={c.id}><strong>{c.fecha_inicio} — {c.fecha_fin}</strong><span>Neto {moneda(Number(c.ventas_netas ?? c.total ?? 0))}</span><small>{Number(c.numero_tickets||0)} tickets · generado {c.created_at?formatearFechaHoraFastLook(c.created_at):'sin fecha'}</small></article>)}</div>}</section>
    <LoadingOverlay visible={cargando} titulo="Calculando corte de caja…" detalle="Conciliando tickets, productos personalizados y devoluciones."/>
  </section>
}
