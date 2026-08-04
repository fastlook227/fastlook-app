'use client'
import { PackagePlus, X } from 'lucide-react'
import { useState } from 'react'
import type { CascoCatalogo } from '@/types/cascos'

export default function ReponerStockCascoDialog({ casco, ocupado, onConfirmar, onCancelar }: { casco: CascoCatalogo; ocupado: boolean; onConfirmar: (cantidad: number) => Promise<void>; onCancelar: () => void }) {
  const [cantidad, setCantidad] = useState(1)
  const valida = Number.isInteger(cantidad) && cantidad > 0 && cantidad <= 10000
  return <div className="fl-casco-dialog-backdrop"><section className="fl-casco-small-dialog" role="dialog" aria-modal="true"><header><PackagePlus /><h2>Reponer stock</h2><button type="button" aria-label="Cerrar" onClick={onCancelar}><X /></button></header><strong>{casco.nombre}</strong><p>Stock actual: {Number(casco.stock || 0)}</p><label>Cantidad a añadir<input type="number" min="1" max="10000" step="1" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} /></label><p>Stock resultante: <b>{Number(casco.stock || 0) + (valida ? cantidad : 0)}</b></p>{!valida && <small role="alert">Ingresa un entero entre 1 y 10,000.</small>}<footer><button onClick={onCancelar} disabled={ocupado}>Cancelar</button><button className="is-primary" onClick={() => void onConfirmar(cantidad)} disabled={!valida || ocupado}>Confirmar</button></footer></section></div>
}
