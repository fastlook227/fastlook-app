'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Eye, ImageOff, Plus, X } from 'lucide-react'
import type { Producto } from '@/types'
import ImagenProducto from '@/components/ImagenProducto'

interface Props {
  producto: Producto
  onSeleccionar?: (producto: Producto, disparador: HTMLButtonElement) => void
  accion?: string
  disabled?: boolean
  mostrarCodigo?: boolean
  children?: ReactNode
}

export default function TarjetaProducto({ producto, onSeleccionar, accion = 'Agregar', disabled = false, mostrarCodigo = false, children }: Props) {
  const [detalle, setDetalle] = useState<{ left: number; top: number } | null>(null)
  const tarjetaRef = useRef<HTMLElement>(null)
  const temporizador = useRef<number | null>(null)
  const cierre = useRef<number | null>(null)
  const descripcion = typeof producto.descripcion === 'string' ? producto.descripcion.trim() : ''
  const cancelar = () => { if (temporizador.current !== null) window.clearTimeout(temporizador.current); if (cierre.current !== null) window.clearTimeout(cierre.current); temporizador.current = null; cierre.current = null }
  const abrir = useCallback(() => {
    const rect = tarjetaRef.current?.getBoundingClientRect(); if (!rect) return
    const margen = 12; const ancho = Math.min(360, window.innerWidth - margen * 2); const alto = Math.min(560, window.innerHeight - margen * 2)
    window.dispatchEvent(new CustomEvent('fastlook:detalle-producto', { detail: producto.id }))
    setDetalle({ left: Math.max(margen, Math.min(rect.left, window.innerWidth - ancho - margen)), top: Math.max(margen, Math.min(rect.top, window.innerHeight - alto - margen)) })
  }, [producto.id])
  const programar = () => { cancelar(); temporizador.current = window.setTimeout(abrir, 900) }
  const programarCierre = () => { if (temporizador.current !== null) window.clearTimeout(temporizador.current); cierre.current = window.setTimeout(() => setDetalle(null), 180) }
  useEffect(() => {
    const cerrarOtro = (evento: Event) => { if ((evento as CustomEvent<string>).detail !== producto.id) setDetalle(null) }
    const escape = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setDetalle(null) }
    window.addEventListener('fastlook:detalle-producto', cerrarOtro); document.addEventListener('keydown', escape)
    return () => { cancelar(); window.removeEventListener('fastlook:detalle-producto', cerrarOtro); document.removeEventListener('keydown', escape) }
  }, [producto.id])
  const imagen = producto.imagen_url ? <ImagenProducto src={producto.imagen_url} miniatura={producto.imagen_thumbnail_url} alt={producto.nombre} /> : <div className="fl-product-card-placeholder"><ImageOff aria-hidden="true" /><span>Sin imagen</span></div>
  const imagenDetalle = producto.imagen_url ? <ImagenProducto src={producto.imagen_url} alt={producto.nombre} /> : imagen
  const contenido = <><div className="fl-product-card-media">{imagen}</div><div className="fl-product-card-copy"><strong title={producto.nombre}>{producto.nombre}</strong>{descripcion ? <p title={descripcion}>{descripcion}</p> : <p aria-hidden="true">&nbsp;</p>}{mostrarCodigo && <small>{producto.codigo}</small>}<div><b>${Number(producto.precio).toFixed(2)}</b><span>Stock {producto.stock}</span></div></div></>
  return <article ref={tarjetaRef} className="fl-product-card" onMouseEnter={(e) => { if (e.buttons === 0) programar() }} onMouseLeave={programarCierre}>
    {onSeleccionar ? <button type="button" className="fl-product-card-select" disabled={disabled} onPointerDown={cancelar} onClick={(evento) => onSeleccionar(producto, evento.currentTarget)}>{contenido}<span className="fl-product-card-action"><Plus aria-hidden="true" /><span>{accion}</span></span></button> : <div className="fl-product-card-select">{contenido}</div>}
    <button type="button" className="fl-product-card-details-button" onClick={(evento) => { evento.stopPropagation(); abrir() }}><Eye aria-hidden="true" />Ver detalles</button>{children && <div className="fl-product-card-extra">{children}</div>}
    {detalle && createPortal(<aside className="fl-product-preview" style={detalle} role="dialog" aria-label={`Detalles de ${producto.nombre}`} onMouseEnter={cancelar} onMouseLeave={programarCierre}><button type="button" className="fl-product-preview-close" onClick={() => setDetalle(null)} aria-label="Cerrar detalles"><X /></button><div className="fl-product-preview-media">{imagenDetalle}</div><h3>{producto.nombre}</h3>{descripcion && <p>{descripcion}</p>}<dl><div><dt>Precio</dt><dd>${Number(producto.precio).toFixed(2)}</dd></div><div><dt>Existencias</dt><dd>{producto.stock}</dd></div>{producto.codigo && <div><dt>Código</dt><dd>{producto.codigo}</dd></div>}{producto.tipo && <div><dt>Tipo</dt><dd>{producto.tipo}</dd></div>}{producto.talla && <div><dt>Talla</dt><dd>{producto.talla}</dd></div>}{producto.certificacion && <div><dt>Certificación</dt><dd>{producto.certificacion}</dd></div>}{producto.ubicacion && <div><dt>Ubicación</dt><dd>{producto.ubicacion}</dd></div>}{producto.proveedor && <div><dt>Proveedor</dt><dd>{producto.proveedor}</dd></div>}</dl></aside>, document.body)}
  </article>
}
