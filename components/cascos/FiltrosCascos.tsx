import { Search, SlidersHorizontal, X } from 'lucide-react'

interface FiltrosCascosProps {
  busqueda: string
  talla: string
  certificacion: string
  tallas: string[]
  certificaciones: string[]
  onBusqueda: (valor: string) => void
  onTalla: (valor: string) => void
  onCertificacion: (valor: string) => void
  onLimpiar: () => void
}

export default function FiltrosCascos(props: FiltrosCascosProps) {
  return (
    <section className="fl-helmets-filters" aria-label="Filtros del catálogo de cascos">
      <div className="fl-helmets-filter-title"><SlidersHorizontal size={19} aria-hidden="true" /><strong>Filtrar catálogo</strong></div>
      <label className="fl-helmets-search"><Search size={19} aria-hidden="true" /><span className="sr-only">Buscar casco</span><input value={props.busqueda} onChange={(e) => props.onBusqueda(e.target.value)} placeholder="Buscar por nombre, código, talla o certificación" /></label>
      <label><span>Talla</span><select value={props.talla} onChange={(e) => props.onTalla(e.target.value)} aria-label="Filtrar por talla"><option value="">Todas</option>{props.tallas.map((talla) => <option key={talla} value={talla}>{talla}</option>)}</select></label>
      <label><span>Certificación</span><select value={props.certificacion} onChange={(e) => props.onCertificacion(e.target.value)} aria-label="Filtrar por certificación"><option value="">Todas</option>{props.certificaciones.map((certificacion) => <option key={certificacion} value={certificacion}>{certificacion}</option>)}</select></label>
      <button type="button" onClick={props.onLimpiar}><X size={17} aria-hidden="true" />Limpiar filtros</button>
    </section>
  )
}
