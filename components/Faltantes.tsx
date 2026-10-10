'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ClipboardList, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Faltante {
  id: string
  nombre: string
  created_at: string
  autor_nombre: string | null
}

const mensajeError = (operacion: 'cargar' | 'agregar' | 'borrar') => {
  if (operacion === 'cargar') return 'No fue posible cargar los faltantes. Revisa tu conexión e inténtalo de nuevo.'
  if (operacion === 'agregar') return 'No fue posible agregar el faltante. Inténtalo de nuevo.'
  return 'No fue posible borrar el faltante. Inténtalo de nuevo.'
}

const formatearFecha = (fecha: string) => new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(fecha))

export default function Faltantes() {
  const [faltantes, setFaltantes] = useState<Faltante[]>([])
  const [nombre, setNombre] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [borrandoId, setBorrandoId] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<Faltante | null>(null)
  const [error, setError] = useState('')
  const envioEnCurso = useRef(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    const { data, error: errorConsulta } = await supabase
      .from('faltantes')
      .select('id,nombre,created_at,autor_nombre')
      .order('created_at', { ascending: false })

    if (errorConsulta) setError(mensajeError('cargar'))
    else setFaltantes((data || []) as Faltante[])
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const agregar = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const nombreLimpio = nombre.trim()
    if (!nombreLimpio) {
      setError('Escribe el nombre del producto faltante.')
      return
    }
    if (envioEnCurso.current) return

    envioEnCurso.current = true
    setGuardando(true)
    setError('')
    const { data, error: errorInsertar } = await supabase
      .from('faltantes')
      .insert({ nombre: nombreLimpio })
      .select('id,nombre,created_at,autor_nombre')
      .single()

    if (errorInsertar) setError(mensajeError('agregar'))
    else {
      setFaltantes((actuales) => [data as Faltante, ...actuales])
      setNombre('')
    }
    setGuardando(false)
    envioEnCurso.current = false
  }

  const borrar = async () => {
    if (!confirmar || borrandoId) return
    const objetivo = confirmar
    setBorrandoId(objetivo.id)
    setError('')
    const { error: errorBorrar } = await supabase.from('faltantes').delete().eq('id', objetivo.id)
    if (errorBorrar) setError(mensajeError('borrar'))
    else setFaltantes((actuales) => actuales.filter((item) => item.id !== objetivo.id))
    setBorrandoId(null)
    setConfirmar(null)
  }

  return (
    <section className="fl-missing-page">
      <header className="fl-missing-hero">
        <div><span>LISTA COMPARTIDA</span><h2>Faltantes</h2><p>Productos que hacen falta en Fast Look.</p></div>
        <ClipboardList size={38} aria-hidden="true" />
      </header>

      <form className="fl-missing-form" onSubmit={agregar}>
        <label htmlFor="nombre-faltante">Nombre del producto</label>
        <div><input id="nombre-faltante" value={nombre} onChange={(evento) => setNombre(evento.target.value)} placeholder="Ej. Aceite para moto" disabled={guardando} autoComplete="off" /><button type="submit" disabled={guardando}><Plus size={19} />{guardando ? 'Agregando…' : 'Agregar'}</button></div>
      </form>

      {error && <div className="fl-missing-error" role="alert"><AlertCircle size={19} /><span>{error}</span><button type="button" onClick={() => void cargar()}>Reintentar</button></div>}

      {cargando ? <div className="fl-missing-status" role="status"><LoaderCircle className="is-spinning" /><span>Cargando faltantes…</span></div> : faltantes.length === 0 ? <div className="fl-missing-empty"><ClipboardList size={42} /><strong>No hay faltantes</strong><span>Agrega el primero con el formulario de arriba.</span></div> : <div className="fl-missing-list" aria-live="polite">{faltantes.map((faltante) => <article key={faltante.id}><div><strong>{faltante.nombre}</strong><span>{formatearFecha(faltante.created_at)}{faltante.autor_nombre ? ` · ${faltante.autor_nombre}` : ''}</span></div><button type="button" onClick={() => setConfirmar(faltante)} disabled={borrandoId === faltante.id} aria-label={`Borrar ${faltante.nombre}`}><Trash2 size={19} /></button></article>)}</div>}

      {confirmar && <div className="fl-confirm-backdrop" role="presentation"><section className="fl-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="titulo-borrar-faltante"><h2 id="titulo-borrar-faltante">¿Borrar faltante?</h2><p>“{confirmar.nombre}” se quitará de la lista compartida.</p><div className="fl-confirm-actions"><button type="button" className="fl-confirm-danger" onClick={() => void borrar()} disabled={Boolean(borrandoId)}>{borrandoId ? 'Borrando…' : 'Sí, borrar'}</button><button type="button" className="fl-confirm-secondary" onClick={() => setConfirmar(null)} disabled={Boolean(borrandoId)}>Cancelar</button></div></section></div>}
    </section>
  )
}
