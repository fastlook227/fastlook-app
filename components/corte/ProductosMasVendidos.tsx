'use client'

import { useState } from 'react'
import type { ProductoVendidoResumen } from '@/types/corte'

const moneda = (valor: number) => `$${valor.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`

export default function ProductosMasVendidos({ productos }: { productos: ProductoVendidoResumen[] }) {
  const [mostrarTodos, setMostrarTodos] = useState(false)
  const visibles = mostrarTodos ? productos.slice(0, 10) : productos.slice(0, 5)
  const maximo = Math.max(1, ...productos.map((producto) => producto.cantidad))
  return (
    <section className="fl-corte-panel">
      <div className="fl-corte-panel-heading"><div><h2>Productos más vendidos</h2><p>Ranking por unidades vendidas.</p></div></div>
      <div className="fl-corte-products">
        {visibles.map((producto, indice) => (
          <article key={`${producto.productoId || producto.codigo}-${producto.nombre}`}>
            <span className="fl-corte-rank">{indice + 1}</span>
            <div><strong>{producto.nombre}</strong><small>{producto.codigo || 'Sin código'} · {producto.cantidad} piezas</small><div><i style={{ width: `${(producto.cantidad / maximo) * 100}%` }} /></div></div>
            <span><b>{moneda(producto.total)}</b><small>Ganancia {moneda(producto.ganancia)}</small></span>
          </article>
        ))}
      </div>
      {productos.length > 5 && <button type="button" className="fl-corte-see-all" onClick={() => setMostrarTodos((actual) => !actual)}>{mostrarTodos ? 'Ver principales' : 'Ver todos'}</button>}
    </section>
  )
}
