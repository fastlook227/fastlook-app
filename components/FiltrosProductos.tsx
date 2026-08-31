'use client'

import { useEffect, useMemo, useState } from 'react'
import { Filter, Search, X } from 'lucide-react'
import type { Producto } from '@/types'
import {
  contarFiltrosActivos,
  crearFiltrosProductosVacios,
  obtenerOpcionesFiltrosProductos,
  type FiltrosProductos,
  type OpcionesFiltrosProductos,
  type OrdenProductos,
} from '@/utils/filtrosProductos'

interface Props {
  contexto: 'venta' | 'inventario'
  productos: readonly Producto[]
  busqueda: string
  filtros: FiltrosProductos
  totalResultados: number
  esAdmin: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
  onBusqueda: (valor: string) => void
  onFiltros: (filtros: FiltrosProductos) => void
  onEnter?: () => void
}

const numeroOpcional = (valor: string) => valor.trim() === '' ? null : Number(valor)

export default function FiltrosProductos({
  contexto, productos, busqueda, filtros, totalResultados, esAdmin, inputRef, onBusqueda, onFiltros, onEnter,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const opciones = useMemo(() => obtenerOpcionesFiltrosProductos(productos), [productos])
  const capacidades: OpcionesFiltrosProductos = useMemo(() => ({
    permitirBarcode: contexto === 'inventario',
    permitirImagen: contexto === 'inventario',
    permitirPrecio: contexto === 'inventario',
    permitirCosto: contexto === 'inventario' && esAdmin,
  }), [contexto, esAdmin])
  const activos = contarFiltrosActivos(filtros, capacidades)

  useEffect(() => {
    if (!abierto) return
    const cerrar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setAbierto(false) }
    document.addEventListener('keydown', cerrar)
    return () => document.removeEventListener('keydown', cerrar)
  }, [abierto])

  const actualizar = (cambio: Partial<FiltrosProductos>) => onFiltros({ ...filtros, ...cambio })
  const alternarSet = (campo: 'tipos' | 'proveedores' | 'ubicaciones', valor: string) => {
    const siguiente = new Set(filtros[campo])
    if (siguiente.has(valor)) siguiente.delete(valor)
    else siguiente.add(valor)
    actualizar({ [campo]: siguiente })
  }
  const limpiarFiltros = () => onFiltros(crearFiltrosProductosVacios())
  const limpiarTodo = () => {
    onBusqueda('')
    onFiltros(crearFiltrosProductosVacios())
    setAbierto(false)
  }
  const activarStock = (stock: FiltrosProductos['stock']) => actualizar({ stock, preset: 'ninguno' })

  const ordenes: Array<[OrdenProductos, string]> = [
    ['nombre-asc', 'Nombre A–Z'], ['nombre-desc', 'Nombre Z–A'],
    ['stock-asc', 'Stock menor → mayor'], ['stock-desc', 'Stock mayor → menor'],
    ['precio-asc', 'Precio menor → mayor'], ['precio-desc', 'Precio mayor → menor'],
    ['codigo-asc', 'Código Fast Look'], ['ubicacion-asc', 'Ubicación'],
    ...(contexto === 'inventario' && esAdmin
      ? [['costo-asc', 'Costo menor → mayor'], ['costo-desc', 'Costo mayor → menor']] as Array<[OrdenProductos, string]>
      : []),
  ]

  const resumen = [
    ...[...filtros.tipos].map((valor) => ({ clave: `tipo-${valor}`, texto: valor, quitar: () => alternarSet('tipos', valor) })),
    ...[...filtros.proveedores].map((valor) => ({ clave: `proveedor-${valor}`, texto: valor, quitar: () => alternarSet('proveedores', valor) })),
    ...[...filtros.ubicaciones].map((valor) => ({ clave: `ubicacion-${valor}`, texto: valor, quitar: () => alternarSet('ubicaciones', valor) })),
    ...(filtros.stock !== 'todos' ? [{ clave: 'stock', texto: ({ 'con-stock': 'Con stock', 'sin-stock': 'Sin stock', 'stock-bajo': 'Stock bajo' } as const)[filtros.stock], quitar: () => actualizar({ stock: 'todos' }) }] : []),
    ...(filtros.barcode !== 'todos' && capacidades.permitirBarcode ? [{ clave: 'barcode', texto: ({ 'con-barcode': 'Con barcode', 'sin-barcode': 'Sin barcode', interno: 'Barcode interno', comercial: 'Barcode comercial' } as const)[filtros.barcode], quitar: () => actualizar({ barcode: 'todos' }) }] : []),
    ...(filtros.imagen !== 'todos' && capacidades.permitirImagen ? [{ clave: 'imagen', texto: filtros.imagen === 'con-imagen' ? 'Con imagen' : 'Sin imagen', quitar: () => actualizar({ imagen: 'todos' }) }] : []),
    ...(filtros.preset !== 'ninguno' ? [{ clave: 'preset', texto: 'Necesitan atención', quitar: () => actualizar({ preset: 'ninguno' }) }] : []),
    ...(filtros.stockMin !== null ? [{ clave: 'stock-min', texto: `Stock ≥ ${filtros.stockMin}`, quitar: () => actualizar({ stockMin: null }) }] : []),
    ...(filtros.stockMax !== null ? [{ clave: 'stock-max', texto: `Stock ≤ ${filtros.stockMax}`, quitar: () => actualizar({ stockMax: null }) }] : []),
    ...(capacidades.permitirPrecio && filtros.precioMin !== null ? [{ clave: 'precio-min', texto: `Precio ≥ $${filtros.precioMin}`, quitar: () => actualizar({ precioMin: null }) }] : []),
    ...(capacidades.permitirPrecio && filtros.precioMax !== null ? [{ clave: 'precio-max', texto: `Precio ≤ $${filtros.precioMax}`, quitar: () => actualizar({ precioMax: null }) }] : []),
    ...(capacidades.permitirCosto && filtros.costoMin !== null ? [{ clave: 'costo-min', texto: `Costo ≥ $${filtros.costoMin}`, quitar: () => actualizar({ costoMin: null }) }] : []),
    ...(capacidades.permitirCosto && filtros.costoMax !== null ? [{ clave: 'costo-max', texto: `Costo ≤ $${filtros.costoMax}`, quitar: () => actualizar({ costoMax: null }) }] : []),
    ...(filtros.orden !== 'nombre-asc' ? [{ clave: 'orden', texto: ordenes.find(([valor]) => valor === filtros.orden)?.[1] ?? 'Orden personalizado', quitar: () => actualizar({ orden: 'nombre-asc' }) }] : []),
  ]

  return <section className="fl-product-filters" aria-label={`Buscar y filtrar productos de ${contexto}`}>
    <div className="fl-product-search-row">
      <label className="fl-product-search"><Search size={20} aria-hidden="true" /><span className="sr-only">Buscar productos</span><input
        ref={inputRef}
        placeholder={contexto === 'venta' ? 'Buscar productos para vender…' : 'Buscar por nombre, código, tipo, ubicación o proveedor…'}
        value={busqueda}
        onChange={(evento) => onBusqueda(evento.target.value)}
        onKeyDown={(evento) => { if (evento.key === 'Enter') { evento.preventDefault(); onEnter?.() } }}
      /></label>
      <button type="button" className={`fl-filter-toggle${activos ? ' is-active' : ''}`} onClick={() => setAbierto(true)} aria-expanded={abierto}>
        <Filter size={19} />Filtros{activos ? ` • ${activos}` : ''}
      </button>
    </div>

    <div className="fl-filter-quick" aria-label="Filtros rápidos">
      {contexto === 'venta' ? <>
        <button type="button" className={filtros.stock === 'con-stock' ? 'is-active' : ''} onClick={() => activarStock(filtros.stock === 'con-stock' ? 'todos' : 'con-stock')}>Con stock</button>
        <button type="button" className={filtros.stock === 'stock-bajo' ? 'is-active' : ''} onClick={() => activarStock(filtros.stock === 'stock-bajo' ? 'todos' : 'stock-bajo')}>Stock bajo</button>
      </> : <>
        <button type="button" className={filtros.preset === 'necesitan-atencion' ? 'is-active' : ''} onClick={() => actualizar({ preset: filtros.preset === 'necesitan-atencion' ? 'ninguno' : 'necesitan-atencion' })}>Necesitan atención</button>
        <button type="button" className={filtros.stock === 'sin-stock' ? 'is-active' : ''} onClick={() => activarStock(filtros.stock === 'sin-stock' ? 'todos' : 'sin-stock')}>Sin existencia</button>
        <button type="button" className={filtros.stock === 'stock-bajo' ? 'is-active' : ''} onClick={() => activarStock(filtros.stock === 'stock-bajo' ? 'todos' : 'stock-bajo')}>Stock bajo</button>
        <button type="button" className={filtros.barcode === 'sin-barcode' ? 'is-active' : ''} onClick={() => actualizar({ barcode: filtros.barcode === 'sin-barcode' ? 'todos' : 'sin-barcode' })}>Sin barcode</button>
        <button type="button" className={filtros.imagen === 'sin-imagen' ? 'is-active' : ''} onClick={() => actualizar({ imagen: filtros.imagen === 'sin-imagen' ? 'todos' : 'sin-imagen' })}>Sin imagen</button>
      </>}
      {(['Tipo', 'Proveedor', 'Ubicación'] as const).map((texto) => <button type="button" key={texto} onClick={() => setAbierto(true)}>{texto}</button>)}
    </div>

    {resumen.length > 0 && <div className="fl-filter-summary" aria-label="Filtros activos">{resumen.map((item) => <button type="button" key={item.clave} onClick={item.quitar}>{item.texto}<X size={14} aria-label="Quitar" /></button>)}</div>}
    <div className="fl-filter-count"><strong>{totalResultados}</strong>{activos || busqueda.trim() ? ` de ${productos.length} productos` : ` producto${totalResultados === 1 ? '' : 's'}`}</div>

    {abierto && <div className="fl-filter-backdrop" onMouseDown={(evento) => { if (evento.target === evento.currentTarget) setAbierto(false) }}>
      <div className="fl-filter-panel" role="dialog" aria-modal="true" aria-labelledby={`filtros-${contexto}`}>
        <header><div><strong id={`filtros-${contexto}`}>Filtros de productos</strong><small>Combina criterios para reducir resultados</small></div><button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar filtros"><X /></button></header>
        <div className="fl-filter-panel-scroll">
          <fieldset><legend>Stock</legend><div className="fl-filter-options">{([['todos', 'Todos'], ['con-stock', 'Con stock'], ['sin-stock', 'Sin stock'], ['stock-bajo', 'Stock bajo']] as const).map(([valor, texto]) => <label key={valor}><input type="radio" name={`stock-${contexto}`} checked={filtros.stock === valor} onChange={() => actualizar({ stock: valor })} />{texto}</label>)}</div><div className="fl-filter-range"><label>Stock mínimo<input type="number" min="0" inputMode="numeric" value={filtros.stockMin ?? ''} onChange={(e) => actualizar({ stockMin: numeroOpcional(e.target.value) })} /></label><label>Stock máximo<input type="number" min="0" inputMode="numeric" value={filtros.stockMax ?? ''} onChange={(e) => actualizar({ stockMax: numeroOpcional(e.target.value) })} /></label></div></fieldset>
          <GrupoMultiple titulo="Tipo" valores={opciones.tipos} seleccionados={filtros.tipos} onAlternar={(v) => alternarSet('tipos', v)} />
          <GrupoMultiple titulo="Proveedor" valores={opciones.proveedores} seleccionados={filtros.proveedores} onAlternar={(v) => alternarSet('proveedores', v)} />
          <GrupoMultiple titulo="Ubicación" valores={opciones.ubicaciones} seleccionados={filtros.ubicaciones} onAlternar={(v) => alternarSet('ubicaciones', v)} />
          {contexto === 'inventario' && <>
            <fieldset><legend>Código de barras</legend><select value={filtros.barcode} onChange={(e) => actualizar({ barcode: e.target.value as FiltrosProductos['barcode'] })}><option value="todos">Todos</option><option value="con-barcode">Con código de barras</option><option value="sin-barcode">Sin código de barras</option><option value="comercial">Barcode comercial</option><option value="interno">Barcode Fast Look / interno</option></select></fieldset>
            <fieldset><legend>Imagen</legend><select value={filtros.imagen} onChange={(e) => actualizar({ imagen: e.target.value as FiltrosProductos['imagen'] })}><option value="todos">Todos</option><option value="con-imagen">Con imagen</option><option value="sin-imagen">Sin imagen</option></select></fieldset>
            <RangoMoneda titulo="Precio de venta" minimo={filtros.precioMin} maximo={filtros.precioMax} onMinimo={(v) => actualizar({ precioMin: v })} onMaximo={(v) => actualizar({ precioMax: v })} />
            {esAdmin && <RangoMoneda titulo="Costo (Admin)" minimo={filtros.costoMin} maximo={filtros.costoMax} onMinimo={(v) => actualizar({ costoMin: v })} onMaximo={(v) => actualizar({ costoMax: v })} />}
          </>}
          <fieldset><legend>Ordenar por</legend><select value={filtros.orden} onChange={(e) => actualizar({ orden: e.target.value as OrdenProductos })}>{ordenes.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}</select></fieldset>
        </div>
        <footer><button type="button" onClick={limpiarFiltros}>Limpiar filtros</button><button type="button" onClick={limpiarTodo}>Limpiar todo</button><button type="button" className="is-primary" onClick={() => setAbierto(false)}>Aplicar</button></footer>
      </div>
    </div>}
  </section>
}

function GrupoMultiple({ titulo, valores, seleccionados, onAlternar }: { titulo: string; valores: string[]; seleccionados: Set<string>; onAlternar: (valor: string) => void }) {
  return <fieldset><legend>{titulo}</legend><div className="fl-filter-checks">{valores.length ? valores.map((valor) => <label key={valor}><input type="checkbox" checked={seleccionados.has(valor)} onChange={() => onAlternar(valor)} />{valor}</label>) : <small>Sin opciones disponibles</small>}</div></fieldset>
}

function RangoMoneda({ titulo, minimo, maximo, onMinimo, onMaximo }: { titulo: string; minimo: number | null; maximo: number | null; onMinimo: (valor: number | null) => void; onMaximo: (valor: number | null) => void }) {
  return <fieldset><legend>{titulo}</legend><div className="fl-filter-range"><label>Mínimo<input type="number" min="0" step="0.01" inputMode="decimal" value={minimo ?? ''} onChange={(e) => onMinimo(numeroOpcional(e.target.value))} /></label><label>Máximo<input type="number" min="0" step="0.01" inputMode="decimal" value={maximo ?? ''} onChange={(e) => onMaximo(numeroOpcional(e.target.value))} /></label></div></fieldset>
}
