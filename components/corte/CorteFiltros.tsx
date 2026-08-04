import { CalendarDays, ChevronDown, RefreshCw } from 'lucide-react'
import type { PeriodoCorte } from '@/types/corte'

interface CorteFiltrosProps {
  periodo: PeriodoCorte
  fechaInicio: string
  fechaFin: string
  error: string
  actualizando: boolean
  onSeleccionarPeriodo: (periodo: PeriodoCorte) => void
  onCambiarInicio: (fecha: string) => void
  onCambiarFin: (fecha: string) => void
  onAplicarPersonalizado: () => void
  onActualizar: () => void
}

const opciones: Array<{ id: PeriodoCorte; texto: string }> = [
  { id: 'hoy', texto: 'Hoy' },
  { id: 'ayer', texto: 'Ayer' },
  { id: 'ultimos7', texto: 'Últimos 7 días' },
  { id: 'mesActual', texto: 'Este mes' },
  { id: 'mesAnterior', texto: 'Mes anterior' },
  { id: 'personalizado', texto: 'Personalizado' },
]

export default function CorteFiltros(props: CorteFiltrosProps) {
  return (
    <details className="fl-corte-filters" open>
      <summary><span><CalendarDays size={20} aria-hidden="true" />Periodo de análisis</span><ChevronDown size={20} aria-hidden="true" /></summary>
      <div className="fl-corte-filter-body">
        <div className="fl-corte-quick-periods" aria-label="Periodos rápidos">
          {opciones.map((opcion) => (
            <button key={opcion.id} type="button" className={props.periodo === opcion.id ? 'is-active' : ''} onClick={() => props.onSeleccionarPeriodo(opcion.id)}>{opcion.texto}</button>
          ))}
        </div>
        {props.periodo === 'personalizado' && (
          <div className="fl-corte-custom-dates">
            <label>Fecha inicial<input aria-label="Fecha inicial del corte" type="date" value={props.fechaInicio} onChange={(e) => props.onCambiarInicio(e.target.value)} /></label>
            <label>Fecha final<input aria-label="Fecha final del corte" type="date" value={props.fechaFin} onChange={(e) => props.onCambiarFin(e.target.value)} /></label>
            <button type="button" onClick={props.onAplicarPersonalizado}>Aplicar</button>
          </div>
        )}
        {props.error && <p className="fl-corte-filter-error" role="alert">{props.error}</p>}
        <div className="fl-corte-filter-footer">
          <span>{props.fechaInicio} — {props.fechaFin}</span>
          <button type="button" onClick={props.onActualizar} disabled={props.actualizando}><RefreshCw size={18} aria-hidden="true" />Actualizar</button>
        </div>
      </div>
    </details>
  )
}
