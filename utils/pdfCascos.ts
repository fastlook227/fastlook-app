import { jsPDF } from 'jspdf'
import type { CascoCatalogo, OpcionesPDFCascos } from '@/types/cascos'

interface ImagenPDF {
  dataUrl: string
  ancho: number
  alto: number
}

interface GenerarPDFCascosParams {
  cascos: CascoCatalogo[]
  opciones: OpcionesPDFCascos
  onProgreso?: (procesado: number, total: number) => void
}

const cargarImagen = async (url: string): Promise<ImagenPDF> => {
  if (!url) throw new Error('Imagen no disponible')
  const respuesta = await fetch(url)
  if (!respuesta.ok) throw new Error('Imagen no disponible')
  const blob = await respuesta.blob()
  const origen = URL.createObjectURL(blob)
  try {
    const imagen = await new Promise<HTMLImageElement>((resolve, reject) => {
      const elemento = new Image()
      elemento.onload = () => resolve(elemento)
      elemento.onerror = () => reject(new Error('Imagen no disponible'))
      elemento.src = origen
    })
    const escala = Math.min(1, 1200 / Math.max(imagen.naturalWidth, imagen.naturalHeight))
    const ancho = Math.max(1, Math.round(imagen.naturalWidth * escala))
    const alto = Math.max(1, Math.round(imagen.naturalHeight * escala))
    const canvas = document.createElement('canvas')
    canvas.width = ancho
    canvas.height = alto
    const contexto = canvas.getContext('2d')
    if (!contexto) throw new Error('Imagen no disponible')
    contexto.fillStyle = '#ffffff'
    contexto.fillRect(0, 0, ancho, alto)
    contexto.drawImage(imagen, 0, 0, ancho, alto)
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.84), ancho, alto }
  } finally {
    URL.revokeObjectURL(origen)
  }
}

const agregarImagenContain = (doc: jsPDF, imagen: ImagenPDF, x: number, y: number, anchoMaximo: number, altoMaximo: number) => {
  const escala = Math.min(anchoMaximo / imagen.ancho, altoMaximo / imagen.alto)
  const ancho = imagen.ancho * escala
  const alto = imagen.alto * escala
  doc.addImage(imagen.dataUrl, 'JPEG', x + (anchoMaximo - ancho) / 2, y + (altoMaximo - alto) / 2, ancho, alto)
}

export const generarPDFCascos = async ({ cascos, opciones, onProgreso }: GenerarPDFCascosParams) => {
  if (!cascos.length) throw new Error('Selecciona al menos un casco.')
  const incluidos = opciones.incluirAgotados ? cascos : cascos.filter((casco) => Number(casco.stock || 0) > 0)
  if (!incluidos.length) throw new Error('Selecciona al menos un casco disponible.')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const anchoPagina = doc.internal.pageSize.getWidth()
  const altoPagina = doc.internal.pageSize.getHeight()
  const margenX = 10
  const inicioY = 24
  const pie = 10
  const separacion = 5
  const anchoCelda = (anchoPagina - margenX * 2 - separacion) / 2
  const altoCelda = (altoPagina - inicioY - pie - separacion * 2) / 3
  const imagenes = new Map<string, Promise<ImagenPDF | null>>()
  const obtenerImagen = (casco: CascoCatalogo) => {
    const clave = casco.id || casco.imagen_url || casco.codigo
    const existente = imagenes.get(clave)
    if (existente) return existente
    const carga = cargarImagen(casco.imagen_url || '').catch(() => null)
    imagenes.set(clave, carga)
    return carga
  }

  for (let indice = 0; indice < incluidos.length; indice += 1) {
    if (indice > 0 && indice % 6 === 0) doc.addPage('letter', 'portrait')
    const posicion = indice % 6
    const columna = posicion % 2
    const fila = Math.floor(posicion / 2)
    const x = margenX + columna * (anchoCelda + separacion)
    const y = inicioY + fila * (altoCelda + separacion)
    const casco = incluidos[indice]

    doc.setDrawColor(215, 217, 221)
    doc.setFillColor(250, 250, 250)
    doc.roundedRect(x, y, anchoCelda, altoCelda, 2, 2, 'FD')
    const imagenX = x + 3
    const imagenY = y + 3
    const imagenAncho = anchoCelda - 6
    const imagenAlto = 43
    const imagen = await obtenerImagen(casco)
    if (imagen) {
      agregarImagenContain(doc, imagen, imagenX, imagenY, imagenAncho, imagenAlto)
    } else {
      doc.setTextColor(115, 115, 115)
      doc.setFontSize(9)
      doc.text('Imagen no disponible', x + anchoCelda / 2, imagenY + imagenAlto / 2, { align: 'center' })
    }

    let textoY = imagenY + imagenAlto + 5
    doc.setTextColor(18, 18, 18)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    const nombre = doc.splitTextToSize(casco.nombre || 'Casco sin nombre', anchoCelda - 6).slice(0, 2)
    doc.text(nombre, x + 3, textoY)
    textoY += nombre.length * 4.1
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Código: ${casco.codigo || '—'}`, x + 3, textoY)
    textoY += 3.7
    doc.text(`Talla: ${casco.talla || '—'}  ·  Certificación: ${casco.certificacion || '—'}`, x + 3, textoY, { maxWidth: anchoCelda - 6 })
    textoY += 3.7
    if (opciones.incluirPrecio) {
      doc.setFont('helvetica', 'bold')
      doc.text(`Precio: $${Number(casco.precio || 0).toLocaleString('es-MX')}`, x + 3, textoY)
      textoY += 3.7
    }
    if (opciones.incluirStock) {
      doc.setFont('helvetica', 'normal')
      doc.text(`Stock: ${Number(casco.stock || 0)}`, x + 3, textoY)
    }
    onProgreso?.(indice + 1, incluidos.length)
  }

  const totalPaginas = doc.getNumberOfPages()
  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    doc.setPage(pagina)
    doc.setTextColor(20, 20, 20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('FAST LOOK – Identificación de cascos', anchoPagina / 2, 14, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Página ${pagina} de ${totalPaginas}`, anchoPagina / 2, altoPagina - 4, { align: 'center' })
  }

  const fecha = new Date().toLocaleDateString('en-CA')
  doc.save(`cascos-fast-look-${fecha}.pdf`)
}
