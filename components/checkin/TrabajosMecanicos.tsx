'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Calculator, CameraOff, Eye, Pencil, Plus, Save, Wrench, X } from 'lucide-react'
import SelectorImagen from '@/components/SelectorImagen'
import { supabase } from '@/lib/supabase'
import type { EmpleadoCheckIn, EstadoTrabajoMecanico, TrabajoMecanico } from '@/types/checkin'
import { calcularComisionManoObra, totalPagoEstimado } from '@/utils/checkin'
import { comprimirImagenProducto } from '@/utils/imagenes'
import { contenidoTrabajoValido, fotoTrabajoVigente } from '@/utils/fotosTrabajosMecanicos'

const moneda = (v: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
const inicioMes = () => `${hoy().slice(0, 7)}-01`
const mensaje = (e: unknown) => e instanceof Error ? e.message : 'No fue posible completar la operación.'
interface Props { empleados: EmpleadoCheckIn[]; salarioHorasCentavos: number }
interface RespuestaApi { ok?: boolean; mensaje?: string; ruta?: string; mime?: string; url?: string }

async function fetchAutenticado(url: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('La sesión expiró. Inicia sesión nuevamente.')
  const respuesta = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
  const cuerpo = await respuesta.json().catch(() => ({})) as RespuestaApi
  if (!respuesta.ok || !cuerpo.ok) throw new Error(cuerpo.mensaje || 'No fue posible completar la operación.')
  return cuerpo
}

function FotoTemporal({ trabajo }: { trabajo: TrabajoMecanico }) {
  const [url, setUrl] = useState(''); const [ampliada, setAmpliada] = useState(false)
  const vigente = fotoTrabajoVigente(trabajo.foto_expira_at, trabajo.foto_eliminada_at)
  useEffect(() => {
    if (!vigente || !trabajo.foto_ruta) return
    let activa = true
    void fetchAutenticado('/api/trabajos-mecanicos/fotos/firmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trabajoId: trabajo.id }) }).then((r) => { if (activa) setUrl(r.url || '') }).catch(() => { if (activa) setUrl('') })
    const demora = Math.max(0, new Date(trabajo.foto_expira_at!).getTime() - Date.now())
    const temporizador = window.setTimeout(() => { setUrl(''); setAmpliada(false) }, Math.min(demora + 50, 2_147_483_647))
    return () => { activa = false; window.clearTimeout(temporizador) }
  }, [trabajo.id, trabajo.foto_expira_at, trabajo.foto_ruta, vigente])
  if (!vigente) return <div className="fl-mechanics-photo-expired"><CameraOff />Fotografía temporal expirada</div>
  if (!url) return <div className="fl-mechanics-photo-loading">Cargando fotografía…</div>
  return <><button className="fl-mechanics-photo" type="button" onClick={() => setAmpliada(true)} aria-label="Ampliar fotografía temporal"><img src={url} alt="Trabajo mecánico" loading="lazy" /><Eye /></button>{ampliada && <div className="fl-image-viewer" role="dialog" aria-modal="true" aria-label="Fotografía del trabajo"><button type="button" aria-label="Cerrar" onClick={() => setAmpliada(false)}><X /></button><img src={url} alt="Trabajo mecánico ampliado" /></div>}</>
}

export default function TrabajosMecanicos({ empleados, salarioHorasCentavos }: Props) {
  const [trabajos, setTrabajos] = useState<TrabajoMecanico[]>([]); const [porcentaje, setPorcentaje] = useState(60); const [porcentajeNuevo, setPorcentajeNuevo] = useState(60)
  const [desde, setDesde] = useState(inicioMes); const [hasta, setHasta] = useState(hoy); const [empleadoId, setEmpleadoId] = useState(''); const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(hoy); const [importe, setImporte] = useState(''); const [foto, setFoto] = useState<File | null>(null); const [editando, setEditando] = useState<TrabajoMecanico | null>(null)
  const [cargando, setCargando] = useState(true); const [procesando, setProcesando] = useState(false); const [error, setError] = useState(''); const bloqueo = useRef(false); const idempotencia = useRef<string | null>(null)
  const cargar = useCallback(async () => { setCargando(true); setError(''); const { data, error: e } = await supabase.rpc('obtener_trabajos_mecanicos', { p_desde: desde, p_hasta: hasta }); if (e) setError(e.message); else { const r = data as { porcentaje_actual?: number; trabajos?: TrabajoMecanico[] } | null; const actual = Number(r?.porcentaje_actual ?? 60); setPorcentaje(actual); setPorcentajeNuevo(actual); setTrabajos(r?.trabajos || []) } setCargando(false) }, [desde, hasta])
  useEffect(() => { void cargar() }, [cargar]); useEffect(() => { if (!empleadoId && empleados[0]) setEmpleadoId(empleados[0].id) }, [empleadoId, empleados])
  const importeNumero = Number(importe); const comisionVista = Number.isFinite(importeNumero) && importeNumero >= 0 ? calcularComisionManoObra(importeNumero, editando?.porcentaje_aplicado ?? porcentaje) : 0
  const resumen = useMemo(() => { const activos = trabajos.filter((t) => t.estado !== 'Cancelada'); return { delDia: activos.filter((t) => t.fecha === hoy()).reduce((s, t) => s + Number(t.comision), 0), periodo: activos.reduce((s, t) => s + Number(t.comision), 0), pendientesDelDia: activos.filter((t) => t.estado === 'Pendiente' && t.fecha === hoy()).reduce((s, t) => s + Number(t.comision), 0) } }, [trabajos])
  const limpiar = () => { setDescripcion(''); setImporte(''); setFecha(hoy()); setFoto(null); setEditando(null); idempotencia.current = null }
  const guardar = async (evento: FormEvent) => {
    evento.preventDefault(); const descripcionLimpia = descripcion.trim()
    if (!empleadoId || !contenidoTrabajoValido(descripcionLimpia, Boolean(foto || editando?.foto_expira_at)) || !fecha || !Number.isFinite(importeNumero) || importeNumero < 0) return setError('Completa empleado, fecha e importe, y agrega una descripción o fotografía.')
    if (foto && fecha !== hoy()) return setError('La fotografía temporal solo puede usarse en un trabajo con fecha de hoy.')
    if (bloqueo.current) return; bloqueo.current = true; setProcesando(true); setError('')
    try {
      if (editando) { const { error: e } = await supabase.rpc('corregir_trabajo_mecanico', { p_trabajo_id: editando.id, p_empleado_id: empleadoId, p_descripcion: descripcionLimpia, p_fecha: fecha, p_importe_mano_obra: importeNumero, p_estado: editando.estado, p_motivo: 'Corrección administrativa desde el panel' }); if (e) throw e }
      else { const clave = idempotencia.current ||= crypto.randomUUID(); let ruta: string | null = null; let mime: string | null = null; if (foto) { const comprimida = await comprimirImagenProducto(foto); const form = new FormData(); form.set('foto', comprimida); form.set('fecha', fecha); form.set('idempotencyKey', clave); const subida = await fetchAutenticado('/api/trabajos-mecanicos/fotos', { method: 'POST', body: form }); ruta = subida.ruta || null; mime = subida.mime || null } const { error: e } = await supabase.rpc('registrar_trabajo_mecanico', { p_idempotency_key: clave, p_empleado_id: empleadoId, p_descripcion: descripcionLimpia, p_fecha: fecha, p_importe_mano_obra: importeNumero, p_foto_ruta: ruta, p_foto_mime: mime }); if (e) throw new Error(`La fotografía pudo subirse, pero no se confirmó el registro: ${e.message}. Reintenta sin cambiar el formulario; no se borrará la imagen hasta confirmar el resultado.`) }
      limpiar(); await cargar()
    } catch (e) { setError(mensaje(e)) } finally { bloqueo.current = false; setProcesando(false) }
  }
  const editar = (t: TrabajoMecanico) => { setEditando(t); setEmpleadoId(t.empleado_id); setDescripcion(t.descripcion || ''); setFecha(t.fecha); setImporte(String(t.importe_mano_obra)); setFoto(null); setError('') }
  const cambiarEstado = async (t: TrabajoMecanico, estado: EstadoTrabajoMecanico) => { if (bloqueo.current) return; bloqueo.current = true; setProcesando(true); setError(''); const { error: e } = await supabase.rpc('corregir_trabajo_mecanico', { p_trabajo_id: t.id, p_empleado_id: t.empleado_id, p_descripcion: t.descripcion || '', p_fecha: t.fecha, p_importe_mano_obra: t.importe_mano_obra, p_estado: estado, p_motivo: `Cambio de estado: ${t.estado} → ${estado}` }); if (e) setError(e.message); else await cargar(); bloqueo.current = false; setProcesando(false) }
  const guardarPorcentaje = async () => { if (bloqueo.current || porcentajeNuevo < 0 || porcentajeNuevo > 100) return; bloqueo.current = true; setProcesando(true); setError(''); const { error: e } = await supabase.rpc('configurar_porcentaje_comision', { p_porcentaje: porcentajeNuevo }); if (e) setError(e.message); else await cargar(); bloqueo.current = false; setProcesando(false) }
  return <section className="fl-mechanics">
    <header><div><span>COMISIONES</span><h2>Trabajos mecánicos</h2><p>Solo mano de obra. No incluye refacciones, accesorios ni mercancía.</p></div><Wrench /></header>
    {error && <div className="fl-checkin-error" role="alert">{error}<button type="button" onClick={() => setError('')}><X /></button></div>}
    <div className="fl-mechanics-summary"><article><strong>{moneda(resumen.delDia)}</strong><span>Comisiones de hoy</span></article><article><strong>{moneda(resumen.periodo)}</strong><span>Comisiones del periodo</span></article><article><strong>{moneda(salarioHorasCentavos / 100)}</strong><span>Salario por horas de hoy</span></article><article className="is-total"><strong>{moneda(totalPagoEstimado(salarioHorasCentavos / 100, resumen.pendientesDelDia))}</strong><span>Total estimado de hoy (horas + comisiones pendientes)</span></article></div>
    <div className="fl-mechanics-grid"><form onSubmit={guardar}><h3>{editando ? 'Corregir trabajo' : 'Registrar trabajo'}</h3><label>Empleado<select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} disabled={procesando}>{empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label><label>Descripción (opcional si agregas foto)<textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={500} disabled={procesando} /></label>{!editando && <div className="fl-mechanics-picker"><b>Fotografía temporal (opcional si agregas descripción)</b><SelectorImagen ariaLabel="Fotografía del trabajo mecánico" archivo={foto} deshabilitado={procesando} onSeleccionar={setFoto} onEliminar={() => setFoto(null)} /><small>Se comprime en tu dispositivo y se elimina después de la medianoche de Ciudad de México.</small></div>}<label>Fecha<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={procesando} /></label><label>Importe de mano de obra<input type="number" min="0" step="0.01" value={importe} onChange={(e) => setImporte(e.target.value)} disabled={procesando} /></label><div className="fl-mechanics-calculation"><Calculator /><span>{editando ? `${editando.porcentaje_aplicado}% histórico` : `${porcentaje}% vigente`}</span><strong>{moneda(comisionVista)}</strong></div><button className="is-primary" type="submit" disabled={procesando}>{editando ? <Save /> : <Plus />}{procesando ? 'Guardando…' : editando ? 'Guardar corrección' : 'Registrar trabajo'}</button>{editando && <button type="button" onClick={limpiar} disabled={procesando}>Cancelar</button>}</form><aside><h3>Porcentaje para futuros trabajos</h3><p>Vigente: <b>{porcentaje}%</b>. Los registros anteriores conservan su porcentaje.</p><div><input type="number" min="0" max="100" step="0.01" value={porcentajeNuevo} onChange={(e) => setPorcentajeNuevo(Number(e.target.value))} /><span>%</span><button type="button" onClick={() => void guardarPorcentaje()} disabled={procesando}>Guardar</button></div></aside></div>
    <div className="fl-mechanics-filters"><label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label><label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label></div>
    {cargando ? <p className="fl-checkin-empty">Cargando trabajos…</p> : trabajos.length === 0 ? <p className="fl-checkin-empty">No hay trabajos mecánicos en este periodo.</p> : <div className="fl-mechanics-list">{trabajos.map((t) => <article key={t.id}>{t.foto_expira_at && <FotoTemporal trabajo={t} />}<div><strong>{t.descripcion || 'Trabajo registrado con fotografía'}</strong><span>{t.empleado_nombre} · {t.fecha}</span><small>Mano de obra {moneda(Number(t.importe_mano_obra))} · {t.porcentaje_aplicado}%</small></div><div><b>{moneda(Number(t.comision))}</b><span className={`is-${t.estado.toLowerCase()}`}>{t.estado}</span></div><footer><button type="button" onClick={() => editar(t)} disabled={procesando}><Pencil />Corregir</button>{t.estado === 'Pendiente' && <button type="button" onClick={() => void cambiarEstado(t, 'Pagada')} disabled={procesando}>Marcar pagada</button>}{t.estado !== 'Cancelada' && <button type="button" onClick={() => void cambiarEstado(t, 'Cancelada')} disabled={procesando}>Cancelar</button>}</footer></article>)}</div>}
  </section>
}
