'use client'

import { AlertTriangle, Clock3, CreditCard, QrCode, RefreshCw, ScanLine, UserRoundCheck, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ScannerCodigoBarras, { type FeedbackScanner } from '@/components/codigos-barras/ScannerCodigoBarras'
import CredencialCheckIn from '@/components/checkin/CredencialCheckIn'
import TrabajosMecanicos from '@/components/checkin/TrabajosMecanicos'
import { supabase } from '@/lib/supabase'
import type { EmpleadoCheckIn } from '@/types/checkin'
import { accionDisponible, calcularJornada, resolverQrCheckIn, resumirPanelCheckIn, type AccionCheckIn } from '@/utils/checkin'
import { formatearFechaHoraFastLook } from '@/utils/fechas'

const dinero = (centavos: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(centavos / 100)
const horas = (minutos: number) => `${Math.floor(minutos / 60)}h ${Math.floor(minutos % 60)}min`
const hora = (valor: string) => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(valor))
const mensajeError = (error: unknown) => error instanceof Error ? error.message : 'No fue posible completar la operación.'

export default function CheckIn() {
  const [empleados, setEmpleados] = useState<EmpleadoCheckIn[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [scanner, setScanner] = useState(false)
  const [manual, setManual] = useState(false)
  const [seleccion, setSeleccion] = useState<{ empleado: EmpleadoCheckIn; accion: AccionCheckIn } | null>(null)
  const [credencial, setCredencial] = useState<EmpleadoCheckIn | null>(null)
  const [detalle, setDetalle] = useState<EmpleadoCheckIn | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState<EmpleadoCheckIn | null>(null)
  const [salidaCorreccion, setSalidaCorreccion] = useState('')
  const [motivoCorreccion, setMotivoCorreccion] = useState('')
  const bloqueoRef = useRef(false)
  const [ahora, setAhora] = useState(new Date())

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true)
    const { data, error: errorRpc } = await supabase.rpc('obtener_panel_checkin')
    if (errorRpc) setError(errorRpc.message)
    else { setEmpleados((data || []) as EmpleadoCheckIn[]); setError('') }
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => {
    const temporizador = window.setInterval(() => { setAhora(new Date()); void cargar(true) }, 30_000)
    return () => window.clearInterval(temporizador)
  }, [cargar])

  const resumen = useMemo(() => resumirPanelCheckIn(empleados, ahora), [empleados, ahora])
  const preparar = (empleado: EmpleadoCheckIn) => {
    if (empleado.jornada?.es_anterior && !empleado.jornada.salida) {
      setError(`${empleado.nombre} tiene una jornada anterior abierta. Revísala y ciérrala manualmente antes de registrar otra entrada.`)
      return false
    }
    const accion = accionDisponible(empleado.jornada)
    if (!accion) { setError(`${empleado.nombre} ya tiene una jornada cerrada hoy.`); return false }
    setSeleccion({ empleado, accion }); setManual(false); setError(''); return true
  }

  const detectar = (contenido: string): FeedbackScanner => {
    const usuarioId = resolverQrCheckIn(contenido)
    if (!usuarioId) return { tipo: 'error', titulo: 'QR inválido', detalle: 'No es una credencial de Check In Fast Look.' }
    const empleado = empleados.find((item) => item.id.toLowerCase() === usuarioId)
    if (!empleado) return { tipo: 'error', titulo: 'Empleado no disponible', detalle: 'La credencial no corresponde a un usuario activo.' }
    if (!preparar(empleado)) return { tipo: 'error', titulo: 'Jornada ya cerrada', detalle: 'Sólo se permite una jornada por día.' }
    return { tipo: 'ok', titulo: empleado.nombre, detalle: 'Credencial validada.' }
  }

  const confirmar = async () => {
    if (!seleccion || bloqueoRef.current) return
    bloqueoRef.current = true; setGuardando(true); setError('')
    const funcion = seleccion.accion === 'entrada' ? 'registrar_entrada_empleado' : 'registrar_salida_empleado'
    const { error: errorRpc } = await supabase.rpc(funcion, { p_usuario_id: seleccion.empleado.id })
    if (errorRpc) {
      const duplicada = errorRpc.message.includes('JORNADA_ABIERTA_EXISTENTE') || errorRpc.message.includes('asistencias_una_abierta_por_usuario_uidx') || errorRpc.code === '23505'
      setError(duplicada ? 'Ya existe una jornada abierta para este empleado. Se actualizó el panel para que puedas revisarla.' : errorRpc.message)
      if (duplicada) { setSeleccion(null); await cargar(true) }
    }
    else { setSeleccion(null); await cargar(true) }
    bloqueoRef.current = false; setGuardando(false)
  }

  const cerrarJornadaAnterior = async () => {
    if (!corrigiendo?.jornada || bloqueoRef.current) return
    if (!salidaCorreccion || !motivoCorreccion.trim()) { setError('Indica la hora de salida correcta y el motivo de la corrección.'); return }
    const salida = new Date(salidaCorreccion)
    if (!Number.isFinite(salida.getTime())) { setError('La fecha y hora de salida no son válidas.'); return }
    bloqueoRef.current = true; setGuardando(true); setError('')
    const { error: errorRpc } = await supabase.rpc('cerrar_jornada_abierta_admin', { p_asistencia_id: corrigiendo.jornada.id, p_salida: salida.toISOString(), p_motivo: motivoCorreccion.trim() })
    if (errorRpc) setError(errorRpc.message)
    else { setCorrigiendo(null); setSalidaCorreccion(''); setMotivoCorreccion(''); await cargar(true) }
    bloqueoRef.current = false; setGuardando(false)
  }

  return <section className="fl-checkin-page">
    <header className="fl-checkin-hero"><div><span>CONTROL DE ASISTENCIA</span><h1>CHECK IN</h1><p>Entradas, salidas y pago estimado del día.</p></div><button type="button" onClick={() => void cargar()} disabled={cargando}><RefreshCw className={cargando ? 'is-spinning' : ''} />Actualizar</button></header>
    <div className="fl-checkin-main-actions"><button type="button" className="is-primary" onClick={() => setScanner(true)}><ScanLine />ESCANEAR CREDENCIAL</button><button type="button" onClick={() => setManual(true)}><UserRoundCheck />REGISTRO MANUAL</button></div>
    {error && <div className="fl-checkin-error" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Cerrar aviso"><X /></button></div>}
    <section><h2>Resumen de hoy</h2><div className="fl-checkin-summary">
      <article><CreditCard /><strong>{resumen.registrados}</strong><span>Registrados</span></article><article><Clock3 /><strong>{resumen.trabajando}</strong><span>Trabajando</span></article><article><strong>{resumen.cerradas}</strong><span>Jornadas cerradas</span></article><article><strong>{horas(resumen.minutosNormales)}</strong><span>Horas normales</span></article><article><strong>{horas(resumen.minutosExtra)}</strong><span>Horas extra</span></article><article className="is-money"><strong>{dinero(resumen.pagoCentavos)}</strong><span>Pago estimado</span></article>
    </div></section>
    <section><div className="fl-checkin-section-title"><div><span>HOY</span><h2>Empleados</h2></div></div>
      {cargando ? <p className="fl-checkin-empty">Cargando asistencia…</p> : <div className="fl-checkin-list">{empleados.map((empleado) => {
        const jornada = empleado.jornada
        const calculo = jornada ? calcularJornada(jornada.entrada, jornada.salida || ahora, jornada.tarifa_normal * 100, jornada.tarifa_extra * 100, jornada.limite_horas_normales * 60) : null
        const estado = !jornada ? 'SIN ENTRADA' : jornada.es_anterior && !jornada.salida ? 'JORNADA ANTERIOR ABIERTA' : jornada.salida ? 'SALIDA REGISTRADA' : 'TRABAJANDO'
        return <article key={empleado.id} className="fl-checkin-row" onClick={() => { if (jornada) setDetalle(empleado) }}>
          <div><strong>{empleado.nombre}</strong><span>{empleado.rol}</span></div><span className={`fl-checkin-status is-${estado === 'TRABAJANDO' ? 'working' : jornada?.salida ? 'closed' : 'pending'}`}>{estado}</span>
          {jornada?.es_anterior && !jornada.salida && <div className="fl-checkin-old-warning"><AlertTriangle /><span>Esta jornada comenzó el {jornada.fecha} y sigue abierta. No se registrará otra entrada hasta corregirla.</span></div>}
          <div><span>Entrada<b>{jornada ? hora(jornada.entrada) : '—'}</b></span><span>Salida<b>{jornada?.salida ? hora(jornada.salida) : '—'}</b></span><span>Tiempo<b>{calculo ? horas(calculo.minutosTrabajados) : '—'}</b></span><span>Pago<b>{calculo ? dinero(calculo.pagoTotalCentavos) : '—'}</b></span></div>
          <footer><button type="button" onClick={(evento) => { evento.stopPropagation(); setCredencial(empleado) }}><QrCode />Ver credencial</button>{jornada?.es_anterior && !jornada.salida ? <button type="button" className="is-warning" onClick={(evento) => { evento.stopPropagation(); setCorrigiendo(empleado); setSalidaCorreccion(''); setMotivoCorreccion('') }}>Revisar y cerrar</button> : <button type="button" disabled={!accionDisponible(jornada)} onClick={(evento) => { evento.stopPropagation(); preparar(empleado) }}>{accionDisponible(jornada) === 'salida' ? 'Registrar salida' : accionDisponible(jornada) === 'entrada' ? 'Registrar entrada' : 'Jornada cerrada'}</button>}</footer>
        </article>
      })}</div>}
    </section>
    <ScannerCodigoBarras abierto={scanner} onDetect={detectar} onCerrar={() => setScanner(false)} />
    {manual && <div className="fl-checkin-backdrop"><section className="fl-checkin-dialog" role="dialog" aria-modal="true"><header><h2>Registro manual</h2><button type="button" onClick={() => setManual(false)}><X /></button></header><p>Selecciona al empleado. Se aplicará la misma validación que al escanear.</p><div className="fl-checkin-manual-list">{empleados.map((empleado) => <button key={empleado.id} type="button" onClick={() => preparar(empleado)} disabled={!accionDisponible(empleado.jornada)}><span><strong>{empleado.nombre}</strong><small>{empleado.rol}</small></span><b>{accionDisponible(empleado.jornada) === 'salida' ? 'SALIDA' : accionDisponible(empleado.jornada) === 'entrada' ? 'ENTRADA' : 'CERRADA'}</b></button>)}</div></section></div>}
    {seleccion && <div className="fl-checkin-backdrop"><section className="fl-checkin-dialog" role="alertdialog" aria-modal="true"><header><h2>Registrar {seleccion.accion.toUpperCase()}</h2><button type="button" onClick={() => setSeleccion(null)} disabled={guardando}><X /></button></header><div className="fl-checkin-confirm"><strong>{seleccion.empleado.nombre}</strong><span>Hora: {hora(ahora.toISOString())}</span>{seleccion.accion === 'salida' && seleccion.empleado.jornada && <><span>Entrada: {hora(seleccion.empleado.jornada.entrada)}</span><b>Tiempo trabajado: {horas(calcularJornada(seleccion.empleado.jornada.entrada, ahora).minutosTrabajados)}</b></>}</div><footer><button type="button" onClick={() => setSeleccion(null)} disabled={guardando}>Cancelar</button><button type="button" className="is-primary" onClick={() => void confirmar()} disabled={guardando}>{guardando ? 'Registrando…' : 'Confirmar'}</button></footer></section></div>}
    {corrigiendo?.jornada && <div className="fl-checkin-backdrop"><section className="fl-checkin-dialog" role="alertdialog" aria-modal="true" aria-labelledby="titulo-corregir-jornada"><header><h2 id="titulo-corregir-jornada">Cerrar jornada anterior</h2><button type="button" onClick={() => setCorrigiendo(null)} disabled={guardando}><X /></button></header><div className="fl-checkin-correction"><div className="fl-checkin-old-warning"><AlertTriangle /><span>No se inventará la salida. Confirma el dato real antes de guardar.</span></div><strong>{corrigiendo.nombre}</strong><span>Entrada: {formatearFechaHoraFastLook(corrigiendo.jornada.entrada)}</span><label>Fecha y hora real de salida<input type="datetime-local" value={salidaCorreccion} onChange={(e) => setSalidaCorreccion(e.target.value)} /></label><label>Motivo de la corrección<textarea value={motivoCorreccion} onChange={(e) => setMotivoCorreccion(e.target.value)} maxLength={500} /></label></div><footer><button type="button" onClick={() => setCorrigiendo(null)} disabled={guardando}>Cancelar</button><button type="button" className="is-primary" onClick={() => void cerrarJornadaAnterior()} disabled={guardando || !salidaCorreccion || !motivoCorreccion.trim()}>{guardando ? 'Guardando…' : 'Confirmar cierre'}</button></footer></section></div>}
    {credencial && <CredencialCheckIn empleado={credencial} onCerrar={() => setCredencial(null)} />}
    {detalle?.jornada && (() => { const c = calcularJornada(detalle.jornada.entrada, detalle.jornada.salida || ahora, detalle.jornada.tarifa_normal * 100, detalle.jornada.tarifa_extra * 100, detalle.jornada.limite_horas_normales * 60); return <div className="fl-checkin-backdrop"><section className="fl-checkin-dialog"><header><h2>{detalle.nombre}</h2><button type="button" onClick={() => setDetalle(null)}><X /></button></header><dl className="fl-checkin-detail"><dt>Fecha</dt><dd>{detalle.jornada.fecha}</dd><dt>Entrada</dt><dd>{formatearFechaHoraFastLook(detalle.jornada.entrada)}</dd><dt>Salida</dt><dd>{detalle.jornada.salida ? formatearFechaHoraFastLook(detalle.jornada.salida) : 'En curso'}</dd><dt>Duración</dt><dd>{horas(c.minutosTrabajados)}</dd><dt>Horas normales</dt><dd>{horas(c.minutosNormales)}</dd><dt>Horas extra</dt><dd>{horas(c.minutosExtra)}</dd><dt>Pago normal</dt><dd>{dinero(c.pagoNormalCentavos)}</dd><dt>Pago extra</dt><dd>{dinero(c.pagoExtraCentavos)}</dd><dt>Total</dt><dd><b>{dinero(c.pagoTotalCentavos)}</b></dd></dl></section></div> })()}
    <TrabajosMecanicos empleados={empleados} salarioHorasCentavos={resumen.pagoCentavos} />
  </section>
}
