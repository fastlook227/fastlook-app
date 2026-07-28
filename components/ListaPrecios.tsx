'use client'

import type { CSSProperties } from 'react'
import type { Producto } from '@/types'

interface ListaPreciosProps {
  busqueda: string
  productosFiltrados: Producto[]
  onCambiarBusqueda: (busqueda: string) => void
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
  styles,
}: ListaPreciosProps) {
  return (
    <>
      <h2>Lista de precios completa</h2>
      <input
        style={styles.input}
        placeholder="Buscar producto..."
        value={busqueda}
        onChange={(e) => onCambiarBusqueda(e.target.value)}
      />

      {productosFiltrados.map((p) => (
        <div key={p.id} style={styles.card}>
          {p.imagen_url && (
            <img src={p.imagen_url} alt={p.nombre} style={styles.image} />
          )}
          <h3>{p.nombre}</h3>
          <p><b>Código:</b> {p.codigo}</p>
          <p><b>Tipo:</b> {p.tipo}</p>
          <p><b>Precio:</b> ${p.precio}</p>
          <p><b>Stock:</b> {p.stock}</p>
          <p><b>Ubicación:</b> {p.ubicacion}</p>
          <p><b>Proveedor:</b> {p.proveedor}</p>
        </div>
      ))}
    </>
  )
}
