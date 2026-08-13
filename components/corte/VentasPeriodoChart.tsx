'use client'

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { VentaAgrupadaFecha } from '@/types/corte'

const moneda = (valor: number) => `$${valor.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`

export default function VentasPeriodoChart({ datos }: { datos: VentaAgrupadaFecha[] }) {
  return <section className="fl-corte-panel fl-corte-panel--wide">
    <div className="fl-corte-panel-heading"><div><h2>Balance por periodo</h2><p>Ventas brutas, devoluciones procesadas y ventas netas.</p></div></div>
    <div className="fl-corte-chart" aria-label="Gráfica de ventas y devoluciones por periodo"><ResponsiveContainer width="100%" height="100%"><AreaChart data={datos} margin={{ top: 8, right: 12, left: 0, bottom: 2 }}>
      <defs><linearGradient id="ventasNetasRojo" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#d60000" stopOpacity={0.28}/><stop offset="95%" stopColor="#d60000" stopOpacity={0}/></linearGradient></defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#eceef1" vertical={false} />
      <XAxis dataKey="fecha" tick={{ fontSize: 11 }} stroke="#858b94" />
      <YAxis tickFormatter={(valor) => `$${Number(valor).toLocaleString('es-MX')}`} tick={{ fontSize: 11 }} stroke="#858b94" width={70} />
      <Tooltip content={({ active, payload, label }) => { const punto = payload?.[0]?.payload as VentaAgrupadaFecha | undefined; if (!active || !punto) return null; return <div className="fl-corte-tooltip"><strong>{String(label)}</strong><span>Brutas: {moneda(punto.ventasBrutas)}</span><span>Devoluciones: -{moneda(punto.devoluciones)}</span><span>Netas: {moneda(punto.ventasNetas)}</span><span>Tickets: {punto.numeroTickets}</span></div> }} />
      <Area type="monotone" dataKey="ventasBrutas" name="Ventas brutas" stroke="#101010" strokeWidth={2} fill="transparent" />
      <Area type="monotone" dataKey="devoluciones" name="Devoluciones" stroke="#858b94" strokeWidth={2} strokeDasharray="5 4" fill="transparent" />
      <Area type="monotone" dataKey="ventasNetas" name="Ventas netas" stroke="#d60000" strokeWidth={3} fill="url(#ventasNetasRojo)" activeDot={{ r: 5 }} />
    </AreaChart></ResponsiveContainer></div>
    <div className="fl-corte-series-legend"><span className="is-gross">Ventas brutas</span><span className="is-returns">Devoluciones</span><span className="is-net">Ventas netas</span></div>
  </section>
}
