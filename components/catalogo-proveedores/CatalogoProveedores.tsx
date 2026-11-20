'use client'

import { AlertTriangle, Link2, PackageSearch, RefreshCw, Search, ShoppingCart, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import type { ProductoCatalogoProveedor, ResumenCatalogoProveedor } from '@/types/catalogoProveedores'
import ImagenProducto from '@/components/ImagenProducto'

export default function CatalogoProveedores({ onAgregar, ventaHabilitada }: { onAgregar: (producto: ProductoCatalogoProveedor) => void; ventaHabilitada: boolean }) {
  const [catalogo, setCatalogo] = useState<ResumenCatalogoProveedor>({ productos: [], proveedores: [], es_admin: false })
  const [busqueda, setBusqueda] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Tu sesión terminó. Inicia sesión nuevamente.')
      const parametros = new URLSearchParams({ q: busqueda.trim(), limite: '60' })
      if (proveedor) parametros.set('proveedor', proveedor)
      const respuesta = await fetch(`/api/catalogo-proveedores?${parametros}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const cuerpo = await respuesta.json().catch(() => null) as { ok?: boolean; mensaje?: string; catalogo?: ResumenCatalogoProveedor } | null
      if (!respuesta.ok || !cuerpo?.catalogo) throw new Error(cuerpo?.mensaje || 'No fue posible consultar el catálogo.')
      setCatalogo(cuerpo.catalogo)
    } catch (causa) { setError(causa instanceof Error ? causa.message : 'No fue posible consultar el catálogo.') }
    finally { setCargando(false) }
  }, [busqueda, proveedor])

  useEffect(() => { const t = window.setTimeout(() => void cargar(), 250); return () => window.clearTimeout(t) }, [cargar])
  const vinculados = useMemo(() => catalogo.productos.filter((p) => p.inventario_producto_id).length, [catalogo.productos])

  return <section className="fl-supplier-catalog">
    <header className="fl-supplier-hero">
      <div><span>ABASTECIMIENTO</span><h1>Catálogo de proveedores</h1><p>Consulta referencias externas sin convertirlas en inventario físico.</p></div>
      <div className="fl-supplier-stats"><strong>{catalogo.productos.length}</strong><span>resultados</span><strong>{vinculados}</strong><span>vinculados</span></div>
    </header>
    <div className="fl-supplier-toolbar">
      <label><Search size={18} /><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, código, categoría o compatibilidad" /></label>
      <select value={proveedor} onChange={(e) => setProveedor(e.target.value)} aria-label="Proveedor"><option value="">Todos los proveedores</option>{catalogo.proveedores.map((p) => <option key={p.id} value={p.clave}>{p.nombre}</option>)}</select>
      <button type="button" onClick={() => void cargar()} disabled={cargando}><RefreshCw size={17} />Actualizar</button>
    </div>
    {error && <p className="fl-supplier-error" role="alert"><AlertTriangle />{error}</p>}
    {cargando ? <div className="fl-supplier-empty"><RefreshCw className="is-spinning" /><p>Cargando catálogo…</p></div> : !catalogo.productos.length ? <div className="fl-supplier-empty"><PackageSearch /><h2>Sin productos publicados</h2><p>Las importaciones permanecen en vista previa hasta que un administrador las revise.</p></div> : <div className="fl-supplier-grid">
      {catalogo.productos.map((producto) => <TarjetaProveedor key={producto.id} producto={producto} esAdmin={catalogo.es_admin} nivelCompra={catalogo.proveedores.find((p) => p.id === producto.proveedor_id)?.nivel_compra ?? null} ventaHabilitada={ventaHabilitada} onAgregar={onAgregar} />)}
    </div>}
  </section>
}

function TarjetaProveedor({ producto, esAdmin, nivelCompra, ventaHabilitada, onAgregar }: { producto: ProductoCatalogoProveedor; esAdmin: boolean; nivelCompra: string | null; ventaHabilitada: boolean; onAgregar: (producto: ProductoCatalogoProveedor) => void }) {
  const precio = producto.inventario_precio ?? producto.precio_venta ?? producto.precio_venta_sugerido
  // Costo del nivel comercial configurado (el mismo que usa el servidor), no la oferta más barata.
  const oferta = producto.ofertas.find((o) => o.nivel === nivelCompra)
  const [detalle, setDetalle] = useState(false)
  const tituloId = useId()
  useEffect(() => {
    if (!detalle) return
    const escape = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setDetalle(false) }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [detalle])
  return <article className="fl-supplier-card">
    <div className="fl-supplier-badge">PRODUCTO DE PROVEEDOR</div>
    {/* Sin foto original verificada: marcador neutral (nunca una imagen genérica presentada como del producto). */}
    <button type="button" className="fl-supplier-image" onClick={() => setDetalle(true)} aria-label={`Ver detalles de ${producto.nombre}`}>{producto.imagen_url ? <ImagenProducto src={producto.imagen_url} miniatura={producto.imagen_thumbnail_url} alt={producto.nombre} /> : <><PackageSearch aria-hidden="true" /><small>Sin fotografía del proveedor</small></>}</button>
    {detalle && createPortal(<div className="fl-product-details-backdrop" onMouseDown={(evento) => { if (evento.target === evento.currentTarget) setDetalle(false) }}><aside className="fl-product-details-dialog" role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1} ref={(nodo) => nodo?.focus()}>
      <button type="button" className="fl-product-details-close" onClick={() => setDetalle(false)} aria-label="Cerrar detalles"><X /></button>
      <div className="fl-product-details-media">{producto.imagen_url ? <ImagenProducto src={producto.imagen_url} miniatura={producto.imagen_thumbnail_url} usarPrincipal alt={producto.nombre} /> : <PackageSearch aria-hidden="true" />}</div>
      <h3 id={tituloId}>{producto.nombre}</h3>{producto.descripcion && <p>{producto.descripcion}</p>}
      <dl><div><dt>Precio de venta</dt><dd>{precio == null ? 'Por revisar' : `$${Number(precio).toFixed(2)}`}</dd></div><div><dt>Código del proveedor</dt><dd>{producto.codigo_original}</dd></div><div><dt>Proveedor</dt><dd>{producto.proveedor_nombre}</dd></div>
        {producto.categoria && <div><dt>Categoría</dt><dd>{producto.categoria}</dd></div>}{producto.marca && <div><dt>Marca</dt><dd>{producto.marca}</dd></div>}
        {producto.compatibilidades.length > 0 && <div><dt>Compatibilidad</dt><dd>{producto.compatibilidades.join(', ')}</dd></div>}
        <div><dt>Existencias</dt><dd>{producto.inventario_producto_id ? 'Según inventario FAST LOOK (vinculado)' : 'Sin inventario físico: pedido al proveedor'}</dd></div></dl>
    </aside></div>, document.body)}
    <div className="fl-supplier-copy"><small>{producto.proveedor_nombre}</small><h2>{producto.nombre}</h2><code>{producto.codigo_original}</code>
      {producto.descripcion && <p>{producto.descripcion}</p>}{producto.compatibilidades.length > 0 && <span>Compatible: {producto.compatibilidades.slice(0, 3).join(', ')}</span>}
      {producto.ambiguo && <span className="is-warning"><AlertTriangle size={14} />Familia o variante pendiente de identificar</span>}
      {producto.inventario_producto_id && <span className="is-linked"><Link2 size={14} />Vinculado al inventario FAST LOOK</span>}
    </div>
    <footer><div><span>Precio de venta</span><strong>{precio == null ? 'Por revisar' : `$${Number(precio).toFixed(2)}`}</strong>{producto.precio_actualizado_at && <small>Actualizado {new Date(producto.precio_actualizado_at).toLocaleDateString('es-MX')}</small>}</div>
      {esAdmin && oferta && <div className="fl-supplier-cost"><span>Costo {oferta.nivel}</span><b>${Number(oferta.costo_efectivo).toFixed(2)}</b></div>}
      <button type="button" disabled={!ventaHabilitada || precio == null || producto.ambiguo} onClick={() => onAgregar(producto)} title={!ventaHabilitada ? 'La venta de artículos de proveedor está desactivada' : producto.ambiguo ? 'La referencia debe revisarse antes de venderse' : producto.inventario_producto_id ? 'Se añade como producto FAST LOOK vinculado' : 'Añadir sin crear inventario ficticio'}><ShoppingCart size={17} />Añadir</button>
    </footer>
  </article>
}
