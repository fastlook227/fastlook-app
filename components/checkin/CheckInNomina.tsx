'use client'

import { AlertTriangle, ChevronDown, ChevronUp, Clock3, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TrabajosMecanicos from '@/components/checkin/TrabajosMecanicos'
import { supabase } from '@/lib/supabase'
import type { EmpleadoCheckIn, JornadaCheckIn, PanelNominaCheckIn } from '@/types/checkin'
import { accionDisponible, finSeguroJornadaAbierta, mensajeErrorCheckIn, operacionConfirmada, resumirNominaEmpleado, type AccionCheckIn } from '@/utils/checkin'
import { formatearFechaHoraFastLook } from '@/utils/fechas'

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
const dinero = (valor: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor)
const horas = (minutos: number) => `${Math.floor(minutos / 60)}h ${Math.floor(minutos % 60)}min`

function jornadaValida(jornada: unknown): jornada is JornadaCheckIn {
  if (!jornada || typeof jornada !== 'object') return false
  const j = jornada as Record<string, unknown>
  return typeof j.id === 'string' && typeof j.fecha === 'string' && typeof j.entrada === 'string' && Number.isFinite(Date.parse(j.entrada)) && (j.salida === null || typeof j.salida === 'string') && Number(j.tarifa_normal) >= 0 && Number(j.tarifa_extra) >= 0 && Number(j.limite_horas_normales) > 0
}

function validarPanel(valor: unknown): PanelNominaCheckIn {
  if (!valor || typeof valor !== 'object') throw new Error('El servidor devolvió una nómina inválida.')
  const panel = valor as PanelNominaCheckIn
  if (!['administrador', 'empleado'].includes(panel.modo) || !Array.isArray(panel.empleados)) throw new Error('El servidor devolvió una nómina incompleta.')
  panel.empleados.forEach((e) => {
    if (!e || typeof e.id !== 'string' || typeof e.nombre !== 'string' || !Array.isArray(e.jornadas) || !Array.isArray(e.trabajos) || (e.jornada !== null && !jornadaValida(e.jornada)) || !e.jornadas.every(jornadaValida)) throw new Error('El servidor devolvió datos inválidos de un trabajador.')
  })
  return panel
}

export default function CheckInNomina() {
  const [panel, setPanel] = useState<PanelNominaCheckIn | null>(null)
  const [desde, setDesde] = useState(hoy); const [hasta, setHasta] = useState(hoy)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [error, setError] = useState(''); const [cargando, setCargando] = useState(true); const [guardando, setGuardando] = useState(false)
  const [ahora, setAhora] = useState(new Date()); const [incierta, setIncierta] = useState<{ empleadoId: string; accion: AccionCheckIn } | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<EmpleadoCheckIn | null>(null); const [salida, setSalida] = useState(''); const [motivo, setMotivo] = useState('')
  const bloqueo = useRef(false)

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true)
    try {
      const { data, error: errorRpc } = await supabase.rpc('obtener_nomina_checkin', { p_desde: desde, p_hasta: hasta })
      if (errorRpc) throw errorRpc
      const siguiente = validarPanel(data)
      setPanel(siguiente); setIncierta(null); setAhora(new Date()); if (!silencioso) setError('')
      return siguiente
    } catch (e) { setError(mensajeErrorCheckIn(e)); return null } finally { setCargando(false) }
  }, [desde, hasta])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => { const id = window.setInterval(() => setAhora(new Date()), 30_000); return () => window.clearInterval(id) }, [])

  const totales = useMemo(() => (panel?.empleados || []).map((empleado) => ({ empleado, resumen: resumirNominaEmpleado(empleado.jornadas || [], empleado.trabajos || [], ahora) })), [panel, ahora])
  const general = useMemo(() => totales.reduce((r, x) => ({ salario: r.salario + x.resumen.salarioCentavos / 100, comisiones: r.comisiones + x.resumen.comisionesPendientes, total: r.total + x.resumen.totalEstimado }), { salario: 0, comisiones: 0, total: 0 }), [totales])
  const esAdmin = panel?.modo === 'administrador'

  const registrar = async (empleado: EmpleadoCheckIn, accion: AccionCheckIn) => {
    if (bloqueo.current || incierta) return
    bloqueo.current = true; setGuardando(true); setError('')
    try {
      const funcion = accion === 'entrada' ? 'registrar_entrada_empleado' : 'registrar_salida_empleado'
      const { error: errorRpc } = await supabase.rpc(funcion, { p_usuario_id: empleado.id })
      if (errorRpc) throw errorRpc
      if (!await cargar(true)) { setIncierta({ empleadoId: empleado.id, accion }); setError('La operación pudo completarse. Comprueba el estado antes de reintentar.') }
    } catch (e) {
      const siguiente = await cargar(true); const actual = siguiente?.empleados.find((x) => x.id === empleado.id)
      if (!siguiente) { setIncierta({ empleadoId: empleado.id, accion }); setError(`${mensajeErrorCheckIn(e)} Comprueba el estado antes de reintentar.`) }
      else if (operacionConfirmada(accion, actual)) setError(`La ${accion} sí quedó registrada; no se enviará un duplicado.`)
      else setError(mensajeErrorCheckIn(e))
    } finally { bloqueo.current = false; setGuardando(false) }
  }

  const cerrarAnterior = async () => {
    if (!corrigiendo?.jornada || bloqueo.current) return
    const fechaSalida = new Date(salida)
    if (!Number.isFinite(fechaSalida.getTime()) || !motivo.trim()) return setError('Indica la salida real y el motivo de la corrección.')
    bloqueo.current = true; setGuardando(true)
    try {
      const { error: e } = await supabase.rpc('cerrar_jornada_abierta_admin', { p_asistencia_id: corrigiendo.jornada.id, p_salida: fechaSalida.toISOString(), p_motivo: motivo.trim() })
      if (e) throw e
      setCorrigiendo(null); setSalida(''); setMotivo(''); await cargar(true)
    } catch (e) { setError(mensajeErrorCheckIn(e)) } finally { bloqueo.current = false; setGuardando(false) }
  }

  return <section className="fl-checkin-page">
    <header className="fl-checkin-hero"><div><span>{panel?.modo === 'administrador' ? 'NÓMINA GENERAL · KIKEADMIN' : 'MI ASISTENCIA'}</span><h1>CHECK IN</h1><p>{panel?.modo === 'administrador' ? 'Personal, jornadas y comisiones por trabajador.' : 'Tu jornada y total estimado del periodo.'}</p></div><button type="button" onClick={() => void cargar()} disabled={cargando}><RefreshCw className={cargando ? 'is-spinning' : ''} />Actualizar</button></header>
    <div className="fl-mechanics-filters"><label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label><label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label></div>
    {error && <div className="fl-checkin-error" role="alert">{error}<button type="button" onClick={() => setError('')}><X /></button></div>}
    {panel?.modo === 'administrador' && <div className="fl-checkin-summary"><article><strong>{panel.empleados.length}</strong><span>Trabajadores</span></article><article><strong>{dinero(general.salario)}</strong><span>Salario por horas</span></article><article><strong>{dinero(general.comisiones)}</strong><span>Comisiones pendientes</span></article><article className="is-money"><strong>{dinero(general.total)}</strong><span>Total estimado pendiente</span></article></div>}
    {cargando ? <p className="fl-checkin-empty">Cargando nómina…</p> : <div className="fl-payroll-employees">{totales.map(({ empleado, resumen }) => {
      const abierto = panel?.modo === 'empleado' || abiertos.has(empleado.id); const accion = accionDisponible(empleado.jornada); const trabajando = Boolean(empleado.jornada && !empleado.jornada.salida && !empleado.jornada.es_anterior)
      return <article className="fl-payroll-card" key={empleado.id}><button className="fl-payroll-card-head" type="button" onClick={() => setAbiertos((actual) => { const n = new Set(actual); n.has(empleado.id) ? n.delete(empleado.id) : n.add(empleado.id); return n })}><span><strong>{empleado.nombre}</strong><small>{trabajando ? 'TRABAJANDO' : empleado.jornada?.es_anterior ? 'JORNADA ANTERIOR ABIERTA' : 'FUERA DE JORNADA'}</small></span><span><b>{horas(resumen.minutosNormales)}</b><small>normales</small></span><span><b>{horas(resumen.minutosExtra)}</b><small>extra</small></span><span><b>{dinero(resumen.totalEstimado)}</b><small>estimado pendiente</small></span>{abierto ? <ChevronUp /> : <ChevronDown />}</button>
        {abierto && <div className="fl-payroll-card-body"><div className="fl-checkin-summary"><article><strong>{dinero(resumen.pagoNormalCentavos / 100)}</strong><span>Sueldo normal</span></article><article><strong>{dinero(resumen.pagoExtraCentavos / 100)}</strong><span>Sueldo extra</span></article><article><strong>{dinero(resumen.comisionesPendientes)}</strong><span>Comisiones pendientes</span></article><article><strong>{dinero(resumen.comisionesPagadas)}</strong><span>Comisiones pagadas</span></article></div>
          <div className="fl-payroll-actions">{empleado.jornada?.es_anterior && !empleado.jornada.salida ? esAdmin ? <button type="button" className="is-warning" onClick={() => setCorrigiendo(empleado)}>Revisar y cerrar jornada anterior</button> : <p><AlertTriangle />Solicita a KIKEADMIN cerrar la jornada anterior.</p> : accion && <button type="button" className="is-primary" disabled={guardando || Boolean(incierta)} onClick={() => void registrar(empleado, accion)}>{accion === 'entrada' ? 'Registrar entrada' : 'Registrar salida'}</button>}</div>
          <section><h3>Jornadas del periodo</h3>{(empleado.jornadas || []).length ? <div className="fl-payroll-history">{(empleado.jornadas || []).map((j) => { const fin = new Date(j.salida || finSeguroJornadaAbierta(j.entrada, ahora)); return <div key={j.id}><span>{j.fecha}</span><span>{formatearFechaHoraFastLook(j.entrada)}</span><span>{j.salida ? formatearFechaHoraFastLook(j.salida) : `En curso · ${horas((fin.getTime() - new Date(j.entrada).getTime()) / 60000)}`}</span></div> })}</div> : <p>Sin jornadas en el periodo.</p>}</section>
          <section><h3>Trabajos mecánicos</h3>{(empleado.trabajos || []).length ? <div className="fl-mechanics-list">{(empleado.trabajos || []).map((t) => <article key={t.id}><div><strong>{t.descripcion || 'Trabajo con fotografía temporal'}</strong><span>{t.fecha} · Mano de obra {dinero(Number(t.importe_mano_obra))}</span></div><div><b>{dinero(Number(t.comision))}</b><span>{t.estado}</span></div></article>)}</div> : <p>Sin trabajos en el periodo.</p>}</section>
          {esAdmin && <details><summary>Registrar o administrar trabajo mecánico</summary><TrabajosMecanicos empleados={panel?.empleados || []} empleadoFijo={empleado} salarioHorasCentavos={resumen.salarioCentavos} periodo={{ desde, hasta }} /></details>}
        </div>}
      </article>
    })}</div>}
    {corrigiendo?.jornada && <div className="fl-checkin-backdrop"><section className="fl-checkin-dialog" role="dialog" aria-modal="true"><header><h2>Cerrar jornada anterior</h2><button onClick={() => setCorrigiendo(null)}><X /></button></header><p>{corrigiendo.nombre} · entrada {formatearFechaHoraFastLook(corrigiendo.jornada.entrada)}</p><label>Salida real<input type="datetime-local" value={salida} onChange={(e) => setSalida(e.target.value)} /></label><label>Motivo<textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label><footer><button onClick={() => setCorrigiendo(null)}>Cancelar</button><button className="is-primary" onClick={() => void cerrarAnterior()} disabled={guardando}>Confirmar cierre</button></footer></section></div>}
  </section>
}
