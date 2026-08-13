import type { ResumenMetodoPago } from '@/types/corte'

const moneda = (valor: number) => `$${valor.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function MetodosPagoChart({ datos }: { datos: ResumenMetodoPago[] }) {
  return <section className="fl-corte-panel fl-corte-methods">
    <div className="fl-corte-panel-heading"><div><h2>Métodos de pago</h2><p>Importes contables internos por método original.</p></div></div>
    <div>{datos.length === 0 && <p className="fl-corte-history-empty">Sin movimientos en el periodo.</p>}{datos.map((dato) => <article key={dato.metodo}><header><strong>{dato.metodo}</strong><small>{dato.numeroTickets} ticket(s)</small></header><dl><div><dt>Bruto</dt><dd>{moneda(dato.bruto)}</dd></div><div><dt>Devuelto</dt><dd>-{moneda(dato.devuelto)}</dd></div><div><dt>Neto</dt><dd>{moneda(dato.neto)}</dd></div></dl></article>)}</div>
  </section>
}
