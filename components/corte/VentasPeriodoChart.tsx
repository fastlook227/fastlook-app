'use client'

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { VentaAgrupadaFecha } from '@/types/corte'

const moneda = (valor: number) => `$${valor.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`

export default function VentasPeriodoChart({ datos }: { datos: VentaAgrupadaFecha[] }) {
  return (
    <section className="fl-corte-panel fl-corte-panel--wide">
      <div className="fl-corte-panel-heading"><div><h2>Ventas por periodo</h2><p>Totales agrupados según la duración seleccionada.</p></div></div>
      <div className="fl-corte-chart" aria-label="Gráfica de ventas por periodo">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={datos} margin={{ top: 8, right: 12, left: 0, bottom: 2 }}>
            <defs><linearGradient id="ventasRojo" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#d60000" stopOpacity={0.3}/><stop offset="95%" stopColor="#d60000" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eceef1" vertical={false} />
            <XAxis dataKey="fecha" tick={{ fontSize: 11 }} stroke="#858b94" />
            <YAxis tickFormatter={(valor) => `$${Number(valor).toLocaleString('es-MX')}`} tick={{ fontSize: 11 }} stroke="#858b94" width={70} />
            <Tooltip content={({ active, payload, label }) => {
              const punto = payload?.[0]?.payload as VentaAgrupadaFecha | undefined
              if (!active || !punto) return null
              return <div className="fl-corte-tooltip"><strong>{String(label)}</strong><span>Total: {moneda(punto.total)}</span><span>Ventas: {punto.numeroVentas}</span><span>Ganancia: {moneda(punto.ganancia)}</span></div>
            }} />
            <Area type="monotone" dataKey="total" name="Total vendido" stroke="#d60000" strokeWidth={3} fill="url(#ventasRojo)" activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="fl-chart-summary">Se muestran {datos.length} puntos. El tooltip presenta el total de cada periodo.</p>
    </section>
  )
}
