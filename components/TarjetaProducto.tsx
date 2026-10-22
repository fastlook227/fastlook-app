'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
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
  const [detalle, setDetalle] = useState(false)
  const tituloDetalleId = useId()
  const botonDetalleRef = useRef<HTMLButtonElement>(null)
  const dialogoRef = useRef<HTMLElement>(null)
  const descripcion = typeof producto.descripcion === 'string' ? producto.descripcion.trim() : ''
  useEffect(() => {
    if (!detalle) return
    const overflowAnterior = document.body.style.overflow
    const escape = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setDetalle(false) }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', escape)
    dialogoRef.current?.focus()
    return () => {
      document.body.style.overflow = overflowAnterior
      document.removeEventListener('keydown', escape)
      botonDetalleRef.current?.focus()
    }
  }, [detalle])
  const imagen = producto.imagen_url ? <ImagenProducto src={producto.imagen_url} miniatura={producto.imagen_thumbnail_url} usarPrincipal={producto.usar_imagen_principal} alt={producto.nombre} /> : <div className="fl-product-card-placeholder"><ImageOff aria-hidden="true" /><span>Sin imagen</span></div>
  const imagenDetalle = producto.imagen_url ? <ImagenProducto src={producto.imagen_url} alt={producto.nombre} /> : imagen
  const contenido = <><div className="fl-product-card-media">{imagen}</div><div className="fl-product-card-copy"><strong title={producto.nombre}>{producto.nombre}</strong>{descripcion ? <p title={descripcion}>{descripcion}</p> : <p aria-hidden="true">&nbsp;</p>}{mostrarCodigo && <small>{producto.codigo}</small>}<div><b>${Number(producto.precio).toFixed(2)}</b><span>Stock {producto.stock}</span></div></div></>
  return <article className="fl-product-card">
    {onSeleccionar ? <button type="button" className="fl-product-card-select" disabled={disabled} onClick={(evento) => onSeleccionar(producto, evento.currentTarget)}>{contenido}<span className="fl-product-card-action"><Plus aria-hidden="true" /><span>{accion}</span></span></button> : <div className="fl-product-card-select">{contenido}</div>}
    <button ref={botonDetalleRef} type="button" className="fl-product-card-details-button" onClick={() => setDetalle(true)}><Eye aria-hidden="true" />Ver detalles</button>{children && <div className="fl-product-card-extra">{children}</div>}
    {detalle && createPortal(<div className="fl-product-details-backdrop" onMouseDown={(evento) => { if (evento.target === evento.currentTarget) setDetalle(false) }}><aside ref={dialogoRef} className="fl-product-details-dialog" role="dialog" aria-modal="true" aria-labelledby={tituloDetalleId} tabIndex={-1}><button type="button" className="fl-product-details-close" onClick={() => setDetalle(false)} aria-label="Cerrar detalles"><X /></button><div className="fl-product-details-media">{imagenDetalle}</div><h3 id={tituloDetalleId}>{producto.nombre}</h3>{descripcion && <p>{descripcion}</p>}<dl><div><dt>Precio</dt><dd>${Number(producto.precio).toFixed(2)}</dd></div><div><dt>Existencias</dt><dd>{producto.stock}</dd></div>{producto.codigo && <div><dt>Código</dt><dd>{producto.codigo}</dd></div>}{producto.tipo && <div><dt>Tipo</dt><dd>{producto.tipo}</dd></div>}{producto.talla && <div><dt>Talla</dt><dd>{producto.talla}</dd></div>}{producto.certificacion && <div><dt>Certificación</dt><dd>{producto.certificacion}</dd></div>}{producto.ubicacion && <div><dt>Ubicación</dt><dd>{producto.ubicacion}</dd></div>}{producto.proveedor && <div><dt>Proveedor</dt><dd>{producto.proveedor}</dd></div>}</dl></aside></div>, document.body)}
  </article>
}
