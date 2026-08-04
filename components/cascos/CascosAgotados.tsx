import { PackageX } from 'lucide-react'
import type { RolUsuario } from '@/types'
import type { CascoCatalogo } from '@/types/cascos'
import TarjetaCasco from '@/components/cascos/TarjetaCasco'

interface Props {
  cascos: CascoCatalogo[]
  rol: RolUsuario
  onVer: (casco: CascoCatalogo) => void
  onEditar: (casco: CascoCatalogo) => void
  onReponer: (casco: CascoCatalogo) => void
  onArchivar: (casco: CascoCatalogo) => void
  onEliminar: (casco: CascoCatalogo) => void
}

export default function CascosAgotados({ cascos, rol, onVer, onEditar, onReponer, onArchivar, onEliminar }: Props) {
  if (!cascos.length) return <div className="fl-helmets-state"><PackageX size={38} /><h2>No hay cascos agotados.</h2><p>Los modelos activos con stock cero aparecerán aquí.</p></div>
  return <section className="fl-sold-out-section"><header><div><span>Administración</span><h2>Cascos agotados</h2></div><strong>{cascos.length} modelos</strong></header><div className="fl-helmet-grid">{cascos.map((casco) => <TarjetaCasco key={casco.id} casco={casco} rol={rol} agotado onVer={onVer} onEditar={onEditar} onReponer={onReponer} onArchivar={onArchivar} onEliminar={onEliminar} />)}</div></section>
}
