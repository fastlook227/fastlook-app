'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, ScanLine, ShoppingCart, Trash2, X } from 'lucide-react'
import type { CarritoLinea, Producto, Venta } from '@/types'
import type { FiltrosProductos as EstadoFiltrosProductos } from '@/utils/filtrosProductos'
import { contarFiltrosActivos } from '@/utils/filtrosProductos'
import { obtenerProductosFrecuentes, obtenerUltimosProductosVendidos, resumirCarritoVenta } from '@/utils/ventaRapida'
import { claveLinea, esLineaInventario, obtenerNombreLinea, obtenerPrecioLinea } from '@/utils/carritoMixto'
import FiltrosProductos from '@/components/FiltrosProductos'

interface Props {
  productos: readonly Producto[]
  resultados: readonly Producto[]
  ventas: readonly Venta[]
  carrito: readonly CarritoLinea[]
  busqueda: string
  filtros: EstadoFiltrosProductos
  procesando: boolean
  scannerContinuo: boolean
  esAdmin: boolean
  feedback: { tipo: 'ok' | 'error'; mensaje: string; nombre?: string; cantidad?: number } | null
  onBusqueda: (valor: string) => void
  onFiltros: (filtros: EstadoFiltrosProductos) => void
  onAgregar: (producto: Producto) => void
  onAumentar: (id: string) => void
  onDisminuir: (id: string) => void
  onCantidad: (id: string, cantidad: number) => void
  onEliminar: (id: string) => void
  onEscanear: (elemento: HTMLElement) => void
  onScannerContinuo: (activo: boolean) => void
  onEnter: () => void
  onCobrar: (metodo: string) => Promise<boolean>
}

export default function VentaRapida(props: Props) {
  const [carritoAbierto, setCarritoAbierto] = useState(false)
  const [cobroAbierto, setCobroAbierto] = useState(false)
  const buscadorRef = useRef<HTMLInputElement>(null)
  const frecuentes = useMemo(() => obtenerProductosFrecuentes(props.productos, props.ventas, 10), [props.productos, props.ventas])
  const ultimos = useMemo(() => obtenerUltimosProductosVendidos(props.productos, props.ventas, 8), [props.productos, props.ventas])
  const resumen = useMemo(() => resumirCarritoVenta(props.carrito), [props.carrito])
  const hayExploracion = Boolean(props.busqueda.trim() || contarFiltrosActivos(props.filtros))

  const enfocarBuscador = () => {
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) requestAnimationFrame(() => buscadorRef.current?.focus())
  }
  useEffect(() => { enfocarBuscador() }, [])

  const agregar = (producto: Producto) => { props.onAgregar(producto); enfocarBuscador() }
  const cobrar = async (metodo: string) => {
    const ok = await props.onCobrar(metodo)
    if (ok) { setCobroAbierto(false); setCarritoAbierto(false); enfocarBuscador() }
  }

  return <div className="fl-quick-sale">
    <div className="fl-quick-sale-main">
      <div className="fl-quick-scanner"><button type="button" onClick={(evento) => props.onEscanear(evento.currentTarget)}><ScanLine size={20} />Escanear con cámara</button><label><input type="checkbox" checked={props.scannerContinuo} onChange={(e) => props.onScannerContinuo(e.target.checked)} />Continuo</label><small>Pistola: escanea y presiona Enter</small></div>
      <FiltrosProductos contexto="venta" productos={props.productos} busqueda={props.busqueda} filtros={props.filtros} totalResultados={props.resultados.length} esAdmin={props.esAdmin} inputRef={buscadorRef} onBusqueda={props.onBusqueda} onFiltros={props.onFiltros} onEnter={props.onEnter} />

      {props.feedback && <div className={`fl-quick-feedback is-${props.feedback.tipo}`} role="status"><strong>{props.feedback.mensaje}</strong>{props.feedback.nombre && <span>{props.feedback.nombre}</span>}{props.feedback.cantidad !== undefined && <small>Cantidad: {props.feedback.cantidad}</small>}</div>}

      {!hayExploracion && frecuentes.length > 0 && <CarruselProductos titulo="Frecuentes" productos={frecuentes} onAgregar={agregar} />}
      {!hayExploracion && ultimos.length > 0 && <CarruselProductos titulo="Últimos vendidos" productos={ultimos} onAgregar={agregar} />}

      {hayExploracion && <section className="fl-quick-results"><header><h3>Resultados</h3><span>{props.resultados.length}</span></header>{props.resultados.length > 0 ? props.resultados.map((producto) => <button type="button" key={producto.id} disabled={Number(producto.stock) <= 0 || props.procesando} onClick={() => agregar(producto)}><span><strong>{producto.nombre}</strong><small>{producto.codigo}</small></span><span><b>${Number(producto.precio).toFixed(2)}</b><small>Stock {producto.stock}</small></span><Plus aria-label="Agregar" /></button>) : <div className="fl-quick-empty"><strong>No encontramos productos para: “{props.busqueda}”</strong><button type="button" onClick={() => props.onBusqueda('')}>Limpiar búsqueda</button></div>}</section>}
    </div>

    <aside className="fl-quick-cart-desktop"><CarritoRapido {...props} resumen={resumen} onCobrar={() => setCobroAbierto(true)} /></aside>
    <button type="button" className="fl-quick-cart-bar" onClick={() => setCarritoAbierto(true)}><span><ShoppingCart size={20} /><b>{resumen.unidades} producto{resumen.unidades === 1 ? '' : 's'}</b><strong>${resumen.total.toFixed(2)}</strong></span><em>Cobrar</em></button>

    {carritoAbierto && <div className="fl-quick-sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setCarritoAbierto(false) }}><section className="fl-quick-cart-sheet" role="dialog" aria-modal="true" aria-label="Carrito rápido"><header><h2>Ticket actual</h2><button type="button" onClick={() => setCarritoAbierto(false)} aria-label="Cerrar"><X /></button></header><CarritoRapido {...props} resumen={resumen} onCobrar={() => setCobroAbierto(true)} /></section></div>}
    {cobroAbierto && <div className="fl-quick-payment-backdrop"><section className="fl-quick-payment" role="dialog" aria-modal="true" aria-labelledby="titulo-cobro-rapido"><header><div><small>Total a cobrar</small><h2 id="titulo-cobro-rapido">${resumen.total.toFixed(2)}</h2></div><button type="button" onClick={() => setCobroAbierto(false)} disabled={props.procesando} aria-label="Cerrar"><X /></button></header><p>Selecciona el método de pago</p><div>{['Efectivo', 'Transferencia', 'Tarjeta'].map((metodo) => <button type="button" key={metodo} disabled={props.procesando || !props.carrito.length} onClick={() => void cobrar(metodo)}>{props.procesando ? 'Cobrando…' : metodo}</button>)}</div></section></div>}
  </div>
}

