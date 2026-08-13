import { ChevronDown, History, RefreshCw } from 'lucide-react'
import type { Devolucion, DevolucionDetalle, PeriodoDevoluciones } from '@/types/devoluciones'
import { formatearFechaHoraFastLook, obtenerFechaActualFastLook, obtenerRangoFechasFastLook, obtenerRangoPeriodoFastLook } from '@/utils/fechas'
import { monedaDevolucion } from '@/utils/devoluciones'

export default function HistorialDevoluciones({ devoluciones, detalles, periodo, fechaInicio, fechaFin, cargando, onPeriodo, onInicio, onFin, onActualizar }: {
  devoluciones: Devolucion[]; detalles: DevolucionDetalle[]; periodo: PeriodoDevoluciones; fechaInicio: string; fechaFin: string; cargando: boolean; onPeriodo: (periodo: PeriodoDevoluciones) => void; onInicio: (fecha: string) => void; onFin: (fecha: string) => void; onActualizar: () => void
}) {
  const rango = periodo === 'personalizado'
    ? obtenerRangoFechasFastLook(fechaInicio, fechaFin)
    : obtenerRangoPeriodoFastLook(periodo)
  const desde = Date.parse(rango.inicioIso)
  const hasta = Date.parse(rango.finExclusivoIso)
  const visibles = devoluciones.filter((item) => { const fecha = Date.parse(item.created_at); return fecha >= desde && fecha < hasta })
  const opciones: Array<[PeriodoDevoluciones, string]> = [['hoy', 'Hoy'], ['ultimos7', 'Últimos 7 días'], ['mesActual', 'Este mes'], ['personalizado', 'Personalizado']]
  return <section className="fl-return-history">
    <header><div><span>Historial</span><h2>Devoluciones registradas</h2></div><History /></header>
    <div className="fl-return-periods">{opciones.map(([id, texto]) => <button key={id} type="button" className={periodo === id ? 'is-active' : ''} onClick={() => onPeriodo(id)}>{texto}</button>)}</div>
    {periodo === 'personalizado' && <div className="fl-return-custom-dates"><label>Desde<input type="date" value={fechaInicio} max={fechaFin} onChange={(e) => onInicio(e.target.value)} /></label><label>Hasta<input type="date" value={fechaFin} min={fechaInicio} max={obtenerFechaActualFastLook()} onChange={(e) => onFin(e.target.value)} /></label></div>}
    <button type="button" className="fl-return-refresh" disabled={cargando} onClick={onActualizar}><RefreshCw size={17} />Actualizar</button>
    <div className="fl-return-history-list">{visibles.length === 0 && <div className="fl-return-empty">No hay devoluciones en este periodo.</div>}{visibles.map((devolucion) => {
      const lineas = detalles.filter((detalle) => String(detalle.devolucion_id) === String(devolucion.id))
      const productos = new Set(lineas.map((linea) => String(linea.producto_id))).size
      return <details key={devolucion.id}><summary><div><strong>{devolucion.folio}</strong><small>{formatearFechaHoraFastLook(devolucion.created_at)}</small></div><span>{productos} producto(s)<b>{monedaDevolucion(Number(devolucion.total_devuelto || 0))}</b></span><ChevronDown /></summary><div className="fl-return-history-body"><p><b>Método:</b> {devolucion.metodo_pago}</p><p><b>Motivo:</b> {devolucion.motivo === 'Otro' ? devolucion.motivo_otro || 'Otro' : devolucion.motivo}</p><p><b>Procesó:</b> {devolucion.usuario_nombre}</p>{lineas.map((linea) => <article key={linea.id}><span><b>{linea.nombre}</b><small>{linea.codigo}</small></span><strong>{Number(linea.cantidad)} × {monedaDevolucion(Number(linea.precio_unitario_original))}</strong></article>)}</div></details>
    })}</div>
  </section>
}
