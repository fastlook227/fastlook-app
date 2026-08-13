'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Calculator, CircleDollarSign, PackageCheck, ReceiptText, RotateCcw, TrendingDown, TrendingUp, WalletCards } from 'lucide-react'
import type { CorteCaja, Venta } from '@/types'
import type { Devolucion, DevolucionDetalle } from '@/types/devoluciones'
import type { PeriodoCorte } from '@/types/corte'
import { formatearFechaHoraFastLook, obtenerFechaActualFastLook, obtenerRangoPeriodoFastLook } from '@/utils/fechas'
import { calcularDatosCorte, filtrarDevolucionesCorte, filtrarVentasCorte } from '@/utils/corte'
import LoadingOverlay from '@/components/LoadingOverlay'
import CorteFiltros from '@/components/corte/CorteFiltros'
import CorteMetricCard from '@/components/corte/CorteMetricCard'
import MetodosPagoChart from '@/components/corte/MetodosPagoChart'
import ProductosMasVendidos from '@/components/corte/ProductosMasVendidos'
import VentasPeriodoChart from '@/components/corte/VentasPeriodoChart'

interface CorteCajaDashboardProps {
  ventas: Venta[]
  devoluciones: Devolucion[]
  devolucionesDetalle: DevolucionDetalle[]
  cortes: CorteCaja[]
  onActualizar: () => Promise<void>
}

