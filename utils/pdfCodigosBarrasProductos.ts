import { jsPDF } from 'jspdf'
import type { Producto } from '@/types'
import { generarBarcodeDataUrl, obtenerValorBarcodeExacto } from '@/utils/barcodeGrafico'
import { agregarImagenContain, cargarImagenPdf, cargarImagenPdfOpcional, type ImagenPDF } from '@/utils/imagenesPdf'
import { calcularGeometriaPDF, dividirEtiquetasEnPaginas, type ModoPDFCodigosBarras } from '@/utils/seleccionCodigosBarras'
import { obtenerFechaActualFastLook } from '@/utils/fechas'

const LOGO_LOCAL = '/fast-look-logo.png'

interface ContextoEtiqueta { doc: jsPDF; producto: Producto; x: number; y: number; ancho: number; alto: number }

const obtenerValorCodigo = (producto: Producto) => obtenerValorBarcodeExacto(producto.codigo_barras as string)

const dibujarBordeRecortable = (doc: jsPDF, x: number, y: number, ancho: number, alto: number) => {
  doc.setDrawColor(145, 145, 145)
  doc.setLineDashPattern([1.5, 1.2], 0)
  doc.rect(x, y, ancho, alto)
  doc.setLineDashPattern([], 0)
}

const renderEtiquetaClasica = async (contexto: ContextoEtiqueta, obtenerImagen: (producto: Producto) => Promise<ImagenPDF | null>) => {
  const { doc, producto, x, y, ancho, alto } = contexto
  dibujarBordeRecortable(doc, x, y, ancho, alto)
  const imagen = await obtenerImagen(producto)
  if (imagen) agregarImagenContain(doc, imagen, x + 3, y + 3, ancho - 6, 22)
  else { doc.setTextColor(115, 115, 115); doc.setFontSize(7); doc.text('Sin imagen', x + ancho / 2, y + 14, { align: 'center' }) }
  doc.setTextColor(15, 15, 15); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
  doc.text(doc.splitTextToSize(producto.nombre || 'Producto sin nombre', ancho - 6).slice(0, 2), x + 3, y + 29)
  const valor = obtenerValorCodigo(producto)
  doc.addImage(generarBarcodeDataUrl(valor), 'PNG', x + 5, y + 39, ancho - 10, 18)
  doc.setFont('courier', 'bold'); doc.setFontSize(valor.length > 22 ? 7 : 8.5)
  doc.text(valor, x + ancho / 2, y + Math.min(61, alto - 4), { align: 'center', maxWidth: ancho - 8 })
}

const renderEtiquetaCompacta = (contexto: ContextoEtiqueta) => {
  const { doc, producto, x, y, ancho, alto } = contexto
  dibujarBordeRecortable(doc, x, y, ancho, alto)
  doc.setTextColor(15, 15, 15); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8)
  doc.text(doc.splitTextToSize(producto.nombre || 'Producto sin nombre', ancho - 5).slice(0, 2), x + 2.5, y + 3.8)
  const valor = obtenerValorCodigo(producto)
  doc.addImage(generarBarcodeDataUrl(valor), 'PNG', x + 3, y + 10.5, ancho - 6, 15)
  doc.setFont('courier', 'bold'); doc.setFontSize(valor.length > 20 ? 5.7 : 7)
  doc.text(valor, x + ancho / 2, y + alto - 3.2, { align: 'center', maxWidth: ancho - 5 })
}

export const generarPdfCodigosBarrasProductos = async (productos: Producto[], modo: ModoPDFCodigosBarras = 'clasico', onProgreso?: (procesados: number, total: number) => void) => {
  if (!productos.length) throw new Error('Selecciona al menos un producto.')
  productos.forEach(obtenerValorCodigo)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const paginas = dividirEtiquetasEnPaginas(productos, modo)
  const anchoPagina = doc.internal.pageSize.getWidth(); const altoPagina = doc.internal.pageSize.getHeight()
  const geometria = calcularGeometriaPDF(modo, anchoPagina, altoPagina)
  const logo = await cargarImagenPdf(LOGO_LOCAL)
  const cacheImagenes = new Map<string, Promise<ImagenPDF | null>>()
  const obtenerImagen = (producto: Producto) => {
    const clave = producto.imagen_url || `sin-imagen:${producto.id}`
    const existente = cacheImagenes.get(clave); if (existente) return existente
    const carga = cargarImagenPdfOpcional(producto.imagen_url || ''); cacheImagenes.set(clave, carga); return carga
  }
  let procesados = 0
  for (let indicePagina = 0; indicePagina < paginas.length; indicePagina += 1) {
    if (indicePagina > 0) doc.addPage('a4', 'portrait')
    const logoTamano = modo === 'clasico' ? 8 : 7
    agregarImagenContain(doc, logo, anchoPagina - logoTamano - 5, 2.5, logoTamano, logoTamano, 'JPEG')
    doc.setTextColor(24, 24, 24); doc.setFont('helvetica', 'bold'); doc.setFontSize(modo === 'clasico' ? 10 : 8)
    doc.text('FAST LOOK', geometria.margenX, 6.5); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5)
    doc.text(modo === 'clasico' ? 'Códigos de barras de productos' : 'Etiquetas de productos', geometria.margenX, 10)
    for (let posicion = 0; posicion < paginas[indicePagina].length; posicion += 1) {
      const columna = posicion % geometria.columnas; const fila = Math.floor(posicion / geometria.columnas)
      const contexto: ContextoEtiqueta = { doc, producto: paginas[indicePagina][posicion], x: geometria.margenX + columna * (geometria.anchoEtiqueta + geometria.separacionX), y: geometria.inicioY + fila * (geometria.altoEtiqueta + geometria.separacionY), ancho: geometria.anchoEtiqueta, alto: geometria.altoEtiqueta }
      if (modo === 'clasico') await renderEtiquetaClasica(contexto, obtenerImagen); else renderEtiquetaCompacta(contexto)
      procesados += 1; onProgreso?.(procesados, productos.length)
    }
    doc.setTextColor(85, 85, 85); doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
    doc.text(`Página ${indicePagina + 1} de ${paginas.length}`, anchoPagina / 2, altoPagina - 2.2, { align: 'center' })
  }
  doc.save(`FAST_LOOK_CODIGOS_BARRAS_PRODUCTOS_${modo.toUpperCase()}_${obtenerFechaActualFastLook()}.pdf`)
}
