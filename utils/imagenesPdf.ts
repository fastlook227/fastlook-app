import type { jsPDF } from 'jspdf'

export interface ImagenPDF {
  dataUrl: string
  ancho: number
  alto: number
}

export const cargarImagenPdf = async (url: string): Promise<ImagenPDF> => {
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

export const cargarImagenPdfOpcional = async (
  url: string,
  cargador: (url: string) => Promise<ImagenPDF> = cargarImagenPdf
) => cargador(url).catch(() => null)

export const agregarImagenContain = (
  doc: jsPDF,
  imagen: ImagenPDF,
  x: number,
  y: number,
  anchoMaximo: number,
  altoMaximo: number,
  formato: 'JPEG' | 'PNG' = 'JPEG'
) => {
  const escala = Math.min(anchoMaximo / imagen.ancho, altoMaximo / imagen.alto)
  const ancho = imagen.ancho * escala
  const alto = imagen.alto * escala
  doc.addImage(imagen.dataUrl, formato, x + (anchoMaximo - ancho) / 2, y + (altoMaximo - alto) / 2, ancho, alto)
}
