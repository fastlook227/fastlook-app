'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarClock, Check, ChevronDown, ChevronUp, Clipboard, ExternalLink, MapPin, MessageCircle, Plus, RefreshCw, Search, Truck, UserRound, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { EntregaProxima, EstadoEntrega, PanelEntregas } from '@/types/entregas'
import { construirMensajeEntrega, filtrarEntregas, requiereConfirmacion, urlWhatsApp } from '@/utils/entregas'
import { obtenerFechaActualFastLook, sumarDiasFechaLocal } from '@/utils/fechas'

const formularioInicial = { productos: '', clienteNombre: '', facebookUrl: '', telefono: '', fecha: obtenerFechaActualFastLook(), hora: '', ubicacion: '', mapsUrl: '', precio: '', anticipo: '', observaciones: '', repartidorId: '' }
type Formulario = typeof formularioInicial

export default function EntregasProximas() {
  const [panel, setPanel] = useState<PanelEntregas | null>(null)
  const [actorId, setActorId] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [crear, setCrear] = useState(false)
  const [form, setForm] = useState<Formulario>(formularioInicial)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('')
  const [repartidor, setRepartidor] = useState('')
  const [acordadaPor, setAcordadaPor] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [historial, setHistorial] = useState(false)
  const [detalle, setDetalle] = useState<string | null>(null)
  const bloqueo = useRef(new Set<string>())

  const authHeaders = async (json = false) => {
    const { data } = await supabase.auth.getSession()
    if (!data.session?.access_token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.')
    setActorId(data.session.user.id)
    return { Authorization: `Bearer ${data.session.access_token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) }
  }
  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true)
    try {
      const response = await fetch('/api/entregas', { headers: await authHeaders(), cache: 'no-store' })
      const body = await response.json() as { panel?: PanelEntregas; mensaje?: string }
      if (!response.ok || !body.panel) throw new Error(body.mensaje || 'No fue posible cargar las entregas.')
      setPanel(body.panel); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible cargar las entregas.') }
    finally { if (!silencioso) setCargando(false) }
  }, [])
  useEffect(() => { void cargar(); const timer = window.setInterval(() => void cargar(true), 60_000); return () => window.clearInterval(timer) }, [cargar])

  const operar = async (clave: string, payload: object) => {
    if (bloqueo.current.has(clave)) return false
    bloqueo.current.add(clave); setOcupado(clave); setError('')
    try {
      const response = await fetch('/api/entregas', { method: 'POST', headers: await authHeaders(true), body: JSON.stringify(payload) })
      const body = await response.json() as { mensaje?: string }
      if (!response.ok) throw new Error(body.mensaje || 'No fue posible guardar el cambio.')
      await cargar(true); return true
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible guardar el cambio.'); await cargar(true); return false }
    finally { bloqueo.current.delete(clave); setOcupado(null) }
  }

  const guardar = async () => {
    const ok = await operar('crear', { accion: 'crear', idempotencyKey, ...form, precio: form.precio === '' ? null : Number(form.precio), anticipo: form.anticipo === '' ? null : Number(form.anticipo), repartidorId: form.repartidorId || null })
    if (ok) { setCrear(false); setForm(formularioInicial); setIdempotencyKey(crypto.randomUUID()) }
  }
  const cambiarEstado = async (entrega: EntregaProxima, nuevo: EstadoEntrega) => {
    let motivo: string | null = null; let fechaNueva: string | null = null; let horaNueva: string | null = null
    if (nuevo === 'Cancelada') { motivo = prompt('Motivo obligatorio de cancelación:')?.trim() || null; if (!motivo) return }
    if (nuevo === 'Reprogramada') { fechaNueva = prompt('Nueva fecha (AAAA-MM-DD):', entrega.fecha_entrega)?.trim() || null; horaNueva = prompt('Nueva hora (HH:MM):', entrega.hora_entrega.slice(0, 5))?.trim() || null; motivo = prompt('Motivo de reprogramación:')?.trim() || null; if (!fechaNueva || !horaNueva || !motivo) return }
    await operar(`estado-${entrega.id}`, { accion: 'estado', entregaId: entrega.id, estado: nuevo, motivo, fechaNueva, horaNueva })
  }
  const comunicar = async (entrega: EntregaProxima, tipo: Parameters<typeof construirMensajeEntrega>[0]) => {
    const mensaje = construirMensajeEntrega(tipo, entrega); await navigator.clipboard.writeText(mensaje)
    await operar(`com-${entrega.id}`, { accion: 'comunicacion', entregaId: entrega.id, estado: 'Mensaje preparado' })
    const whats = urlWhatsApp(entrega.telefono, mensaje)
    if (whats) window.open(whats, '_blank', 'noopener,noreferrer')
    else if (entrega.facebook_url) window.open(entrega.facebook_url, '_blank', 'noopener,noreferrer')
  }

  const hoy = obtenerFechaActualFastLook(); const manana = sumarDiasFechaLocal(hoy, 1)
  const fuente = historial ? panel?.historial || [] : panel?.entregas || []
  const visibles = useMemo(() => filtrarEntregas(fuente, busqueda).filter((e) => (!estado || e.estado === estado) && (!repartidor || e.repartidor_id === repartidor) && (!acordadaPor || e.acordada_por === acordadaPor) && (!fechaDesde || e.fecha_entrega >= fechaDesde) && (!fechaHasta || e.fecha_entrega <= fechaHasta)), [fuente, busqueda, estado, repartidor, acordadaPor, fechaDesde, fechaHasta])
  const recordatorios = (panel?.entregas || []).filter((e) => requiereConfirmacion(e))
  const resumen = { hoy: (panel?.entregas || []).filter((e) => e.fecha_entrega === hoy).length, manana: (panel?.entregas || []).filter((e) => e.fecha_entrega === manana).length, camino: (panel?.entregas || []).filter((e) => ['En camino', 'Repartidor en el punto'].includes(e.estado)).length, atrasadas: (panel?.entregas || []).filter((e) => new Date(e.fecha_hora_iso).getTime() < Date.now() && !['En camino', 'Repartidor en el punto'].includes(e.estado)).length }

  return <section className="fl-deliveries-page">
    <header className="fl-deliveries-hero"><div><span>COORDINACIÓN DE PEDIDOS</span><h1>Entregas próximas</h1><p>Organiza, confirma y da seguimiento sin afectar ventas ni inventario.</p></div><button onClick={() => setCrear(true)}><Plus />Nueva entrega</button></header>
    {error && <div className="fl-deliveries-error" role="alert"><AlertTriangle /><span>{error}</span><button onClick={() => void cargar()}><RefreshCw />Reintentar</button></div>}
    <div className="fl-deliveries-summary"><article><b>{resumen.hoy}</b><span>Hoy</span></article><article><b>{resumen.manana}</b><span>Mañana</span></article><article className={recordatorios.length ? 'is-alert' : ''}><b>{recordatorios.length}</b><span>Confirmar ahora</span></article><article><b>{resumen.camino}</b><span>En camino</span></article><article className={resumen.atrasadas ? 'is-alert' : ''}><b>{resumen.atrasadas}</b><span>Atrasadas</span></article></div>
    {recordatorios.length > 0 && <section className="fl-deliveries-reminders"><header><CalendarClock /><div><strong>Confirmaciones próximas</strong><span>Aviso calculado para sesiones abiertas; no es un mensaje automático.</span></div></header>{recordatorios.map((e) => <article key={e.id}><div><strong>{e.productos}</strong><span>{e.cliente_nombre} · {e.hora_entrega.slice(0,5)} · {e.ubicacion}</span></div><button onClick={() => void comunicar(e, 'confirmar')}><MessageCircle />Preparar mensaje</button><button onClick={() => void operar(`enviado-${e.id}`, { accion: 'comunicacion', entregaId: e.id, estado: 'Mensaje enviado' })}>Mensaje enviado</button><button onClick={() => void operar(`confirm-${e.id}`, { accion: 'comunicacion', entregaId: e.id, estado: 'Respuesta confirmada' })}><Check />Cliente confirmó</button><button onClick={() => void cambiarEstado(e, 'Reprogramada')}>Reprogramar</button><button onClick={() => void cambiarEstado(e, 'Cancelada')}>Cancelar</button></article>)}</section>}
    <div className="fl-deliveries-toolbar"><label><Search /><input placeholder="Buscar cliente, producto o lugar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></label><select value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos los estados</option>{['Pendiente de confirmación','Confirmada','Preparando pedido','En camino','Repartidor en el punto','Entregada','Cancelada','Reprogramada'].map((v) => <option key={v}>{v}</option>)}</select><select value={repartidor} onChange={(e) => setRepartidor(e.target.value)}><option value="">Todos los repartidores</option>{panel?.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select><select value={acordadaPor} onChange={(e) => setAcordadaPor(e.target.value)}><option value="">Quien acordó: todos</option>{panel?.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select><input type="date" aria-label="Fecha desde" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} /><input type="date" aria-label="Fecha hasta" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} /><button className={historial ? 'is-active' : ''} onClick={() => setHistorial(!historial)}>{historial ? 'Ver próximas' : 'Ver historial'}</button></div>
    {cargando && <div className="fl-deliveries-empty"><RefreshCw className="is-spinning" />Cargando entregas…</div>}
    {!cargando && <div className="fl-deliveries-list">{visibles.map((e) => <article key={e.id} className={requiereConfirmacion(e) ? 'needs-confirmation' : ''}><header><div><span className="fl-delivery-state">{e.estado}</span><h2>{e.productos}</h2><p>{e.cliente_nombre}</p></div><time>{e.fecha_entrega}<b>{e.hora_entrega.slice(0,5)}</b></time></header><div className="fl-delivery-data"><span><MapPin />{e.ubicacion}</span><span><UserRound />Acordó: {e.acordada_por_nombre}</span><span><Truck />Repartidor: {e.repartidor_nombre || 'Sin asignar'}</span><span><MessageCircle />{e.telefono || (e.facebook_url ? 'Facebook / Messenger' : 'Sin contacto')}</span></div>{e.maps_url && <a href={e.maps_url} target="_blank" rel="noreferrer"><MapPin />Abrir Maps</a>}<div className="fl-delivery-actions">{!historial && <><select aria-label="Asignar repartidor" value={e.repartidor_id || ''} onChange={(x) => x.target.value && void operar(`asignar-${e.id}`, { accion: 'asignar', entregaId: e.id, repartidorId: x.target.value })}><option value="">Asignar repartidor</option>{panel?.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>{e.repartidor_id === actorId && !e.asignacion_confirmada_at && <button onClick={() => void operar(`aceptar-${e.id}`, { accion: 'confirmar-asignacion', entregaId: e.id })}>Recibí asignación</button>}<button onClick={() => void comunicar(e, e.estado === 'En camino' ? 'camino' : e.estado === 'Repartidor en el punto' ? 'llegue' : 'confirmar')}><MessageCircle />Contactar</button><select aria-label="Cambiar estado" value="" onChange={(x) => x.target.value && void cambiarEstado(e, x.target.value as EstadoEntrega)}><option value="">Cambiar estado…</option>{['Confirmada','Preparando pedido','En camino','Repartidor en el punto','Entregada','Reprogramada','Cancelada'].map((v) => <option key={v}>{v}</option>)}</select></>}<button onClick={() => setDetalle(detalle === e.id ? null : e.id)}>{detalle === e.id ? <ChevronUp /> : <ChevronDown />}Detalles</button></div>{detalle === e.id && <div className="fl-delivery-details"><p><b>Observaciones:</b> {e.observaciones || 'Sin observaciones'}</p><p><b>Comunicación:</b> {e.confirmacion_estado}</p><div className="fl-delivery-message-grid">{(['confirmar','presentar','preparando','camino','llegue','ubicacion','reprogramar','cancelacion','gracias'] as const).map((tipo) => <button key={tipo} onClick={() => void comunicar(e, tipo)}><Clipboard />{tipo}</button>)}</div>{e.facebook_url && <a href={e.facebook_url} target="_blank" rel="noreferrer"><ExternalLink />Abrir Facebook</a>}<details><summary>Historial ({e.eventos.length})</summary>{e.eventos.map((evento) => <p key={evento.id}><b>{evento.tipo}</b> · {evento.responsable_nombre}<br/><small>{new Date(evento.created_at).toLocaleString('es-MX')} {evento.detalle && `· ${evento.detalle}`}</small></p>)}</details></div>}</article>)}</div>}
    {!cargando && visibles.length === 0 && <div className="fl-deliveries-empty"><Truck />No hay entregas que coincidan con los filtros.</div>}
    {crear && <div className="fl-delivery-backdrop"><section className="fl-delivery-dialog" role="dialog" aria-modal="true"><header><div><span>NUEVA ENTREGA</span><h2>Registrar acuerdo</h2></div><button onClick={() => setCrear(false)} aria-label="Cerrar"><X /></button></header><div className="fl-delivery-form"><label className="is-wide">Productos acordados *<textarea value={form.productos} onChange={(e) => setForm({...form,productos:e.target.value})} /></label><label>Cliente *<input value={form.clienteNombre} onChange={(e) => setForm({...form,clienteNombre:e.target.value})} /></label><label>Teléfono / WhatsApp<input inputMode="tel" value={form.telefono} onChange={(e) => setForm({...form,telefono:e.target.value})} /></label><label className="is-wide">Facebook / Messenger<input type="url" value={form.facebookUrl} onChange={(e) => setForm({...form,facebookUrl:e.target.value})} /></label><label>Fecha *<input type="date" value={form.fecha} onChange={(e) => setForm({...form,fecha:e.target.value})} /></label><label>Hora *<input type="time" value={form.hora} onChange={(e) => setForm({...form,hora:e.target.value})} /></label><label className="is-wide">Dirección o punto de encuentro *<input value={form.ubicacion} onChange={(e) => setForm({...form,ubicacion:e.target.value})} /></label><label className="is-wide">Google Maps<input type="url" value={form.mapsUrl} onChange={(e) => setForm({...form,mapsUrl:e.target.value})} /></label><label>Precio acordado<input type="number" min="0" step="0.01" value={form.precio} onChange={(e) => setForm({...form,precio:e.target.value})} /></label><label>Anticipo<input type="number" min="0" step="0.01" value={form.anticipo} onChange={(e) => setForm({...form,anticipo:e.target.value})} /></label><label className="is-wide">Repartidor<select value={form.repartidorId} onChange={(e) => setForm({...form,repartidorId:e.target.value})}><option value="">Asignar después</option>{panel?.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label><label className="is-wide">Observaciones<textarea value={form.observaciones} onChange={(e) => setForm({...form,observaciones:e.target.value})} /></label></div><footer><button onClick={() => setCrear(false)}>Cancelar</button><button className="is-primary" disabled={ocupado === 'crear'} onClick={() => void guardar()}>{ocupado === 'crear' ? 'Guardando…' : 'Registrar entrega'}</button></footer></section></div>}
  </section>
}
