'use client'

import { CheckSquare, FileDown, ImageOff, Square, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CascoCatalogo, OpcionesPDFCascos } from '@/types/cascos'

interface SelectorPDFCascosProps {
  cascos: CascoCatalogo[]
  onCancelar: () => void
  onGenerar: (cascos: CascoCatalogo[], opciones: OpcionesPDFCascos) => Promise<void>
}

export default function SelectorPDFCascos({ cascos, onCancelar, onGenerar }: SelectorPDFCascosProps) {
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [opciones, setOpciones] = useState<OpcionesPDFCascos>({ incluirPrecio: false, incluirStock: false, incluirAgotados: false })
  const [permitirCopiasAdicionales, setPermitirCopiasAdicionales] = useState(false)
  const [avisosCantidad, setAvisosCantidad] = useState<Record<string, string>>({})
  const [errorSeleccion, setErrorSeleccion] = useState('')
  const [generando, setGenerando] = useState(false)

  const modelosSeleccionados = useMemo(() => cascos.filter((casco) => (cantidades[casco.id] || 0) > 0).length, [cascos, cantidades])
  const etiquetasTotales = useMemo(() => cascos.reduce((total, casco) => total + (cantidades[casco.id] || 0), 0), [cascos, cantidades])

  const establecerCantidad = (casco: CascoCatalogo, valor: number) => {
    const stock = Math.max(0, Math.floor(Number(casco.stock || 0)))
    let cantidad = Math.max(0, Math.floor(Number.isFinite(valor) ? valor : 0))
    let aviso = ''
    if (!permitirCopiasAdicionales && cantidad > stock) {
      cantidad = stock
      aviso = `Máximo disponible: ${stock}`
    }
    if (stock === 0 && (!opciones.incluirAgotados || !permitirCopiasAdicionales)) cantidad = 0
    setCantidades((actuales) => ({ ...actuales, [casco.id]: cantidad }))
    setAvisosCantidad((actuales) => ({ ...actuales, [casco.id]: aviso }))
    setErrorSeleccion('')
  }

  const alternarCasco = (casco: CascoCatalogo) => {
    const agotado = Number(casco.stock || 0) <= 0
    if (agotado && (!opciones.incluirAgotados || !permitirCopiasAdicionales)) return
    establecerCantidad(casco, (cantidades[casco.id] || 0) > 0 ? 0 : 1)
  }

  const cambiarIncluirAgotados = (incluirAgotados: boolean) => {
    setOpciones((actuales) => ({ ...actuales, incluirAgotados }))
    if (!incluirAgotados) {
      const agotados = new Set(cascos.filter((casco) => Number(casco.stock || 0) <= 0).map((casco) => casco.id))
      setCantidades((actuales) => Object.fromEntries(Object.entries(actuales).map(([id, cantidad]) => [id, agotados.has(id) ? 0 : cantidad])))
    }
  }

  const cambiarCopiasAdicionales = (permitir: boolean) => {
    setPermitirCopiasAdicionales(permitir)
    setAvisosCantidad({})
    if (!permitir) {
      setCantidades((actuales) => Object.fromEntries(cascos.map((casco) => {
        const stock = Math.max(0, Math.floor(Number(casco.stock || 0)))
        return [casco.id, Math.min(actuales[casco.id] || 0, stock)]
      })))
    }
  }

  const seleccionarDisponibles = () => {
    setCantidades(Object.fromEntries(cascos.map((casco) => [casco.id, Number(casco.stock || 0) > 0 ? 1 : 0])))
    setAvisosCantidad({})
    setErrorSeleccion('')
  }

  const usarTodasLasExistencias = () => {
    const total = cascos.reduce((suma, casco) => suma + Math.max(0, Math.floor(Number(casco.stock || 0))), 0)
    if (!confirm(`Se generarán ${total} etiquetas correspondientes a todas las existencias disponibles.`)) return
    setCantidades(Object.fromEntries(cascos.map((casco) => [casco.id, Math.max(0, Math.floor(Number(casco.stock || 0)))])))
    setAvisosCantidad({})
    setErrorSeleccion('')
  }

  const generar = async () => {
    if (generando) return
    if (etiquetasTotales === 0) {
      setErrorSeleccion('Selecciona al menos una etiqueta.')
      return
    }
    if (etiquetasTotales > 100) {
      setErrorSeleccion('El PDF permite un máximo de 100 etiquetas. Divide la impresión en varios archivos.')
      return
    }
    const etiquetas = cascos.flatMap((casco) => Array.from({ length: cantidades[casco.id] || 0 }, () => casco))
    setGenerando(true)
    try {
      await onGenerar(etiquetas, opciones)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="fl-helmet-pdf-backdrop" role="presentation" onMouseDown={(evento) => { if (evento.target === evento.currentTarget && !generando) onCancelar() }}>
      <section className="fl-helmet-pdf-dialog" role="dialog" aria-modal="true" aria-labelledby="titulo-selector-pdf-cascos">
        <header>
          <div><span>FAST LOOK</span><h2 id="titulo-selector-pdf-cascos">Generar PDF para cajas</h2><p>{modelosSeleccionados} {modelosSeleccionados === 1 ? 'modelo seleccionado' : 'modelos seleccionados'}<br />{etiquetasTotales} {etiquetasTotales === 1 ? 'etiqueta para imprimir' : 'etiquetas para imprimir'}</p></div>
          <button type="button" aria-label="Cerrar selector" onClick={onCancelar} disabled={generando}><X size={22} /></button>
        </header>

        <div className="fl-helmet-pdf-options">
          <label><input type="checkbox" checked={opciones.incluirPrecio} onChange={(e) => setOpciones({ ...opciones, incluirPrecio: e.target.checked })} />Incluir precio</label>
          <label><input type="checkbox" checked={opciones.incluirStock} onChange={(e) => setOpciones({ ...opciones, incluirStock: e.target.checked })} />Incluir stock</label>
          <label><input type="checkbox" checked={opciones.incluirAgotados} onChange={(e) => cambiarIncluirAgotados(e.target.checked)} />Incluir agotados</label>
          <label><input type="checkbox" checked={permitirCopiasAdicionales} onChange={(e) => cambiarCopiasAdicionales(e.target.checked)} />Permitir copias adicionales</label>
        </div>

        <div className="fl-helmet-pdf-selection-actions">
          <button type="button" onClick={seleccionarDisponibles}><CheckSquare size={17} />Seleccionar todos los disponibles</button>
          <button type="button" onClick={usarTodasLasExistencias}><CheckSquare size={17} />Usar todas las existencias</button>
          <button type="button" onClick={() => { setCantidades({}); setAvisosCantidad({}); setErrorSeleccion('') }}><Square size={17} />Deseleccionar todos</button>
        </div>

        <div className="fl-helmet-pdf-list">
          {cascos.map((casco) => {
            const agotado = Number(casco.stock || 0) <= 0
            const deshabilitado = agotado && (!opciones.incluirAgotados || !permitirCopiasAdicionales)
            const cantidad = cantidades[casco.id] || 0
            return (
              <div key={casco.id} className={`fl-helmet-pdf-item${cantidad > 0 ? ' is-selected' : ''}${deshabilitado ? ' is-disabled' : ''}`}>
                <input type="checkbox" aria-label={`Seleccionar ${casco.nombre}`} checked={cantidad > 0} disabled={deshabilitado} onChange={() => alternarCasco(casco)} />
                <div className="fl-helmet-pdf-thumb">{casco.imagen_url ? <img src={casco.imagen_url} alt="" /> : <ImageOff size={23} aria-label="Sin imagen" />}</div>
                <div className="fl-helmet-pdf-data"><strong>{casco.nombre}</strong><span>{casco.codigo}</span><small>Talla: {casco.talla || '—'} · Certificación: {casco.certificacion || '—'}</small><small>${Number(casco.precio || 0).toLocaleString('es-MX')} · Stock disponible: {Number(casco.stock || 0)}</small></div>
                <span className={agotado ? 'is-out' : 'is-in'}>{agotado ? 'Agotado' : 'Disponible'}</span>
                <div className="fl-helmet-pdf-quantity">
                  <small>Cantidad para PDF</small>
                  <div><button type="button" aria-label={`Reducir cantidad de ${casco.nombre}`} onClick={() => establecerCantidad(casco, cantidad - 1)} disabled={cantidad === 0}>−</button><input type="number" min={0} max={permitirCopiasAdicionales ? undefined : Math.max(0, Number(casco.stock || 0))} value={cantidad} disabled={deshabilitado} aria-label={`Cantidad de etiquetas para ${casco.nombre}`} onChange={(e) => establecerCantidad(casco, Number(e.target.value))} /><button type="button" aria-label={`Aumentar cantidad de ${casco.nombre}`} onClick={() => establecerCantidad(casco, cantidad + 1)} disabled={deshabilitado}>+</button></div>
                  {avisosCantidad[casco.id] && <em role="status">{avisosCantidad[casco.id]}</em>}
                </div>
              </div>
            )
          })}
        </div>

        <footer>
          {errorSeleccion && <p role="alert">{errorSeleccion}</p>}
          <button type="button" className="is-cancel" onClick={onCancelar} disabled={generando}>Cancelar</button>
          <button type="button" className="is-generate" onClick={() => void generar()} disabled={etiquetasTotales === 0 || generando}><FileDown size={18} />Generar PDF</button>
        </footer>
      </section>
    </div>
  )
}
