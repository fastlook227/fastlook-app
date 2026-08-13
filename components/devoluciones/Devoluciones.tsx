'use client'

import { CheckCircle2, History, RotateCcw, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Venta } from '@/types'
import type { Devolucion, DevolucionDetalle, MotivoDevolucion, PeriodoDevoluciones, ResultadoDevolucion, TicketDevolucion } from '@/types/devoluciones'
import { supabase } from '@/lib/supabase'
import { agruparVentasPorTicket, esErrorCantidadExcedida, filtrarTicketsDevolucion, mensajeErrorDevolucion, monedaDevolucion } from '@/utils/devoluciones'
import { obtenerFechaActualFastLook, obtenerRangoPeriodoFastLook } from '@/utils/fechas'
import LoadingOverlay from '@/components/LoadingOverlay'
import BuscarVentaDevolucion from '@/components/devoluciones/BuscarVentaDevolucion'
import DetalleVentaDevolucion from '@/components/devoluciones/DetalleVentaDevolucion'
import ConfirmarDevolucion from '@/components/devoluciones/ConfirmarDevolucion'
import HistorialDevoluciones from '@/components/devoluciones/HistorialDevoluciones'

const motivos: MotivoDevolucion[] = ['Producto incorrecto', 'No le quedó', 'Defecto', 'Cambio de opinión', 'Cambio por otro producto', 'Otro']

