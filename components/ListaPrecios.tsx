'use client'

import type { CSSProperties } from 'react'
import { ScanLine } from 'lucide-react'
import type { Producto } from '@/types'
import TarjetaProducto from '@/components/TarjetaProducto'
import CargarMasProductos from '@/components/CargarMasProductos'
import useListaProgresiva from '@/hooks/useListaProgresiva'

interface ListaPreciosProps {
  busqueda: string
  productosFiltrados: Producto[]
  onCambiarBusqueda: (busqueda: string) => void
  onConfirmarBusqueda: (busqueda: string) => void
  onEscanear: (disparador: HTMLButtonElement) => void
  styles: {
    input: CSSProperties
    card: CSSProperties
    image: CSSProperties
  }
}

export default function ListaPrecios({
  busqueda,
  productosFiltrados,
  onCambiarBusqueda,
  onConfirmarBusqueda,
  onEscanear,
  styles,
}: ListaPreciosProps) {
  const lista = useListaProgresiva(productosFiltrados)
  return (
    <>
      <h2>Lista de precios completa</h2>
      <div className="fl-scanner-actions"><button type="button" onClick={(evento) => onEscanear(evento.currentTarget)}><ScanLine size={18} />Escanear</button></div>
      <input
        style={styles.input}
        placeholder="Buscar producto..."
        value={busqueda}
        onChange={(e) => onCambiarBusqueda(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onConfirmarBusqueda(busqueda) }}
      />

      <div className="fl-product-grid">{lista.visibles.map((p) => <TarjetaProducto key={p.id} producto={p} mostrarCodigo><dl className="fl-product-card-details"><div><dt>Tipo</dt><dd>{p.tipo}</dd></div><div><dt>Ubicación</dt><dd>{p.ubicacion || 'Sin asignar'}</dd></div><div><dt>Proveedor</dt><dd>{p.proveedor || 'Sin asignar'}</dd></div></dl></TarjetaProducto>)}</div>
      <CargarMasProductos visibles={lista.visibles.length} total={lista.total} onCargarMas={lista.cargarMas} />
    </>
  )
}
