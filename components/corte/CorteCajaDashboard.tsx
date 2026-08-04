'use client'

import { useMemo, useState, useTransition } from 'react'
import { Calculator, CircleDollarSign, PackageCheck, ReceiptText, TrendingUp, Trophy, WalletCards } from 'lucide-react'
import type { CorteCaja, Producto, Venta } from '@/types'
import type { PeriodoCorte } from '@/types/corte'
import { obtenerFechaLocal } from '@/utils/fechas'
import { calcularDatosCorte, filtrarVentasCorte } from '@/utils/corte'
import LoadingOverlay from '@/components/LoadingOverlay'
import CorteFiltros from '@/components/corte/CorteFiltros'
import CorteMetricCard from '@/components/corte/CorteMetricCard'
import MetodosPagoChart from '@/components/corte/MetodosPagoChart'
import ProductosMasVendidos from '@/components/corte/ProductosMasVendidos'
import VentasPeriodoChart from '@/components/corte/VentasPeriodoChart'

interface CorteCajaDashboardProps {
  ventas: Venta[]
  productos: Producto[]
  cortes: CorteCaja[]
  onActualizar: () => Promise<void>
}

const moneda = (valor: number) => `$${valor.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fechaLocal = (fecha: Date) => obtenerFechaLocal(fecha)
const moverDias = (fecha: Date, dias: number) => {
  const resultado = new Date(fecha)
  resultado.setDate(resultado.getDate() + dias)
  return resultado
}

const rangoPeriodo = (periodo: Exclude<PeriodoCorte, 'personalizado'>) => {
  const ahora = new Date()
  const hoy = fechaLocal(ahora)
  if (periodo === 'ayer') {
    const ayer = fechaLocal(moverDias(ahora, -1))
    return { inicio: ayer, fin: ayer }
  }
  if (periodo === 'ultimos7') return { inicio: fechaLocal(moverDias(ahora, -6)), fin: hoy }
  if (periodo === 'mesActual') return {
    inicio: fechaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), 1)),
    fin: hoy,
  }
  if (periodo === 'mesAnterior') return {
    inicio: fechaLocal(new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)),
    fin: fechaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), 0)),
  }
  return { inicio: hoy, fin: hoy }
}

export default function CorteCajaDashboard({ ventas, productos, cortes, onActualizar }: CorteCajaDashboardProps) {
  const rangoHoy = rangoPeriodo('hoy')
  const [periodo, setPeriodo] = useState<PeriodoCorte>('hoy')
  const [fechaInicio, setFechaInicio] = useState(rangoHoy.inicio)
  const [fechaFin, setFechaFin] = useState(rangoHoy.fin)
  const [fechaInicioAplicada, setFechaInicioAplicada] = useState(rangoHoy.inicio)
  const [fechaFinAplicada, setFechaFinAplicada] = useState(rangoHoy.fin)
  const [error, setError] = useState('')
  const [actualizando, setActualizando] = useState(false)
  const [analizando, iniciarTransicion] = useTransition()

  const ventasPeriodo = useMemo(
    () => filtrarVentasCorte(ventas, fechaInicioAplicada, fechaFinAplicada),
    [ventas, fechaInicioAplicada, fechaFinAplicada]
  )
  const datos = useMemo(
    () => calcularDatosCorte(ventasPeriodo, productos, fechaInicioAplicada, fechaFinAplicada),
    [ventasPeriodo, productos, fechaInicioAplicada, fechaFinAplicada]
  )
  const productoPrincipal = datos.productos[0]

  const seleccionarPeriodo = (nuevoPeriodo: PeriodoCorte) => {
    setPeriodo(nuevoPeriodo)
    setError('')
    if (nuevoPeriodo === 'personalizado') return
    const rango = rangoPeriodo(nuevoPeriodo)
    setFechaInicio(rango.inicio)
    setFechaFin(rango.fin)
    iniciarTransicion(() => {
      setFechaInicioAplicada(rango.inicio)
      setFechaFinAplicada(rango.fin)
    })
  }

  const aplicarPersonalizado = () => {
    if (!fechaInicio || !fechaFin) {
      setError('Selecciona una fecha inicial y una fecha final.')
      return
    }
    if (fechaInicio > fechaFin) {
      setError('La fecha inicial no puede ser posterior a la fecha final.')
      return
    }
    setError('')
    iniciarTransicion(() => {
      setFechaInicioAplicada(fechaInicio)
      setFechaFinAplicada(fechaFin)
    })
  }

  const actualizar = async () => {
    setActualizando(true)
    setError('')
    try {
      await onActualizar()
    } catch (errorActualizacion) {
      setError(errorActualizacion instanceof Error ? errorActualizacion.message : 'No fue posible actualizar la información del corte.')
    } finally {
      setActualizando(false)
    }
  }

  return (
    <section className="fl-corte-dashboard">
      <header className="fl-corte-header">
        <div><span><WalletCards size={20} aria-hidden="true" />Panel financiero</span><h1>Corte de caja</h1><p>{periodo === 'hoy' ? 'Resumen financiero del día' : 'Resultados del periodo seleccionado'}</p></div>
      </header>

      <CorteFiltros
        periodo={periodo}
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
        error={error}
        actualizando={actualizando || analizando}
        onSeleccionarPeriodo={seleccionarPeriodo}
        onCambiarInicio={setFechaInicio}
        onCambiarFin={setFechaFin}
        onAplicarPersonalizado={aplicarPersonalizado}
        onActualizar={() => void actualizar()}
      />

      <div className="fl-corte-metrics">
        <CorteMetricCard icono={CircleDollarSign} titulo="Total vendido" valor={moneda(datos.resumen.totalVendido)} detalle={`${datos.resumen.numeroVentas} registros`} tono="positivo" tooltip="Suma del campo total de las ventas del periodo." />
        <CorteMetricCard icono={TrendingUp} titulo="Ganancia estimada" valor={moneda(datos.resumen.ganancia)} detalle={datos.productosSinCosto ? 'Puede ser imprecisa' : 'Costos registrados'} tono={datos.productosSinCosto ? 'alerta' : 'positivo'} tooltip="Precio menos costo por la cantidad vendida, usando el cálculo existente." />
        <CorteMetricCard icono={ReceiptText} titulo="Número de ventas" valor={String(datos.resumen.numeroVentas)} detalle="Registros del periodo" tooltip="Cantidad de registros en ventas, igual que el resumen existente." />
        <CorteMetricCard icono={PackageCheck} titulo="Productos vendidos" valor={String(datos.resumen.productosVendidos)} detalle="No incluye abonos" tooltip="Suma de cantidades vendidas, excluyendo registros con código ABONO." />
        <CorteMetricCard icono={Calculator} titulo="Ticket promedio" valor={moneda(datos.resumen.ticketPromedio)} detalle="Total entre ventas" tooltip="Total vendido dividido entre número de ventas; si no hay ventas muestra cero." />
        <CorteMetricCard icono={Trophy} titulo="Producto más vendido" valor={productoPrincipal?.nombre || 'Sin ventas'} detalle={productoPrincipal ? `${productoPrincipal.cantidad} piezas · ${moneda(productoPrincipal.total)}` : 'Sin ventas en este periodo'} tooltip="Producto con mayor cantidad acumulada en el periodo." />
      </div>

      {datos.productosSinCosto > 0 && (
        <div className="fl-corte-warning" role="status"><strong>Ganancia estimada</strong><span>Algunos productos no tienen costo registrado; la ganancia puede ser imprecisa. Productos vendidos sin costo: {datos.productosSinCosto}.</span></div>
      )}

      {ventasPeriodo.length === 0 ? (
        <div className="fl-corte-empty"><ReceiptText size={34} aria-hidden="true" /><h2>No hay ventas registradas en este periodo.</h2><p>{fechaInicioAplicada} — {fechaFinAplicada}</p>{periodo !== 'hoy' && <button type="button" onClick={() => seleccionarPeriodo('hoy')}>Ver ventas de hoy</button>}</div>
      ) : (
        <div className="fl-corte-grid">
          <VentasPeriodoChart datos={datos.ventasAgrupadas} />
          <MetodosPagoChart datos={datos.metodos} />
          <ProductosMasVendidos productos={datos.productos} />
        </div>
      )}

      <section className="fl-corte-history">
        <div className="fl-corte-panel-heading"><div><h2>Historial de cortes</h2><p>Registros existentes en Supabase, sin modificaciones.</p></div></div>
        {cortes.length === 0 ? <p className="fl-corte-history-empty">Aún no hay cortes guardados.</p> : <div>{cortes.map((corte) => <article key={corte.id}><strong>{corte.fecha_inicio} — {corte.fecha_fin}</strong><span>Total {moneda(Number(corte.total || 0))}</span><span>Ganancia {moneda(Number(corte.ganancia || 0))}</span><small>Efectivo {moneda(Number(corte.efectivo || 0))} · Transferencia {moneda(Number(corte.transferencia || 0))} · Tarjeta {moneda(Number(corte.tarjeta || 0))}</small></article>)}</div>}
      </section>

      <LoadingOverlay
        visible={actualizando || analizando}
        titulo={actualizando ? 'Cargando información del corte…' : 'Analizando el periodo seleccionado…'}
        detalle={actualizando ? 'Actualizando ventas, productos y cortes registrados.' : 'Preparando métricas y gráficas del periodo.'}
      />
    </section>
  )
}
