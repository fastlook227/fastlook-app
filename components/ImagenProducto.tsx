'use client'

import { useEffect, useState, type CSSProperties } from 'react'

interface Props {
  src: string
  miniatura?: string | null
  alt: string
  className?: string
  style?: CSSProperties
}

export default function ImagenProducto({ src, miniatura, alt, className, style }: Props) {
  const [fuente, setFuente] = useState(miniatura || src)
  const [fallida, setFallida] = useState(false)
  useEffect(() => { setFuente(miniatura || src); setFallida(false) }, [miniatura, src])
  if (fallida) return <span className={`fl-image-fallback${className ? ` ${className}` : ''}`} style={style} role="img" aria-label={`Imagen no disponible de ${alt}`}>Imagen no disponible</span>
  return <img src={fuente} alt={alt} className={className} style={style} loading="lazy" decoding="async" fetchPriority="low" onError={() => { if (fuente !== src) setFuente(src); else setFallida(true) }} />
}
