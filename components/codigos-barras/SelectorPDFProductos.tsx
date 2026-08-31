'use client'

import { CheckSquare, FileDown, ImageOff, Search, Square, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Producto } from '@/types'
import { filtrarProductosPorBusqueda } from '@/utils/busqueda'
import { generarPdfCodigosBarrasProductos } from '@/utils/pdfCodigosBarrasProductos'
import {
  alternarIdSeleccionado,
  agregarIdsSeleccionados,
  calcularPaginasPDF,
  quitarIdsSeleccionados,
  reconciliarIdsSeleccionados,
  separarProductosPorCodigoBarras,
  type ModoPDFCodigosBarras,
} from '@/utils/seleccionCodigosBarras'

export default function SelectorPDFProductos({ productos, onCerrar, onAsignarFaltantes }: {
  productos: Producto[]
  onCerrar: () => void
  onAsignarFaltantes: () => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [modo, setModo] = useState<ModoPDFCodigosBarras>('clasico')
  const [generando, setGenerando] = useState(false)
  const [progreso, setProgreso] = useState({ procesados: 0, total: 0 })
  const [error, setError] = useState('')
  const generandoRef = useRef(false)
  const visibles = useMemo(() => filtrarProductosPorBusqueda(productos, busqueda), [productos, busqueda])
  const productosSeleccionados = useMemo(
    () => productos.filter((producto) => seleccionados.has(producto.id)),
    [productos, seleccionados]
  )
  const { sinCodigo: seleccionadosSinBarcode } = separarProductosPorCodigoBarras(productosSeleccionados)
  const paginas = calcularPaginasPDF(productosSeleccionados.length, modo)

  useEffect(() => {
    setSeleccionados((actuales) => reconciliarIdsSeleccionados(actuales, productos))
  }, [productos])

  const generar = async () => {
    if (generandoRef.current || !productosSeleccionados.length || seleccionadosSinBarcode.length) return
    generandoRef.current = true
    setGenerando(true)
    setError('')
    setProgreso({ procesados: 0, total: productosSeleccionados.length })
    try {
      await generarPdfCodigosBarrasProductos(productosSeleccionados, modo, (procesados, total) => setProgreso({ procesados, total }))
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No fue posible generar el PDF.')
    } finally {
      generandoRef.current = false
      setGenerando(false)
    }
  }

  return <div className="fl-product-barcode-pdf-backdrop" role="presentation" onMouseDown={(evento) => { if (evento.target === evento.currentTarget && !generando) onCerrar() }}>
    <section className="fl-product-barcode-pdf-dialog" role="dialog" aria-modal="true" aria-labelledby="titulo-pdf-productos">
      <header><div><span>FAST LOOK · INVENTARIO</span><h2 id="titulo-pdf-productos">Códigos de barras de productos PDF</h2><p>Visibles: <b>{visibles.length}</b> · Seleccionados totales: <b>{productosSeleccionados.length}</b> · Páginas: <b>{paginas}</b></p></div><button type="button" aria-label="Cerrar" onClick={onCerrar} disabled={generando}><X size={21} /></button></header>
      <div className="fl-product-barcode-pdf-search"><Search size={18} /><input value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar por nombre, código Fast Look o código de barras" /></div>
      <div className="fl-product-barcode-pdf-actions">
        <button type="button" onClick={() => setSeleccionados((actuales) => agregarIdsSeleccionados(actuales, visibles))}><CheckSquare size={17} />Seleccionar visibles</button>
        <button type="button" onClick={() => setSeleccionados((actuales) => quitarIdsSeleccionados(actuales, visibles))}><Square size={17} />Deseleccionar visibles</button>
        <button type="button" onClick={() => setSeleccionados(new Set())}><X size={17} />Limpiar selección</button>
      </div>
      <fieldset className="fl-product-barcode-pdf-format"><legend>Formato de impresión</legend><label className={modo === 'clasico' ? 'is-active' : ''}><input type="radio" name="formato-pdf-barcode" value="clasico" checked={modo === 'clasico'} onChange={() => setModo('clasico')} /><span><strong>Clásico</strong><small>8 por hoja · imagen y barcode</small></span></label><label className={modo === 'etiquetas' ? 'is-active' : ''}><input type="radio" name="formato-pdf-barcode" value="etiquetas" checked={modo === 'etiquetas'} onChange={() => setModo('etiquetas')} /><span><strong>Etiquetas</strong><small>24 por hoja · formato compacto</small></span></label></fieldset>
      <div className="fl-product-barcode-pdf-list">
        {visibles.map((producto) => <label key={producto.id} className={seleccionados.has(producto.id) ? 'is-selected' : ''}>
          <input type="checkbox" checked={seleccionados.has(producto.id)} onChange={() => setSeleccionados((actuales) => alternarIdSeleccionado(actuales, producto.id))} />
          <span className="fl-product-barcode-pdf-thumb">{producto.imagen_url ? <img src={producto.imagen_url} alt="" /> : <ImageOff size={22} aria-label="Sin imagen" />}</span>
          <span className="fl-product-barcode-pdf-data"><strong>{producto.nombre}</strong><small>Código Fast Look: {producto.codigo}</small><small>Código de barras: {producto.codigo_barras ?? 'Sin código'}</small></span>
          <span className={!producto.codigo_barras ? 'is-missing' : 'is-ready'}>{!producto.codigo_barras ? 'Pendiente' : 'Listo'}</span>
        </label>)}
        {!visibles.length && <p className="fl-product-barcode-pdf-empty">No hay productos que coincidan con la búsqueda.</p>}
      </div>
      <footer>
        <div>{seleccionadosSinBarcode.length > 0 && <section className="fl-product-barcode-pdf-warning" role="alert"><p>{seleccionadosSinBarcode.length} productos seleccionados todavía no tienen código de barras.</p><button type="button" onClick={onAsignarFaltantes} disabled={generando}>Asignar códigos faltantes</button></section>}{error && <p className="fl-product-barcode-pdf-error" role="alert">{error}</p>}{generando && <p role="status">Generando PDF… {progreso.procesados}/{progreso.total}</p>}</div>
        <button type="button" className="is-cancel" onClick={onCerrar} disabled={generando}>Cancelar</button>
        <button type="button" className="is-generate" onClick={() => void generar()} disabled={generando || !productosSeleccionados.length || seleccionadosSinBarcode.length > 0}><FileDown size={18} />{generando ? 'Generando PDF…' : 'Generar PDF'}</button>
      </footer>
    </section>
  </div>
}
