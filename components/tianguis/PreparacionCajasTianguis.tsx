'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Check, ChevronLeft, ChevronRight, ImageIcon, PackageCheck, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { PanelTianguis, ProductoMaestroTianguis } from '@/types/tianguis'
import { crearVariantesImagenProducto } from '@/utils/imagenes'
import { filtrarTareasTianguis } from '@/utils/tianguis'
import { sumarDiasFechaLocal } from '@/utils/fechas'

const mensajeRespuesta = async (response: Response) => {
  const body = await response.json().catch(() => null) as { mensaje?: string } | null
  if (!response.ok) throw new Error(body?.mensaje || `La operación falló (${response.status}).`)
  return body
}

export default function PreparacionCajasTianguis() {
  const [panel, setPanel] = useState<PanelTianguis | null>(null)
  const [semana, setSemana] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState<Set<string>>(new Set())
  const [nombre, setNombre] = useState('')
  const [orden, setOrden] = useState('0')
  const [editando, setEditando] = useState<ProductoMaestroTianguis | null>(null)
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null)
  const operaciones = useRef(new Set<string>())

  const token = async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session?.access_token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.')
    return data.session.access_token
  }
  const headers = async (json = false) => ({ Authorization: `Bearer ${await token()}`, ...(json ? { 'Content-Type': 'application/json' } : {}) })

  const cargar = useCallback(async (semanaSolicitada?: string | null) => {
    setCargando(true); setError('')
    try {
      const query = semanaSolicitada ? `?semana=${encodeURIComponent(semanaSolicitada)}` : ''
      const response = await fetch(`/api/tianguis${query}`, { headers: await headers(), cache: 'no-store' })
      const body = await response.json() as { ok: boolean; panel?: PanelTianguis; mensaje?: string }
      if (!response.ok || !body.panel) throw new Error(body.mensaje || 'No fue posible cargar la preparación.')
      setPanel(body.panel); setSemana(body.panel.semana_domingo)
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible cargar la preparación.') }
    finally { setCargando(false) }
  }, [])

  useEffect(() => { void cargar() }, [cargar])
  const tareas = useMemo(() => filtrarTareasTianguis(panel?.tareas || [], busqueda), [panel, busqueda])
  const completadas = panel?.tareas.filter((tarea) => tarea.completada_at).length || 0
  const progreso = panel?.tareas.length ? Math.round(completadas * 100 / panel.tareas.length) : 0

  const operar = async (clave: string, payload: object) => {
    if (operaciones.current.has(clave)) return
    operaciones.current.add(clave); setProcesando((actual) => new Set(actual).add(clave)); setError('')
    try {
      const response = await fetch('/api/tianguis', { method: 'POST', headers: await headers(true), body: JSON.stringify(payload) })
      await mensajeRespuesta(response); await cargar(semana)
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible guardar el cambio.'); await cargar(semana).catch(() => undefined) }
    finally { operaciones.current.delete(clave); setProcesando((actual) => { const siguiente = new Set(actual); siguiente.delete(clave); return siguiente }) }
  }

  const subirFotos = async (archivos: FileList | null) => {
    if (!archivos?.length || !semana) return
    for (const archivo of Array.from(archivos)) {
      const clave = `foto-${archivo.name}-${archivo.lastModified}`
      if (operaciones.current.has(clave)) continue
      operaciones.current.add(clave); setProcesando((actual) => new Set(actual).add(clave))
      try {
        const { principal, miniatura } = await crearVariantesImagenProducto(archivo)
        const form = new FormData(); form.set('foto', principal); form.set('miniatura', miniatura); form.set('semana', semana); form.set('idempotencyKey', crypto.randomUUID())
        await mensajeRespuesta(await fetch('/api/tianguis/fotos', { method: 'POST', headers: await headers(), body: form })); await cargar(semana)
      } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible subir una fotografía.') }
      finally { operaciones.current.delete(clave); setProcesando((actual) => { const siguiente = new Set(actual); siguiente.delete(clave); return siguiente }) }
    }
  }

  const guardarProducto = async () => {
    if (!nombre.trim()) return
    await operar('producto', { accion: 'guardar-producto', id: editando?.id || null, nombre: nombre.trim(), orden: Number(orden) || 0 })
    setNombre(''); setOrden('0'); setEditando(null)
  }

  if (cargando && !panel) return <section className="fl-tianguis-status"><RefreshCw className="is-spinning" /><p>Cargando preparación semanal…</p></section>
  return <section className="fl-tianguis-page">
    <header className="fl-tianguis-hero"><div><span>OPERACIÓN SEMANAL</span><h1>Cajas del tianguis</h1><p>Vacía, revisa y prepara la mercancía para el domingo.</p></div><PackageCheck size={54} /></header>
    {error && <div className="fl-tianguis-error" role="alert"><span>{error}</span><button onClick={() => void cargar(semana)}><RefreshCw size={17} />Reintentar</button></div>}
    {panel && <>
      <div className="fl-tianguis-week"><button aria-label="Semana anterior" onClick={() => void cargar(sumarDiasFechaLocal(panel.semana_domingo, -7))}><ChevronLeft /></button><div><small>Semana con domingo</small><strong>{panel.semana_domingo}</strong>{panel.semana_domingo === panel.semana_actual && <em>Actual</em>}</div><button aria-label="Semana siguiente" disabled={panel.semana_domingo >= panel.semana_actual} onClick={() => void cargar(sumarDiasFechaLocal(panel.semana_domingo, 7))}><ChevronRight /></button></div>

      <article className={`fl-tianguis-stage${panel.vaciado ? ' is-done' : ''}`}><div className="fl-tianguis-stage-number">1</div><div><h2>Vaciado de cajas</h2><p>{panel.vaciado ? `Completado por ${panel.vaciado.completada_por_nombre}.` : 'Vacía y revisa todas las cajas antes de preparar mercancía.'}</p></div><button disabled={procesando.has('vaciado') || Boolean(panel.vaciado && !panel.es_kikeadmin) || (panel.semana_domingo !== panel.semana_actual && !panel.es_kikeadmin)} onClick={() => void operar('vaciado', { accion: 'vaciado', semana: panel.semana_domingo, completado: !panel.vaciado })}>{panel.vaciado ? <><Check />Completado</> : 'Marcar completado'}</button></article>

      <article className="fl-tianguis-section"><header><div><span>ETAPA 2</span><h2>Productos sobrantes</h2><p>Se muestran las fotos de esta semana y la anterior. No se borran automáticamente.</p></div>{panel.semana_domingo === panel.semana_actual && <label className="fl-tianguis-upload"><Camera /><span>Agregar fotos</span><input type="file" accept="image/*" capture="environment" multiple onChange={(e) => { void subirFotos(e.target.files); e.target.value = '' }} /></label>}</header><div className="fl-tianguis-photos">{panel.fotos.map((foto) => <figure key={foto.id}><button onClick={() => foto.url && setFotoAmpliada(foto.url)}>{foto.miniatura_url ? <img src={foto.miniatura_url} alt={`Sobrante subido por ${foto.subida_por_nombre}`} /> : <ImageIcon />}</button><figcaption><span>{foto.semana_domingo}</span><small>{foto.subida_por_nombre}</small>{panel.es_kikeadmin && <button aria-label="Eliminar fotografía" onClick={() => confirm('¿Eliminar únicamente esta fotografía?') && void (async () => { try { await mensajeRespuesta(await fetch('/api/tianguis/fotos', { method: 'DELETE', headers: await headers(true), body: JSON.stringify({ id: foto.id }) })); await cargar(semana) } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible eliminar la fotografía.') } })()}><Trash2 /></button>}</figcaption></figure>)}</div>{!panel.fotos.length && <p className="fl-tianguis-empty">Todavía no hay fotografías para estas dos semanas.</p>}</article>

      <article className="fl-tianguis-section"><header><div><span>ETAPA 3</span><h2>Llenado de cajas</h2><p>{completadas} de {panel.tareas.length} productos empacados.</p></div><strong className="fl-tianguis-progress-label">{progreso}%</strong></header><div className="fl-tianguis-progress"><span style={{ width: `${progreso}%` }} /></div><label className="fl-tianguis-search"><Search /><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto…" /></label><div className="fl-tianguis-checklist">{tareas.map((tarea) => <button key={tarea.id} disabled={procesando.has(tarea.id) || (panel.semana_domingo !== panel.semana_actual && !panel.es_kikeadmin)} className={tarea.completada_at ? 'is-done' : ''} onClick={() => void operar(tarea.id, { accion: 'tarea', tareaId: tarea.id, completada: !tarea.completada_at })}><span className="fl-tianguis-checkbox">{tarea.completada_at && <Check />}</span><span><strong>{tarea.nombre}</strong><small>{tarea.completada_at ? `Empacado por ${tarea.completada_por_nombre}` : 'Pendiente'}</small></span></button>)}</div>{!tareas.length && <p className="fl-tianguis-empty">No hay productos que coincidan.</p>}</article>

      {panel.es_kikeadmin && <article className="fl-tianguis-section fl-tianguis-admin"><header><div><span>KIKEADMIN</span><h2>Lista maestra</h2><p>Los cambios se aplican a semanas nuevas; el historial conserva su fotografía original.</p></div></header><div className="fl-tianguis-master-form"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del producto" maxLength={120} /><input value={orden} onChange={(e) => setOrden(e.target.value)} type="number" min="0" aria-label="Orden" /><button onClick={() => void guardarProducto()} disabled={procesando.has('producto') || !nombre.trim()}><Plus />{editando ? 'Guardar cambios' : 'Agregar'}</button>{editando && <button onClick={() => { setEditando(null); setNombre(''); setOrden('0') }}><X />Cancelar</button>}</div><div className="fl-tianguis-master-list">{panel.productos_maestros.map((producto) => <div key={producto.id} className={!producto.activo ? 'is-retired' : ''}><span><strong>{producto.nombre}</strong><small>Orden {producto.orden}{!producto.activo && ' · Retirado'}</small></span>{producto.activo && <><button onClick={() => { setEditando(producto); setNombre(producto.nombre); setOrden(String(producto.orden)) }}>Editar</button><button className="is-danger" onClick={() => confirm('¿Retirar este producto de semanas futuras? El historial no se borrará.') && void operar(`retirar-${producto.id}`, { accion: 'retirar-producto', id: producto.id })}>Retirar</button></>}</div>)}</div></article>}
    </>}
    {fotoAmpliada && <div className="fl-tianguis-lightbox" role="dialog" aria-modal="true" onClick={() => setFotoAmpliada(null)}><button aria-label="Cerrar"><X /></button><img src={fotoAmpliada} alt="Fotografía ampliada de productos sobrantes" /></div>}
  </section>
}
