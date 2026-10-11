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
  useEffect(() => setFuente(miniatura || src), [miniatura, src])
  return <img src={fuente} alt={alt} className={className} style={style} loading="lazy" decoding="async" fetchPriority="low" onError={() => { if (fuente !== src) setFuente(src) }} />
}
