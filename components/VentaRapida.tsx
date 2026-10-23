'use client'

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { ScanLine } from 'lucide-react'
import type { Producto, Venta } from '@/types'
import type { FiltrosProductos as EstadoFiltrosProductos } from '@/utils/filtrosProductos'
import { contarFiltrosActivos } from '@/utils/filtrosProductos'
import { obtenerProductosFrecuentes, obtenerUltimosProductosVendidos } from '@/utils/ventaRapida'
import FiltrosProductos from '@/components/FiltrosProductos'
import TarjetaProducto from '@/components/TarjetaProducto'
import TarjetaProductoPersonalizado from '@/components/TarjetaProductoPersonalizado'
import CargarMasProductos from '@/components/CargarMasProductos'
import useListaProgresiva from '@/hooks/useListaProgresiva'

interface Props {
  productos: readonly Producto[]
  resultados: readonly Producto[]
  ventas: readonly Venta[]
  busqueda: string
  filtros: EstadoFiltrosProductos
  procesando: boolean
  scannerContinuo: boolean
  esAdmin: boolean
  feedback: { tipo: 'ok' | 'error'; mensaje: string; nombre?: string; cantidad?: number } | null
  onBusqueda: (valor: string) => void
  onFiltros: (filtros: EstadoFiltrosProductos) => void
  onAgregar: (producto: Producto) => void
  onEscanear: (elemento: HTMLElement) => void
  onScannerContinuo: (activo: boolean) => void
  onEnter: () => void
  onAbrirPersonalizado: () => void
  accionesBusqueda: ReactNode
}

export default function VentaRapida(props: Props) {
  const buscadorRef = useRef<HTMLInputElement>(null)
  const frecuentes = useMemo(() => obtenerProductosFrecuentes(props.productos, props.ventas, 10), [props.productos, props.ventas])
  const ultimos = useMemo(() => obtenerUltimosProductosVendidos(props.productos, props.ventas, 8), [props.productos, props.ventas])
  const hayExploracion = Boolean(props.busqueda.trim() || contarFiltrosActivos(props.filtros))
  const resultados = useMemo(() => Array.from(props.resultados), [props.resultados])
  const listaResultados = useListaProgresiva(resultados)

  const enfocarBuscador = () => {
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) requestAnimationFrame(() => buscadorRef.current?.focus())
  }
  useEffect(() => { enfocarBuscador() }, [])

  const agregar = (producto: Producto) => { props.onAgregar(producto); enfocarBuscador() }
  return <div className="fl-quick-sale">
    <div className="fl-quick-sale-main">
      <FiltrosProductos contexto="venta" productos={props.productos} busqueda={props.busqueda} filtros={props.filtros} totalResultados={props.resultados.length} esAdmin={props.esAdmin} inputRef={buscadorRef} onBusqueda={props.onBusqueda} onFiltros={props.onFiltros} onEnter={props.onEnter} accionesBusqueda={props.accionesBusqueda} accionesFiltros={<><button type="button" className="fl-filter-scanner" onClick={(evento) => props.onEscanear(evento.currentTarget)}><ScanLine size={17} />Cámara</button><label className="fl-filter-continuous"><input type="checkbox" checked={props.scannerContinuo} onChange={(e) => props.onScannerContinuo(e.target.checked)} />Continuo</label></>} />

      {props.feedback && <div className={`fl-quick-feedback is-${props.feedback.tipo}`} role="status"><strong>{props.feedback.mensaje}</strong>{props.feedback.nombre && <span>{props.feedback.nombre}</span>}{props.feedback.cantidad !== undefined && <small>Cantidad: {props.feedback.cantidad}</small>}</div>}

      {!hayExploracion && frecuentes.length > 0 && <CarruselProductos titulo="Frecuentes" productos={frecuentes} onAgregar={agregar} mostrarPersonalizado={props.esAdmin} onAbrirPersonalizado={props.onAbrirPersonalizado} />}
      {!hayExploracion && ultimos.length > 0 && <CarruselProductos titulo="Últimos vendidos" productos={ultimos} onAgregar={agregar} mostrarPersonalizado={props.esAdmin && frecuentes.length === 0} onAbrirPersonalizado={props.onAbrirPersonalizado} />}
      {!hayExploracion && frecuentes.length === 0 && ultimos.length === 0 && props.esAdmin && <section className="fl-quick-products"><h3>Productos</h3><div><TarjetaProductoPersonalizado onSeleccionar={props.onAbrirPersonalizado} /></div></section>}

      {hayExploracion && <section className="fl-quick-results"><header><h3>Resultados</h3><span>{props.resultados.length}</span></header><div className="fl-product-grid">{props.esAdmin && <TarjetaProductoPersonalizado onSeleccionar={props.onAbrirPersonalizado} />}{listaResultados.visibles.map((producto) => <TarjetaProducto key={producto.id} producto={producto} mostrarCodigo accion="Agregar" disabled={Number(producto.stock) <= 0 || props.procesando} onSeleccionar={agregar} />)}</div>{props.resultados.length > 0 ? <CargarMasProductos visibles={listaResultados.visibles.length} total={listaResultados.total} onCargarMas={listaResultados.cargarMas} /> : <div className="fl-quick-empty"><strong>No encontramos productos para: “{props.busqueda}”</strong><button type="button" onClick={() => props.onBusqueda('')}>Limpiar búsqueda</button></div>}</section>}
    </div>
  </div>
}

function CarruselProductos({ titulo, productos, onAgregar, mostrarPersonalizado, onAbrirPersonalizado }: { titulo: string; productos: readonly Producto[]; onAgregar: (producto: Producto) => void; mostrarPersonalizado: boolean; onAbrirPersonalizado: () => void }) {
  return <section className="fl-quick-products"><h3>{titulo}</h3><div>{mostrarPersonalizado && <TarjetaProductoPersonalizado onSeleccionar={onAbrirPersonalizado} />}{productos.map((producto) => <TarjetaProducto key={producto.id} producto={producto} disabled={Number(producto.stock) <= 0} onSeleccionar={onAgregar} />)}</div></section>
}
