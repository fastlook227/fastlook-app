'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { elegirFuentesImagen } from '@/utils/fuenteImagen'

interface Props {
  src: string
  miniatura?: string | null
  alt: string
  className?: string
  style?: CSSProperties
  usarPrincipal?: boolean | null
}

// Sólo se descarga la fuente elegida; la alterna se pide únicamente si la primera falla.
export default function ImagenProducto({ src, miniatura, alt, className, style, usarPrincipal = false }: Props) {
  const { preferida: fuentePreferida, alterna: fuenteAlterna } = elegirFuentesImagen(src, miniatura, usarPrincipal)
  const [fuente, setFuente] = useState(fuentePreferida)
  const [fallida, setFallida] = useState(false)
  useEffect(() => {
    setFuente(fuentePreferida)
    setFallida(false)
  }, [fuentePreferida])

  const clases = [className, fuente === src ? 'fl-image-full' : ''].filter(Boolean).join(' ') || undefined
  if (fallida) return <span className={`fl-image-fallback${className ? ` ${className}` : ''}`} style={style} role="img" aria-label={`Imagen no disponible de ${alt}`}>Imagen no disponible</span>
  return <img src={fuente} alt={alt} className={clases} style={style} data-fuente={fuente === src ? 'principal' : 'miniatura'} loading="lazy" decoding="async" fetchPriority="low" onError={() => { if (fuente === fuentePreferida && fuenteAlterna) setFuente(fuenteAlterna); else setFallida(true) }} />
}