const moneda = (valor: number) => `$${valor.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const rangoPeriodo = (periodo: Exclude<PeriodoCorte, 'personalizado'>) => { const { inicio, fin } = obtenerRangoPeriodoFastLook(periodo); return { inicio, fin } }

export default function CorteCajaDashboard({ ventas, devoluciones, devolucionesDetalle, cortes, onActualizar }: CorteCajaDashboardProps) {
  const rangoHoy = rangoPeriodo('hoy')
  const [fechaOperativa, setFechaOperativa] = useState(obtenerFechaActualFastLook)
  const [periodo, setPeriodo] = useState<PeriodoCorte>('hoy')
  const [fechaInicio, setFechaInicio] = useState(rangoHoy.inicio)
  const [fechaFin, setFechaFin] = useState(rangoHoy.fin)
  const [fechaInicioAplicada, setFechaInicioAplicada] = useState(rangoHoy.inicio)
  const [fechaFinAplicada, setFechaFinAplicada] = useState(rangoHoy.fin)
  const [error, setError] = useState('')
  const [actualizando, setActualizando] = useState(false)
  const [analizando, iniciarTransicion] = useTransition()

  useEffect(() => { const temporizador = window.setInterval(() => setFechaOperativa(obtenerFechaActualFastLook()), 30_000); return () => window.clearInterval(temporizador) }, [])
  useEffect(() => {
    if (periodo === 'personalizado') return
    const rango = rangoPeriodo(periodo)
    setFechaInicio(rango.inicio); setFechaFin(rango.fin); setFechaInicioAplicada(rango.inicio); setFechaFinAplicada(rango.fin)
  }, [fechaOperativa, periodo])

  const ventasPeriodo = useMemo(() => filtrarVentasCorte(ventas, fechaInicioAplicada, fechaFinAplicada), [ventas, fechaInicioAplicada, fechaFinAplicada])
  const devolucionesPeriodo = useMemo(() => filtrarDevolucionesCorte(devoluciones, fechaInicioAplicada, fechaFinAplicada), [devoluciones, fechaInicioAplicada, fechaFinAplicada])
  const datos = useMemo(() => calcularDatosCorte(ventasPeriodo, devolucionesPeriodo, devolucionesDetalle, fechaInicioAplicada, fechaFinAplicada), [ventasPeriodo, devolucionesPeriodo, devolucionesDetalle, fechaInicioAplicada, fechaFinAplicada])

  const seleccionarPeriodo = (nuevoPeriodo: PeriodoCorte) => {
    setPeriodo(nuevoPeriodo); setError('')
    if (nuevoPeriodo === 'personalizado') return
    const rango = rangoPeriodo(nuevoPeriodo)
    setFechaInicio(rango.inicio); setFechaFin(rango.fin)
    iniciarTransicion(() => { setFechaInicioAplicada(rango.inicio); setFechaFinAplicada(rango.fin) })
  }
  const aplicarPersonalizado = () => {
    if (!fechaInicio || !fechaFin) { setError('Selecciona una fecha inicial y una fecha final.'); return }
    if (fechaInicio > fechaFin) { setError('La fecha inicial no puede ser posterior a la fecha final.'); return }
    setError(''); iniciarTransicion(() => { setFechaInicioAplicada(fechaInicio); setFechaFinAplicada(fechaFin) })
  }
  const actualizar = async () => {
    setActualizando(true); setError('')
    try { await onActualizar() } catch (causa) { setError(causa instanceof Error ? causa.message : 'No fue posible actualizar la información del corte.') } finally { setActualizando(false) }
  }

  return <section className="fl-corte-dashboard">
    <header className="fl-corte-header"><div><span><WalletCards size={20} />Panel financiero</span><h1>Corte de caja</h1><p>{periodo === 'hoy' ? 'Resumen financiero del día' : 'Resultados del periodo seleccionado'}</p></div></header>
    <CorteFiltros periodo={periodo} fechaInicio={fechaInicio} fechaFin={fechaFin} error={error} actualizando={actualizando || analizando} onSeleccionarPeriodo={seleccionarPeriodo} onCambiarInicio={setFechaInicio} onCambiarFin={setFechaFin} onAplicarPersonalizado={aplicarPersonalizado} onActualizar={() => void actualizar()} />

    <div className="fl-corte-metrics">
      <CorteMetricCard icono={CircleDollarSign} titulo="Ventas brutas" valor={moneda(datos.resumen.ventasBrutas)} detalle="Productos vendidos" tono="positivo" tooltip="Suma de líneas de productos; excluye abonos." />
      <CorteMetricCard icono={RotateCcw} titulo="Devoluciones" valor={`-${moneda(datos.resumen.devoluciones)}`} detalle={`${datos.resumen.numeroDevoluciones} devolución(es)`} tono="alerta" tooltip="Devoluciones procesadas en el periodo." />
      <CorteMetricCard icono={TrendingDown} titulo="Ventas netas" valor={moneda(datos.resumen.ventasNetas)} detalle="Brutas menos devoluciones" tono={datos.resumen.ventasNetas < 0 ? 'alerta' : 'positivo'} tooltip="Ventas brutas menos devoluciones." />
      <CorteMetricCard icono={TrendingUp} titulo="Ganancia bruta estimada" valor={moneda(datos.resumen.gananciaBruta)} detalle={datos.ventasSinCosto ? 'Cálculo parcial' : 'Costo histórico'} tono={datos.ventasSinCosto ? 'alerta' : 'positivo'} tooltip="Precio histórico menos costo histórico por cantidad." />
      <CorteMetricCard icono={RotateCcw} titulo="Utilidad revertida" valor={`-${moneda(datos.resumen.utilidadRevertida)}`} detalle={datos.devolucionesSinUtilidad ? 'Cálculo parcial' : 'Devoluciones del periodo'} tono={datos.devolucionesSinUtilidad ? 'alerta' : 'neutro'} tooltip="Utilidad histórica revertida por devoluciones." />
      <CorteMetricCard icono={TrendingUp} titulo="Ganancia neta estimada" valor={moneda(datos.resumen.gananciaNeta)} detalle="Bruta menos revertida" tono={datos.ventasSinCosto || datos.devolucionesSinUtilidad ? 'alerta' : 'positivo'} tooltip="Ganancia bruta disponible menos utilidad revertida disponible." />
      <CorteMetricCard icono={ReceiptText} titulo="Número de tickets" valor={String(datos.resumen.numeroTickets)} detalle="ticket_id únicos" tooltip="Excluye abonos y ventas heredadas sin ticket_id." />
      <CorteMetricCard icono={Calculator} titulo="Ticket promedio neto" valor={moneda(datos.resumen.ticketPromedioNeto)} detalle="Ventas netas entre tickets" tooltip="Muestra cero si no existen tickets." />
    </div>

    {(datos.ventasSinCosto > 0 || datos.devolucionesSinUtilidad > 0) && <div className="fl-corte-warning" role="status"><strong>Ganancia parcial</strong><span>Se excluyeron {datos.ventasSinCosto} línea(s) sin costo histórico y {datos.devolucionesSinUtilidad} devolución(es) sin utilidad revertida. No se usó el costo actual.</span></div>}
    <div className="fl-corte-return-summary"><article><RotateCcw /><span>Devoluciones del periodo<strong>{datos.resumen.numeroDevoluciones}</strong></span></article><article><PackageCheck /><span>Productos devueltos<strong>{datos.resumen.productosDevueltos}</strong></span></article><article><CircleDollarSign /><span>Total devuelto<strong>-{moneda(datos.resumen.devoluciones)}</strong></span></article></div>

    {ventasPeriodo.length === 0 && devolucionesPeriodo.length === 0
      ? <div className="fl-corte-empty"><ReceiptText size={34} /><h2>No hay ventas ni devoluciones en este periodo.</h2><p>{fechaInicioAplicada} — {fechaFinAplicada}</p>{periodo !== 'hoy' && <button type="button" onClick={() => seleccionarPeriodo('hoy')}>Ver hoy</button>}</div>
      : <div className="fl-corte-grid"><VentasPeriodoChart datos={datos.ventasAgrupadas} /><MetodosPagoChart datos={datos.metodos} /><ProductosMasVendidos productos={datos.productos} /></div>}

    <section className="fl-corte-history"><div className="fl-corte-panel-heading"><div><h2>Historial de cortes</h2><p>Snapshots financieros guardados en Supabase.</p></div></div>
      {cortes.length === 0 ? <p className="fl-corte-history-empty">Aún no hay cortes guardados.</p> : <div>{cortes.map((corte) => {
        const tieneDesglose = corte.ventas_brutas !== null && corte.ventas_brutas !== undefined
        return <article key={corte.id}><strong>{corte.fecha_inicio} — {corte.fecha_fin}</strong>{corte.created_at && <small>Generado: {formatearFechaHoraFastLook(corte.created_at)}</small>}{tieneDesglose ? <><span>Brutas {moneda(Number(corte.ventas_brutas))} · Devoluciones -{moneda(Number(corte.total_devoluciones))}</span><span>Netas {moneda(Number(corte.ventas_netas))} · Ganancia neta {moneda(Number(corte.ganancia_neta))}</span><small>{corte.numero_tickets} ticket(s) · {corte.numero_devoluciones} devolución(es) · {Number(corte.productos_devueltos || 0)} productos devueltos</small><small>Efectivo {moneda(Number(corte.efectivo_neto))} · Transferencia {moneda(Number(corte.transferencia_neta))} · Tarjeta {moneda(Number(corte.tarjeta_neta))}</small></> : <><span>Total {moneda(Number(corte.total || 0))}</span><span>Ganancia {moneda(Number(corte.ganancia || 0))}</span><small>Desglose no disponible</small></>}</article>
      })}</div>}
    </section>
    <LoadingOverlay visible={actualizando || analizando} titulo={actualizando ? 'Cargando información del corte…' : 'Analizando el periodo seleccionado…'} detalle={actualizando ? 'Actualizando ventas, devoluciones y cortes registrados.' : 'Preparando métricas y gráficas del periodo.'} />
  </section>
}
