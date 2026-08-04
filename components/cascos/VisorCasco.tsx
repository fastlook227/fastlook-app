'use client'

import { Minus, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CascoCatalogo } from '@/types/cascos'

interface VisorCascoProps {
  casco: CascoCatalogo
  onCerrar: () => void
}

export default function VisorCasco({ casco, onCerrar }: VisorCascoProps) {
  const [zoom, setZoom] = useState(1)
  const modalRef = useRef<HTMLDivElement>(null)
  const cerrarRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cerrarRef.current?.focus()
    const teclado = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar()
      if (evento.key !== 'Tab' || !modalRef.current) return
      const controles = [...modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
      if (!controles.length) return
      const primero = controles[0]
      const ultimo = controles[controles.length - 1]
      if (evento.shiftKey && document.activeElement === primero) { evento.preventDefault(); ultimo.focus() }
      if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primero.focus() }
    }
    document.addEventListener('keydown', teclado)
    return () => {
      document.body.style.overflow = overflowAnterior
      document.removeEventListener('keydown', teclado)
    }
  }, [onCerrar])

  return (
    <div className="fl-helmet-viewer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar() }}>
      <div ref={modalRef} className="fl-helmet-viewer" role="dialog" aria-modal="true" aria-labelledby="visor-casco-titulo">
        <button ref={cerrarRef} type="button" className="fl-helmet-viewer-close" onClick={onCerrar} aria-label="Cerrar visor"><X size={23} /></button>
        <div className="fl-helmet-viewer-image">
          {casco.imagen_url ? <img src={casco.imagen_url} alt={casco.nombre} style={{ transform: `scale(${zoom})` }} /> : <p>Imagen no disponible</p>}
        </div>
        <div className="fl-helmet-viewer-info"><div><h2 id="visor-casco-titulo">{casco.nombre}</h2><p>Talla {casco.talla?.trim() || 'Sin especificar'} · {casco.certificacion?.trim() || 'Sin certificación'}</p><strong>${Number(casco.precio || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong></div><div className="fl-helmet-zoom" aria-label="Controles de zoom"><button type="button" onClick={() => setZoom((actual) => Math.max(1, actual - .25))} disabled={zoom <= 1} aria-label="Alejar"><Minus size={19} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((actual) => Math.min(2, actual + .25))} disabled={zoom >= 2} aria-label="Acercar"><Plus size={19} /></button></div></div>
      </div>
    </div>
  )
}
