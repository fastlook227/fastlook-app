import { Eye, ImageOff, ShieldCheck } from 'lucide-react'
import type { RolUsuario } from '@/types'
import type { CascoCatalogo } from '@/types/cascos'

interface TarjetaCascoProps {
  casco: CascoCatalogo
  rol: RolUsuario
  onVer: (casco: CascoCatalogo) => void
}

const moneda = (valor: number) => `$${Number(valor || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function TarjetaCasco({ casco, rol, onVer }: TarjetaCascoProps) {
  const stock = Number(casco.stock || 0)
  return (
    <article className="fl-helmet-card">
      <button type="button" className="fl-helmet-image-button" onClick={() => onVer(casco)} aria-label={`Ampliar imagen de ${casco.nombre}`}>
        {casco.imagen_url ? <img src={casco.imagen_url} alt={casco.nombre} loading="lazy" /> : <span><ImageOff size={35} aria-hidden="true" />Imagen no disponible</span>}
      </button>
      <div className="fl-helmet-card-body">
        <div className="fl-helmet-badges"><span className={stock === 1 ? 'is-last' : 'is-available'}>{stock === 1 ? 'Última pieza' : 'Disponible'}</span>{rol === 'Admin' && <span className="is-admin">Vista Admin</span>}</div>
        <h3>{casco.nombre}</h3>
        <strong className="fl-helmet-price">{moneda(casco.precio)}</strong>
        <dl>
          <div><dt>Talla</dt><dd>{casco.talla?.trim() || 'Sin especificar'}</dd></div>
          <div><dt>Certificación</dt><dd><ShieldCheck size={15} aria-hidden="true" />{casco.certificacion?.trim() || 'Sin especificar'}</dd></div>
          <div><dt>Disponibles</dt><dd>{stock}</dd></div>
          <div><dt>Código</dt><dd>{casco.codigo || 'Sin código'}</dd></div>
          {rol === 'Admin' && <div><dt>Costo</dt><dd>{moneda(Number(casco.costo || 0))}</dd></div>}
        </dl>
        <button type="button" className="fl-helmet-view" onClick={() => onVer(casco)}><Eye size={18} aria-hidden="true" />Ver casco</button>
      </div>
    </article>
  )
}