export default function Devoluciones({ ventas, devoluciones, detalles, onActualizarDatos }: { ventas: Venta[]; devoluciones: Devolucion[]; detalles: DevolucionDetalle[]; onActualizarDatos: () => Promise<void> }) {
  const [vista, setVista] = useState<'buscar' | 'historial'>('buscar')
  const [busqueda, setBusqueda] = useState('')
  const [ticketSeleccionado, setTicketSeleccionado] = useState<TicketDevolucion | null>(null)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [motivo, setMotivo] = useState<MotivoDevolucion>('Producto incorrecto')
  const [motivoOtro, setMotivoOtro] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<ResultadoDevolucion | null>(null)
  const idempotencyKeyRef = useRef<string | null>(null)
  const [periodo, setPeriodo] = useState<PeriodoDevoluciones>('hoy')
  const rangoInicial = obtenerRangoPeriodoFastLook('ultimos7')
  const [fechaInicio, setFechaInicio] = useState(rangoInicial.inicio)
  const [fechaFin, setFechaFin] = useState(obtenerFechaActualFastLook())

  const actualizarDatos = async () => {
    setCargando(true)
    try {
      await onActualizarDatos()
      setError('')
      return true
    } catch {
      setError('No fue posible cargar la información de devoluciones.')
      return false
    } finally {
      setCargando(false)
    }
  }

  const agrupadas = useMemo(() => agruparVentasPorTicket(ventas, detalles), [ventas, detalles])
  const ticketsVisibles = useMemo(() => filtrarTicketsDevolucion(agrupadas.tickets, busqueda), [agrupadas.tickets, busqueda])

  useEffect(() => {
    if (!ticketSeleccionado) return
    const actualizado = agrupadas.tickets.find((ticket) => ticket.ticketId === ticketSeleccionado.ticketId)
    if (actualizado) setTicketSeleccionado(actualizado)
  }, [agrupadas.tickets, ticketSeleccionado?.ticketId])

  const seleccionarTicket = (ticket: TicketDevolucion) => {
    setTicketSeleccionado(ticket)
    setCantidades({})
    setResultado(null)
    setError('')
    idempotencyKeyRef.current = null
  }

  const cambiarCantidad = (ventaId: string, valor: number) => {
    const linea = ticketSeleccionado?.lineas.find((item) => item.id === ventaId)
    if (!linea) return
    const segura = Number.isInteger(valor) ? Math.max(0, Math.min(linea.disponibles, valor)) : 0
    setCantidades((actual) => ({ ...actual, [ventaId]: segura }))
    idempotencyKeyRef.current = null
  }

  const abrirConfirmacion = () => {
    if (motivo === 'Otro' && !motivoOtro.trim()) { setError('Especifica el motivo de la devolución.'); return }
    setError('')
    setConfirmando(true)
  }

  const procesar = async () => {
    if (!ticketSeleccionado || procesando) return
    const lineas = ticketSeleccionado.lineas.filter((linea) => (cantidades[linea.id] || 0) > 0).map((linea) => ({ venta_id: String(linea.id), cantidad: cantidades[linea.id] }))
    if (!lineas.length) return
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID()
    setProcesando(true)
    setError('')
    try {
      const { data, error: errorRpc } = await supabase.rpc('procesar_devolucion', {
        p_idempotency_key: idempotencyKeyRef.current,
        p_motivo: motivo,
        p_motivo_otro: motivo === 'Otro' ? motivoOtro.trim() : null,
        p_lineas: lineas,
      })
      if (errorRpc) throw errorRpc
      const respuesta = data as ResultadoDevolucion
      if (!respuesta?.ok) throw new Error('La devolución no fue confirmada.')
      setResultado(respuesta)
      setConfirmando(false)
      idempotencyKeyRef.current = null
      await onActualizarDatos()
    } catch (causa) {
      const mensaje = causa && typeof causa === 'object' && 'message' in causa
        ? String(causa.message)
        : String(causa)
      setError(mensajeErrorDevolucion(mensaje))
      setConfirmando(false)
      if (esErrorCantidadExcedida(mensaje)) await onActualizarDatos()
    } finally {
      setProcesando(false)
    }
  }

  const nuevaDevolucion = () => {
    setResultado(null); setTicketSeleccionado(null); setCantidades({}); setMotivo('Producto incorrecto'); setMotivoOtro(''); setError(''); setVista('buscar'); idempotencyKeyRef.current = null
  }

  return <div className="fl-returns">
    <LoadingOverlay visible={procesando} titulo="Procesando devolución…" detalle="Validando venta, cantidades e inventario." />
    <header className="fl-returns-heading"><div><span>FAST LOOK · OPERACIONES</span><h1>Devoluciones</h1><p>Localiza el ticket original y devuelve únicamente las piezas seleccionadas.</p></div><RotateCcw /></header>
    <nav className="fl-return-tabs" aria-label="Vistas de devoluciones"><button type="button" className={vista === 'buscar' ? 'is-active' : ''} onClick={() => setVista('buscar')}><Search />Nueva devolución</button><button type="button" className={vista === 'historial' ? 'is-active' : ''} onClick={() => setVista('historial')}><History />Historial</button></nav>
    {error && <div className="fl-return-error" role="alert">{error}</div>}
    {vista === 'historial' ? <HistorialDevoluciones devoluciones={devoluciones} detalles={detalles} periodo={periodo} fechaInicio={fechaInicio} fechaFin={fechaFin} cargando={cargando} onPeriodo={setPeriodo} onInicio={setFechaInicio} onFin={setFechaFin} onActualizar={() => void actualizarDatos()} /> : resultado ? <section className="fl-return-result"><CheckCircle2 /><span>4. Resultado</span><h2>Devolución registrada</h2><p>Folio <b>{resultado.folio}</b></p><p>Total devuelto <strong>{monedaDevolucion(Number(resultado.total_devuelto))}</strong></p><p>Productos <b>{resultado.productos}</b></p><div><button type="button" onClick={nuevaDevolucion}>Nueva devolución</button><button type="button" onClick={() => setVista('historial')}>Ver historial</button></div></section> : <div className={`fl-return-workspace${ticketSeleccionado ? ' has-selection' : ''}`}><BuscarVentaDevolucion busqueda={busqueda} tickets={ticketsVisibles} heredadas={busqueda ? [] : agrupadas.heredadas} onBusqueda={setBusqueda} onSeleccionar={seleccionarTicket} />{ticketSeleccionado ? <div><DetalleVentaDevolucion ticket={ticketSeleccionado} cantidades={cantidades} onCantidad={cambiarCantidad} onVolver={() => { setTicketSeleccionado(null); setCantidades({}); idempotencyKeyRef.current = null }} onContinuar={abrirConfirmacion} /><div className="fl-return-reason"><label>Motivo<select value={motivo} onChange={(e) => { setMotivo(e.target.value as MotivoDevolucion); idempotencyKeyRef.current = null }}>{motivos.map((item) => <option key={item}>{item}</option>)}</select></label>{motivo === 'Otro' && <label>Especifica el motivo<input value={motivoOtro} onChange={(e) => { setMotivoOtro(e.target.value); idempotencyKeyRef.current = null }} maxLength={250} /></label>}</div></div> : <div className="fl-return-placeholder"><RotateCcw /><h2>Selecciona una venta</h2><p>Aquí aparecerán sus productos y cantidades disponibles.</p></div>}</div>}
    {confirmando && ticketSeleccionado && <ConfirmarDevolucion ticket={ticketSeleccionado} cantidades={cantidades} motivo={motivo} motivoOtro={motivoOtro} procesando={procesando} onVolver={() => setConfirmando(false)} onConfirmar={() => void procesar()} />}
  </div>
}
