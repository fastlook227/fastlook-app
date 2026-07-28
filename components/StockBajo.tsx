import type { CSSProperties } from 'react'
import type { Producto } from '@/types'

interface StockBajoProps {
  productosBajoStock: Producto[]
  styles: {
    alert: CSSProperties
    card: CSSProperties
  }
}

export default function StockBajo({
  productosBajoStock,
  styles,
}: StockBajoProps) {
  return (
    <>
      <h2>Stock bajo / comprar pronto</h2>

      {productosBajoStock.length > 0 && (
        <div style={styles.alert}>
          Hay {productosBajoStock.length} productos con stock bajo.
        </div>
      )}

      {productosBajoStock.map((p) => (
        <div key={p.id} style={styles.card}>
          <h3>{p.nombre}</h3>
          <p><b>Código:</b> {p.codigo}</p>
          <p><b>Stock:</b> {p.stock}</p>
          <p><b>Stock mínimo:</b> {p.stock_minimo || 5}</p>
          <p><b>Proveedor:</b> {p.proveedor}</p>
          <p><b>Ubicación:</b> {p.ubicacion}</p>
        </div>
      ))}
    </>
  )
}
