'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Calculator, Pencil, Plus, Save, Wrench, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { EmpleadoCheckIn, EstadoTrabajoMecanico, TrabajoMecanico } from '@/types/checkin'
import { calcularComisionManoObra, totalPagoEstimado } from '@/utils/checkin'

const moneda = (valor: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor)
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
const inicioMes = () => `${hoy().slice(0, 7)}-01`
const mensaje = (error: unknown) => error instanceof Error ? error.message : 'No fue posible completar la operación.'

interface Props { empleados: EmpleadoCheckIn[]; salarioHorasCentavos: number }

export default function TrabajosMecanicos({ empleados, salarioHorasCentavos }: Props) {
  const [trabajos, setTrabajos] = useState<TrabajoMecanico[]>([])
  const [porcentaje, setPorcentaje] = useState(60)
  const [porcentajeNuevo, setPorcentajeNuevo] = useState(60)
  const [desde, setDesde] = useState(inicioMes)
  const [hasta, setHasta] = useState(hoy)
  const [empleadoId, setEmpleadoId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [importe, setImporte] = useState('')
  const [editando, setEditando] = useState<TrabajoMecanico | null>(null)
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const bloqueo = useRef(false)

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    const { data, error: errorRpc } = await supabase.rpc('obtener_trabajos_mecanicos', { p_desde: desde, p_hasta: hasta })
    if (errorRpc) setError(errorRpc.message)
    else {
      const respuesta = data as { porcentaje_actual?: number; trabajos?: TrabajoMecanico[] } | null
      const porcentajeActual = Number(respuesta?.porcentaje_actual ?? 60)
      setPorcentaje(porcentajeActual)
      setPorcentajeNuevo(porcentajeActual)
      setTrabajos(respuesta?.trabajos || [])
    }
    setCargando(false)
  }, [desde, hasta])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => { if (!empleadoId && empleados[0]) setEmpleadoId(empleados[0].id) }, [empleadoId, empleados])

  const importeNumero = Number(importe)
  const comisionVista = Number.isFinite(importeNumero) && importeNumero >= 0 ? calcularComisionManoObra(importeNumero, editando?.porcentaje_aplicado ?? porcentaje) : 0
  const resumen = useMemo(() => {
    const activos = trabajos.filter((trabajo) => trabajo.estado !== 'Cancelada')
    const delDia = activos.filter((trabajo) => trabajo.fecha === hoy()).reduce((suma, trabajo) => suma + Number(trabajo.comision), 0)
    const periodo = activos.reduce((suma, trabajo) => suma + Number(trabajo.comision), 0)
    const pendientesDelDia = activos.filter((trabajo) => trabajo.estado === 'Pendiente' && trabajo.fecha === hoy()).reduce((suma, trabajo) => suma + Number(trabajo.comision), 0)
    return { delDia, periodo, pendientesDelDia }
  }, [trabajos])

  const limpiar = () => { setDescripcion(''); setImporte(''); setFecha(hoy()); setEditando(null) }
  const guardar = async (evento: FormEvent) => {
    evento.preventDefault()
    const descripcionLimpia = descripcion.trim()
    if (!empleadoId || !descripcionLimpia || !fecha || !Number.isFinite(importeNumero) || importeNumero < 0) return setError('Completa empleado, descripción, fecha e importe válido de mano de obra.')
    if (bloqueo.current) return
    bloqueo.current = true; setProcesando(true); setError('')
    try {
      const nombreRpc = editando ? 'corregir_trabajo_mecanico' : 'registrar_trabajo_mecanico'
      const parametros = editando
        ? { p_trabajo_id: editando.id, p_empleado_id: empleadoId, p_descripcion: descripcionLimpia, p_fecha: fecha, p_importe_mano_obra: importeNumero, p_estado: editando.estado, p_motivo: 'Corrección administrativa desde el panel' }
        : { p_idempotency_key: crypto.randomUUID(), p_empleado_id: empleadoId, p_descripcion: descripcionLimpia, p_fecha: fecha, p_importe_mano_obra: importeNumero }
      const { error: errorRpc } = await supabase.rpc(nombreRpc, parametros)
      if (errorRpc) throw errorRpc
      limpiar(); await cargar()
    } catch (errorGuardar) { setError(mensaje(errorGuardar)) }
    finally { bloqueo.current = false; setProcesando(false) }
  }

  const editar = (trabajo: TrabajoMecanico) => { setEditando(trabajo); setEmpleadoId(trabajo.empleado_id); setDescripcion(trabajo.descripcion); setFecha(trabajo.fecha); setImporte(String(trabajo.importe_mano_obra)); setError('') }
  const cambiarEstado = async (trabajo: TrabajoMecanico, estado: EstadoTrabajoMecanico) => {
    if (bloqueo.current) return
    bloqueo.current = true; setProcesando(true); setError('')
    const { error: errorRpc } = await supabase.rpc('corregir_trabajo_mecanico', { p_trabajo_id: trabajo.id, p_empleado_id: trabajo.empleado_id, p_descripcion: trabajo.descripcion, p_fecha: trabajo.fecha, p_importe_mano_obra: trabajo.importe_mano_obra, p_estado: estado, p_motivo: `Cambio de estado: ${trabajo.estado} → ${estado}` })
    if (errorRpc) setError(errorRpc.message); else await cargar()
    bloqueo.current = false; setProcesando(false)
  }
  const guardarPorcentaje = async () => {
    if (bloqueo.current || porcentajeNuevo < 0 || porcentajeNuevo > 100) return
    bloqueo.current = true; setProcesando(true); setError('')
    const { error: errorRpc } = await supabase.rpc('configurar_porcentaje_comision', { p_porcentaje: porcentajeNuevo })
    if (errorRpc) setError(errorRpc.message); else await cargar()
    bloqueo.current = false; setProcesando(false)
  }

  return <section className="fl-mechanics">
    <header><div><span>COMISIONES</span><h2>Trabajos mecánicos</h2><p>Solo mano de obra. No incluye refacciones, accesorios ni mercancía.</p></div><Wrench /></header>
    {error && <div className="fl-checkin-error" role="alert">{error}<button type="button" onClick={() => setError('')}><X /></button></div>}
    <div className="fl-mechanics-summary"><article><strong>{moneda(resumen.delDia)}</strong><span>Comisiones de hoy</span></article><article><strong>{moneda(resumen.periodo)}</strong><span>Comisiones del periodo</span></article><article><strong>{moneda(salarioHorasCentavos / 100)}</strong><span>Salario por horas de hoy</span></article><article className="is-total"><strong>{moneda(totalPagoEstimado(salarioHorasCentavos / 100, resumen.pendientesDelDia))}</strong><span>Total estimado de hoy (horas + comisiones pendientes)</span></article></div>
    <div className="fl-mechanics-grid"><form onSubmit={guardar}><h3>{editando ? 'Corregir trabajo' : 'Registrar trabajo'}</h3><label>Empleado<select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} disabled={procesando}>{empleados.map((empleado) => <option key={empleado.id} value={empleado.id}>{empleado.nombre}</option>)}</select></label><label>Descripción<textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={500} disabled={procesando} /></label><label>Fecha<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={procesando} /></label><label>Importe de mano de obra<input type="number" min="0" step="0.01" value={importe} onChange={(e) => setImporte(e.target.value)} disabled={procesando} /></label><div className="fl-mechanics-calculation"><Calculator /><span>{editando ? `${editando.porcentaje_aplicado}% histórico` : `${porcentaje}% vigente`}</span><strong>{moneda(comisionVista)}</strong></div><button className="is-primary" type="submit" disabled={procesando}>{editando ? <Save /> : <Plus />}{procesando ? 'Guardando…' : editando ? 'Guardar corrección' : 'Registrar trabajo'}</button>{editando && <button type="button" onClick={limpiar} disabled={procesando}>Cancelar</button>}</form>
      <aside><h3>Porcentaje para futuros trabajos</h3><p>Vigente: <b>{porcentaje}%</b>. Los registros anteriores conservan su porcentaje.</p><div><input type="number" min="0" max="100" step="0.01" value={porcentajeNuevo} onChange={(e) => setPorcentajeNuevo(Number(e.target.value))} /><span>%</span><button type="button" onClick={() => void guardarPorcentaje()} disabled={procesando}>Guardar</button></div></aside></div>
    <div className="fl-mechanics-filters"><label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label><label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label></div>
    {cargando ? <p className="fl-checkin-empty">Cargando trabajos…</p> : trabajos.length === 0 ? <p className="fl-checkin-empty">No hay trabajos mecánicos en este periodo.</p> : <div className="fl-mechanics-list">{trabajos.map((trabajo) => <article key={trabajo.id}><div><strong>{trabajo.descripcion}</strong><span>{trabajo.empleado_nombre} · {trabajo.fecha}</span><small>Mano de obra {moneda(Number(trabajo.importe_mano_obra))} · {trabajo.porcentaje_aplicado}%</small></div><div><b>{moneda(Number(trabajo.comision))}</b><span className={`is-${trabajo.estado.toLowerCase()}`}>{trabajo.estado}</span></div><footer><button type="button" onClick={() => editar(trabajo)} disabled={procesando}><Pencil />Corregir</button>{trabajo.estado === 'Pendiente' && <button type="button" onClick={() => void cambiarEstado(trabajo, 'Pagada')} disabled={procesando}>Marcar pagada</button>}{trabajo.estado !== 'Cancelada' && <button type="button" onClick={() => void cambiarEstado(trabajo, 'Cancelada')} disabled={procesando}>Cancelar</button>}</footer></article>)}</div>}
  </section>
}
