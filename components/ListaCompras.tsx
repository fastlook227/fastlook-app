'use client'

import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import type { Producto } from '@/types'

export interface ProductoCompra {
  producto: Producto
  stockActual: number
  stockMinimo: number
  cantidadSugerida: number
}

interface ListaComprasProps {
  cantidadCompra: number
  setCantidadCompra: Dispatch<SetStateAction<number>>
  comprasPorProveedor: Record<string, ProductoCompra[]>
  enviarPedidoProveedor: (proveedor: string) => void
  styles: {
    input: CSSProperties
    alert: CSSProperties
    card: CSSProperties
    ticketItem: CSSProperties
    redButton: CSSProperties
  }
}

export default function ListaCompras({
  cantidadCompra,
  setCantidadCompra,
  comprasPorProveedor,
  enviarPedidoProveedor,
  styles,
}: ListaComprasProps) {
  return (
    <>
      <h2>Lista automática de compras</h2>

      <input
        type="number"
        style={styles.input}
        placeholder="Cantidad mínima sugerida a comprar"
        value={cantidadCompra}
        onChange={(e) => setCantidadCompra(Number(e.target.value))}
      />

      {Object.keys(comprasPorProveedor).length === 0 && (
        <div style={styles.alert}>No hay productos con stock bajo para comprar.</div>
      )}

      {Object.keys(comprasPorProveedor).map((proveedor) => (
        <div key={proveedor} style={styles.card}>
          <h3>{proveedor}</h3>

          {comprasPorProveedor[proveedor].map(({
            producto,
            stockActual,
            stockMinimo,
            cantidadSugerida,
          }) => (
            <div key={producto.id} style={styles.ticketItem}>
              <p><b>{producto.nombre}</b></p>
              <p>Código: {producto.codigo}</p>
              <p>Stock actual: {stockActual}</p>
              <p>Stock mínimo: {stockMinimo}</p>
              <p><b>Comprar sugerido:</b> {cantidadSugerida}</p>
              <p>Ubicación: {producto.ubicacion}</p>
            </div>
          ))}

          <button
            style={styles.redButton}
            onClick={() => enviarPedidoProveedor(proveedor)}
          >
            Enviar pedido por WhatsApp
          </button>
        </div>
      ))}
    </>
  )
}
