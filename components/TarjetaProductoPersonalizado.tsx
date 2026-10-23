'use client'

import { PackagePlus, Sparkles } from 'lucide-react'

export default function TarjetaProductoPersonalizado({ onSeleccionar }: { onSeleccionar: () => void }) {
  return <article className="fl-product-card fl-product-card--custom">
    <button type="button" className="fl-product-card-select" onClick={onSeleccionar} aria-label="Abrir formulario de Producto personalizado">
      <div className="fl-product-card-media fl-product-card-custom-media"><PackagePlus aria-hidden="true" /><span>CREAR</span></div>
      <div className="fl-product-card-copy"><strong>Producto personalizado</strong><p>Agrega un producto o servicio con precio a medida.</p><div><b>Precio libre</b><span>Sin inventario</span></div></div>
      <span className="fl-product-card-action"><Sparkles aria-hidden="true" /><span>Personalizar</span></span>
    </button>
    <div className="fl-product-card-details-button fl-product-card-custom-note"><PackagePlus aria-hidden="true" />Acción especial</div>
  </article>
}
