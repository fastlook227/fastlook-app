'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Eye, Images, Pencil, Trash2, X } from 'lucide-react'

interface SelectorImagenProps {
  imagenUrl?: string
  archivo?: File | null
  deshabilitado?: boolean
  onSeleccionar: (archivo: File) => void | Promise<void>
  onEliminar: () => void
}

export default function SelectorImagen({ imagenUrl = '', archivo = null, deshabilitado = false, onSeleccionar, onEliminar }: SelectorImagenProps) {
  const camaraRef = useRef<HTMLInputElement>(null)
  const galeriaRef = useRef<HTMLInputElement>(null)
  const [mostrarOpciones, setMostrarOpciones] = useState(!imagenUrl && !archivo)
  const [verGrande, setVerGrande] = useState(false)
  const [urlArchivo, setUrlArchivo] = useState('')
  const vistaPrevia = urlArchivo || imagenUrl

  useEffect(() => {
    if (!archivo) { setUrlArchivo(''); return }
    const url = URL.createObjectURL(archivo)
    setUrlArchivo(url)
    return () => URL.revokeObjectURL(url)
  }, [archivo])

  useEffect(() => {
    if (imagenUrl || archivo) setMostrarOpciones(false)
  }, [imagenUrl, archivo])

  const seleccionar = (archivoSeleccionado?: File) => {
    if (!archivoSeleccionado) return
    void onSeleccionar(archivoSeleccionado)
  }
  const limpiarInput = (input: HTMLInputElement | null) => { if (input) input.value = '' }

  return <section className="fl-image-picker" aria-label="Imagen del producto">
    {vistaPrevia && <div className="fl-image-preview"><img src={vistaPrevia} alt="Vista previa de la imagen" /><div className="fl-image-preview-actions"><button type="button" onClick={() => setMostrarOpciones(true)} disabled={deshabilitado}><Pencil size={17} />Cambiar imagen</button><button type="button" onClick={() => { onEliminar(); setMostrarOpciones(true) }} disabled={deshabilitado}><Trash2 size={17} />Eliminar imagen</button><button type="button" onClick={() => setVerGrande(true)}><Eye size={17} />Ver grande</button></div></div>}
    {mostrarOpciones && <div className="fl-image-source-actions"><button type="button" aria-label="Tomar fotografía" onClick={() => { limpiarInput(camaraRef.current); camaraRef.current?.click() }} disabled={deshabilitado}><Camera size={22} /><span><strong>Tomar foto</strong><small>Usar cámara trasera</small></span></button><button type="button" aria-label="Elegir imagen de galería" onClick={() => { limpiarInput(galeriaRef.current); galeriaRef.current?.click() }} disabled={deshabilitado}><Images size={22} /><span><strong>Elegir de galería</strong><small>Buscar en el dispositivo</small></span></button></div>}
    <input ref={camaraRef} className="fl-visually-hidden" type="file" accept="image/*" capture="environment" onChange={(e) => seleccionar(e.target.files?.[0])} disabled={deshabilitado} />
    <input ref={galeriaRef} className="fl-visually-hidden" type="file" accept="image/*" onChange={(e) => seleccionar(e.target.files?.[0])} disabled={deshabilitado} />
    {verGrande && vistaPrevia && <div className="fl-image-viewer" role="dialog" aria-modal="true" aria-label="Vista ampliada de la imagen"><button type="button" aria-label="Cerrar vista ampliada" onClick={() => setVerGrande(false)}><X /></button><img src={vistaPrevia} alt="Vista ampliada de la imagen" /></div>}
  </section>
}
