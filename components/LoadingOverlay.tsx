'use client'

import { useEffect, useRef } from 'react'

interface LoadingOverlayProps {
  visible: boolean
  titulo?: string
  detalle?: string
  progreso?: number
}

export default function LoadingOverlay({
  visible,
  titulo = 'Procesando tu solicitud...',
  detalle = 'Esto puede tardar unos segundos.',
  progreso,
}: LoadingOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible) return
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    overlayRef.current?.focus()
    return () => { document.body.style.overflow = overflowAnterior }
  }, [visible])

  if (!visible) return null
  const progresoSeguro = progreso === undefined ? undefined : Math.min(100, Math.max(0, progreso))

  return (
    <div ref={overlayRef} className="fl-loading-overlay" role="status" aria-live="assertive" aria-busy="true" tabIndex={-1}>
      <div className="fl-loading-card">
        <img className="fl-loading-logo" src="https://i.postimg.cc/T1KLqYXb/Chat-GPT-Image-4-dic-2025-11-34-20-p-m.png" alt="FAST LOOK" />
        <h2>{titulo}</h2>
        {detalle && <p>{detalle}</p>}
        {progresoSeguro !== undefined && (
          <div className="fl-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresoSeguro}>
            <span style={{ width: `${progresoSeguro}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}
