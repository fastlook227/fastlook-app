'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { ResumenMetodoPago } from '@/types/corte'

const colores = ['#d60000', '#101010', '#858b94', '#f09a9a']
const moneda = (valor: number) => `$${valor.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function MetodosPagoChart({ datos }: { datos: ResumenMetodoPago[] }) {
  return (
    <section className="fl-corte-panel">
      <div className="fl-corte-panel-heading"><div><h2>Métodos de pago</h2><p>Distribución monetaria del periodo.</p></div></div>
      <div className="fl-corte-donut" aria-label="Gráfica de métodos de pago">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart><Pie data={datos} dataKey="total" nameKey="metodo" innerRadius="55%" outerRadius="82%" paddingAngle={2}>{datos.map((dato, indice) => <Cell key={dato.metodo} fill={colores[indice % colores.length]} />)}</Pie><Tooltip formatter={(valor) => moneda(Number(valor))} /></PieChart>
        </ResponsiveContainer>
      </div>
      <div className="fl-corte-legend">
        {datos.map((dato, indice) => <div key={dato.metodo}><i style={{ background: colores[indice % colores.length] }} /><span><b>{dato.metodo}</b><small>{dato.numeroVentas} ventas · {dato.porcentaje.toFixed(1)}%</small></span><strong>{moneda(dato.total)}</strong></div>)}
      </div>
    </section>
  )
}
