'use client'

import { AlertTriangle, ImagePlus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CascoCatalogo, DatosFormularioCasco } from '@/types/cascos'

const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Unitalla']
const CERTIFICACIONES = ['DOT', 'ECE', 'DOT + ECE', 'Sin especificar'] as const

interface Props {
  casco: CascoCatalogo | null
  codigoInicial: string
  ocupado: boolean
  onGenerarCodigo: () => Promise<string>
  onGuardar: (datos: DatosFormularioCasco, imagen: File | null) => Promise<void>
  onCancelar: () => void
}

export default function FormularioCasco({ casco, codigoInicial, ocupado, onGenerarCodigo, onGuardar, onCancelar }: Props) {
  const tallaExistente = casco?.talla?.trim() || ''
  const tallaInicial = TALLAS.includes(tallaExistente) ? tallaExistente : tallaExistente ? 'Otra' : ''
  const [codigoAutomatico, setCodigoAutomatico] = useState(!casco)
  const [codigo, setCodigo] = useState(casco?.codigo || codigoInicial)
  const [nombre, setNombre] = useState(casco?.nombre || '')
  const [precio, setPrecio] = useState(String(casco?.precio ?? ''))
  const [costo, setCosto] = useState(String(casco?.costo ?? ''))
  const [stock, setStock] = useState(String(casco?.stock ?? ''))
  const [stockMinimo, setStockMinimo] = useState(String(casco?.stock_minimo ?? 5))
  const [talla, setTalla] = useState(tallaInicial)
  const [otraTalla, setOtraTalla] = useState(tallaInicial === 'Otra' ? tallaExistente : '')
  const [certificacion, setCertificacion] = useState<DatosFormularioCasco['certificacion']>((CERTIFICACIONES as readonly string[]).includes(casco?.certificacion || '') ? casco?.certificacion as DatosFormularioCasco['certificacion'] : 'Sin especificar')
  const [ubicacion, setUbicacion] = useState(casco?.ubicacion || '')
  const [proveedor, setProveedor] = useState(casco?.proveedor || '')
  const [imagenUrl, setImagenUrl] = useState(casco?.imagen_url || '')
  const [imagen, setImagen] = useState<File | null>(null)
  const [error, setError] = useState('')
  const vistaPrevia = useMemo(() => imagen ? URL.createObjectURL(imagen) : imagenUrl, [imagen, imagenUrl])

  const enviar = async () => {
    const tallaFinal = talla === 'Otra' ? otraTalla.trim() : talla
    if (!codigo.trim() || !nombre.trim() || !precio || !tallaFinal) { setError('Código, nombre, precio y talla son obligatorios.'); return }
    setError('')
    await onGuardar({ codigo: codigo.trim().toUpperCase(), codigoAutomatico, nombre: nombre.trim(), precio: Number(precio), costo: Number(costo || 0), stock: Number(stock || 0), stock_minimo: Number(stockMinimo || 0), talla: tallaFinal, certificacion, ubicacion: ubicacion.trim(), proveedor: proveedor.trim(), imagen_url: imagenUrl }, imagen)
  }

  return <div className="fl-casco-dialog-backdrop"><section className="fl-casco-form-dialog" role="dialog" aria-modal="true" aria-labelledby="titulo-formulario-casco"><header><div><span>Tipo fijo: CASCOS</span><h2 id="titulo-formulario-casco">{casco ? 'Editar casco' : 'Añadir casco'}</h2></div><button type="button" aria-label="Cerrar" onClick={onCancelar} disabled={ocupado}><X /></button></header><div className="fl-casco-form-grid">
    <label className="is-wide"><span>Código</span><div className="fl-casco-code-row"><input value={codigo} disabled={!casco && codigoAutomatico} onChange={(e) => setCodigo(e.target.value.toUpperCase())} /><label><input type="checkbox" checked={!casco && codigoAutomatico} disabled={Boolean(casco)} onChange={async (e) => { setCodigoAutomatico(e.target.checked); if (e.target.checked) setCodigo(await onGenerarCodigo()) }} />Automático</label>{!casco && codigoAutomatico && <button type="button" onClick={async () => setCodigo(await onGenerarCodigo())}>Regenerar</button>}</div>{casco && <small><AlertTriangle size={14} />Cambiar el código puede afectar búsquedas e historial.</small>}</label>
    <label className="is-wide"><span>Nombre</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
    <label><span>Tipo</span><input value="CASCOS" disabled /></label><label><span>Precio</span><input type="number" min="0" value={precio} onChange={(e) => setPrecio(e.target.value)} /></label><label><span>Costo</span><input type="number" min="0" value={costo} onChange={(e) => setCosto(e.target.value)} /></label><label><span>Existencia</span><input type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} /></label><label><span>Stock mínimo</span><input type="number" min="0" step="1" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} /></label>
    <label><span>Talla</span><select value={talla} onChange={(e) => setTalla(e.target.value)}><option value="">Selecciona</option>{TALLAS.map((valor) => <option key={valor}>{valor}</option>)}<option>Otra</option></select></label>{talla === 'Otra' && <label><span>Otra talla</span><input value={otraTalla} onChange={(e) => setOtraTalla(e.target.value)} /></label>}<label><span>Certificación</span><select value={certificacion} onChange={(e) => setCertificacion(e.target.value as DatosFormularioCasco['certificacion'])}>{CERTIFICACIONES.map((valor) => <option key={valor}>{valor}</option>)}</select></label><label><span>Ubicación</span><input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} /></label><label><span>Proveedor</span><input value={proveedor} onChange={(e) => setProveedor(e.target.value)} /></label>
    <label className="is-wide"><span>URL de imagen</span><input value={imagenUrl} onChange={(e) => setImagenUrl(e.target.value)} /></label><label className="fl-casco-image-input"><ImagePlus /><span>Seleccionar imagen</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImagen(e.target.files?.[0] || null)} /></label>{vistaPrevia && <img className="fl-casco-form-preview" src={vistaPrevia} alt="Vista previa" />}
  </div>{error && <p className="fl-casco-form-error" role="alert">{error}</p>}<footer><button type="button" onClick={onCancelar} disabled={ocupado}>Cancelar</button><button type="button" className="is-primary" onClick={() => void enviar()} disabled={ocupado}>{casco ? 'Actualizar casco' : 'Guardar casco'}</button></footer></section></div>
}
