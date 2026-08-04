'use client'
import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'
import type { CascoCatalogo } from '@/types/cascos'

export default function EliminarCascoDialog({ casco, ocupado, onConfirmar, onCancelar }: { casco: CascoCatalogo; ocupado: boolean; onConfirmar: () => Promise<void>; onCancelar: () => void }) {
  const [texto, setTexto] = useState('')
  return <div className="fl-casco-dialog-backdrop"><section className="fl-casco-small-dialog is-danger" role="dialog" aria-modal="true"><header><AlertTriangle /><h2>Eliminar definitivamente</h2><button type="button" aria-label="Cerrar" onClick={onCancelar}><X /></button></header><strong>{casco.nombre}</strong><p>Primero se comprobarán ventas, movimientos, acciones y stock. Si existe historial, el casco será archivado.</p><label>Escribe ELIMINAR<input value={texto} onChange={(e) => setTexto(e.target.value.toUpperCase())} /></label><footer><button onClick={onCancelar} disabled={ocupado}>Cancelar</button><button className="is-danger" onClick={() => void onConfirmar()} disabled={texto !== 'ELIMINAR' || ocupado}>Eliminar definitivamente</button></footer></section></div>
}
