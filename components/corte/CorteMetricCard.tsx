import type { LucideIcon } from 'lucide-react'

interface CorteMetricCardProps {
  icono: LucideIcon
  titulo: string
  valor: string
  detalle: string
  tono?: 'positivo' | 'neutro' | 'alerta'
  tooltip: string
}

export default function CorteMetricCard({ icono: Icono, titulo, valor, detalle, tono = 'neutro', tooltip }: CorteMetricCardProps) {
  return (
    <article className={`fl-corte-metric fl-corte-metric--${tono}`} title={tooltip} tabIndex={0}>
      <span className="fl-corte-metric-icon"><Icono size={21} aria-hidden="true" /></span>
      <div><p>{titulo}</p><strong>{valor}</strong><small>{detalle}</small></div>
    </article>
  )
}
