import type { CSSProperties } from 'react'
import type { MovimientoInventario } from '@/types'

interface MovimientosProps {
  movimientos: MovimientoInventario[]
  obtenerFechaLocal: (fecha: string | Date) => string
  styles: {
    ticketItem: CSSProperties
  }
}

export default function Movimientos({
  movimientos,
  obtenerFechaLocal,
  styles,
}: MovimientosProps) {
  return (
    <>
      <h2>Historial de movimientos</h2>

      {movimientos.map((m) => (
        <div key={m.id} style={styles.ticketItem}>
          <p><b>{m.nombre}</b></p>
          <p>Código: {m.codigo}</p>
          <p>Tipo: {m.tipo_movimiento}</p>
          <p>Cantidad: {m.cantidad}</p>
          <p>Stock anterior: {m.stock_anterior}</p>
          <p>Stock nuevo: {m.stock_nuevo}</p>
          <p>Nota: {m.nota}</p>
          <p>Fecha: {obtenerFechaLocal(m.created_at)}</p>
        </div>
      ))}
    </>
  )
}
