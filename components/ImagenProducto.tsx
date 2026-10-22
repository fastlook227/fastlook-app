'use client'

import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react'

interface Props {
  src: string
  miniatura?: string | null
  alt: string
  className?: string
  style?: CSSProperties
  comprobarMiniaturaAntigua?: boolean
}

export default function ImagenProducto({ src, miniatura, alt, className, style, comprobarMiniaturaAntigua = false }: Props) {
  const [fuente, setFuente] = useState(miniatura || src)
  const [fallida, setFallida] = useState(false)
  const comprobacion = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    comprobacion.current = null
    setFuente(miniatura || src)
    setFallida(false)
    return () => { comprobacion.current = null }
  }, [miniatura, src])

  const comprobarEncuadre = (evento: SyntheticEvent<HTMLImageElement>) => {
    if (!comprobarMiniaturaAntigua || !miniatura || fuente !== miniatura || miniatura === src) return
    const imagen = evento.currentTarget
    const proporcionMiniatura = imagen.naturalWidth / imagen.naturalHeight
    if (Math.abs(proporcionMiniatura - 1) > 0.02) return

    const principal = new Image()
    comprobacion.current = principal
    principal.onload = () => {
      if (comprobacion.current !== principal) return
      const proporcionPrincipal = principal.naturalWidth / principal.naturalHeight
      if (Math.abs(proporcionPrincipal - proporcionMiniatura) > 0.12) setFuente(src)
    }
    principal.src = src
  }

  if (fallida) return <span className={`fl-image-fallback${className ? ` ${className}` : ''}`} style={style} role="img" aria-label={`Imagen no disponible de ${alt}`}>Imagen no disponible</span>
  return <img src={fuente} alt={alt} className={className} style={style} loading="lazy" decoding="async" fetchPriority="low" onLoad={comprobarEncuadre} onError={() => { if (fuente !== src) setFuente(src); else setFallida(true) }} />
}