function CarruselProductos({ titulo, productos, onAgregar }: { titulo: string; productos: readonly Producto[]; onAgregar: (producto: Producto) => void }) {
  return <section className="fl-quick-products"><h3>{titulo}</h3><div>{productos.map((producto) => <button type="button" key={producto.id} disabled={Number(producto.stock) <= 0} onClick={() => onAgregar(producto)}><strong>{producto.nombre}</strong><span><b>${Number(producto.precio).toFixed(2)}</b><small>Stock {producto.stock}</small></span></button>)}</div></section>
}

function CarritoRapido(props: Pick<Props, 'carrito' | 'procesando' | 'onAumentar' | 'onDisminuir' | 'onCantidad' | 'onEliminar'> & { resumen: { unidades: number; total: number }; onCobrar: () => void }) {
  return <div className="fl-quick-cart"><div className="fl-quick-cart-items">{props.carrito.length ? props.carrito.map((item) => { const id=claveLinea(item),nombre=obtenerNombreLinea(item),precio=obtenerPrecioLinea(item),stock=esLineaInventario(item)?item.producto.stock:undefined; return <article key={id}><div><strong>{nombre}</strong><small>${precio.toFixed(2)}{stock===undefined?' · Personalizado':` · Máx. ${stock}`}</small></div><div className="fl-quick-quantity"><button type="button" disabled={props.procesando} onClick={() => props.onDisminuir(id)}><Minus /></button><input type="number" min="1" max={stock} inputMode="numeric" disabled={props.procesando} value={item.cantidad} aria-label={`Cantidad de ${nombre}`} onChange={(e) => props.onCantidad(id, Number(e.target.value))} /><button type="button" disabled={props.procesando || (stock!==undefined&&item.cantidad>=Number(stock))} onClick={() => props.onAumentar(id)}><Plus /></button></div><strong>${(precio*item.cantidad).toFixed(2)}</strong><button type="button" className="is-remove" disabled={props.procesando} onClick={() => props.onEliminar(id)} aria-label={`Eliminar ${nombre}`}><Trash2 /></button></article> }) : <div className="fl-quick-cart-empty">Agrega un producto para comenzar.</div>}</div><footer><span><small>{props.resumen.unidades} unidades</small><strong>${props.resumen.total.toFixed(2)}</strong></span><button type="button" disabled={props.procesando || !props.carrito.length} onClick={props.onCobrar}>{props.procesando ? 'Cobrando…' : 'Cobrar'}</button></footer></div>
}
