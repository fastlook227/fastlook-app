import { Archive, Edit3, Eye, ImageOff, MoreHorizontal, PackagePlus, ShieldCheck, ShoppingCart, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { RolUsuario } from '@/types'
import type { CascoCatalogo } from '@/types/cascos'

interface TarjetaCascoProps {
  casco: CascoCatalogo
  rol: RolUsuario
  onVer: (casco: CascoCatalogo) => void
  agotado?: boolean
  onVender?: (casco: CascoCatalogo) => void
  onEditar?: (casco: CascoCatalogo) => void
  onReponer?: (casco: CascoCatalogo) => void
  onArchivar?: (casco: CascoCatalogo) => void
  onEliminar?: (casco: CascoCatalogo) => void
}

const moneda = (valor: number) => `$${Number(valor || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function TarjetaCasco({ casco, rol, onVer, agotado = false, onVender, onEditar, onReponer, onArchivar, onEliminar }: TarjetaCascoProps) {
  const stock = Number(casco.stock || 0)
  const [menuAbierto, setMenuAbierto] = useState(false)
  return (
    <article className={`fl-helmet-card${agotado ? ' is-sold-out' : ''}`}>
      <button type="button" className="fl-helmet-image-button" onClick={() => onVer(casco)} aria-label={`Ampliar imagen de ${casco.nombre}`}>
        {casco.imagen_url ? <img src={casco.imagen_url} alt={casco.nombre} loading="lazy" /> : <span><ImageOff size={35} aria-hidden="true" />Imagen no disponible</span>}
      </button>
      <div className="fl-helmet-card-body">
        <div className="fl-helmet-badges"><span className={agotado ? 'is-out' : stock === 1 ? 'is-last' : 'is-available'}>{agotado ? 'Agotado' : stock === 1 ? 'Última pieza' : 'Disponible'}</span>{rol === 'Admin' && <span className="is-admin">Vista Admin</span>}</div>
        <h3>{casco.nombre}</h3>
        <strong className="fl-helmet-price">{moneda(casco.precio)}</strong>
        <dl>
          <div><dt>Talla</dt><dd>{casco.talla?.trim() || 'Sin especificar'}</dd></div>
          <div><dt>Certificación</dt><dd><ShieldCheck size={15} aria-hidden="true" />{casco.certificacion?.trim() || 'Sin especificar'}</dd></div>
          <div><dt>Disponibles</dt><dd>{stock}</dd></div>
          <div><dt>Código</dt><dd>{casco.codigo || 'Sin código'}</dd></div>
          {rol === 'Admin' && <div><dt>Costo</dt><dd>{moneda(Number(casco.costo || 0))}</dd></div>}
        </dl>
        <div className="fl-helmet-card-actions">
          <button type="button" onClick={() => onVer(casco)}><Eye size={17} />Ver</button>
          {!agotado && <button type="button" className="is-primary" onClick={() => onVender?.(casco)}><ShoppingCart size={17} />Vender</button>}
          {rol === 'Admin' && <button type="button" onClick={() => onEditar?.(casco)}><Edit3 size={17} />Editar</button>}
          {rol === 'Admin' && <div className="fl-helmet-more"><button type="button" aria-label={`Más opciones para ${casco.nombre}`} onClick={() => setMenuAbierto(!menuAbierto)}><MoreHorizontal size={19} /></button>{menuAbierto && <div><button type="button" onClick={() => { setMenuAbierto(false); onReponer?.(casco) }}><PackagePlus size={16} />Reponer stock</button><button type="button" onClick={() => { setMenuAbierto(false); onArchivar?.(casco) }}><Archive size={16} />Archivar</button><button type="button" className="is-danger" onClick={() => { setMenuAbierto(false); onEliminar?.(casco) }}><Trash2 size={16} />Eliminar definitivamente</button></div>}</div>}
        </div>
      </div>
    </article>
  )
}
