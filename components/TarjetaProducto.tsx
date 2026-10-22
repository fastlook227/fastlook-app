import type { ReactNode } from 'react'
import { ImageOff, Plus } from 'lucide-react'
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
  const contenido = <><div className="fl-product-card-media">{producto.imagen_url ? <ImagenProducto src={producto.imagen_url} miniatura={producto.imagen_thumbnail_url} alt={producto.nombre} /> : <div className="fl-product-card-placeholder"><ImageOff aria-hidden="true" /><span>Sin imagen</span></div>}</div><div className="fl-product-card-copy"><strong>{producto.nombre}</strong>{mostrarCodigo && <small>{producto.codigo}</small>}<div><b>${Number(producto.precio).toFixed(2)}</b><span>Stock {producto.stock}</span></div></div></>
  return <article className="fl-product-card">{onSeleccionar ? <button type="button" className="fl-product-card-select" disabled={disabled} onClick={(evento) => onSeleccionar(producto, evento.currentTarget)}>{contenido}<span className="fl-product-card-action"><Plus aria-hidden="true" />{accion}</span></button> : <div className="fl-product-card-select">{contenido}</div>}{children && <div className="fl-product-card-extra">{children}</div>}</article>
}
