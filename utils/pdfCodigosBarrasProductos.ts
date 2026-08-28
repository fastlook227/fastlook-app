import { jsPDF } from 'jspdf'
import type { Producto } from '@/types'
import { generarBarcodeDataUrl, obtenerValorBarcodeExacto } from '@/utils/barcodeGrafico'
import { agregarImagenContain, cargarImagenPdf, cargarImagenPdfOpcional } from '@/utils/imagenesPdf'
import { dividirEtiquetasEnPaginas } from '@/utils/seleccionCodigosBarras'
import { obtenerFechaActualFastLook } from '@/utils/fechas'

const LOGO_LOCAL = '/fast-look-logo.png'

export const generarPdfCodigosBarrasProductos = async (
  productos: Producto[],
  onProgreso?: (procesados: number, total: number) => void
) => {
  if (!productos.length) throw new Error('Selecciona al menos un producto.')
  productos.forEach((producto) => obtenerValorBarcodeExacto(producto.codigo_barras as string))

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const paginas = dividirEtiquetasEnPaginas(productos)
  const anchoPagina = doc.internal.pageSize.getWidth()
  const margenX = 7
  const inicioY = 17
  const margenInferior = 6
  const separacionX = 2
  const separacionY = 2
  const anchoEtiqueta = (anchoPagina - margenX * 2 - separacionX) / 2
  const altoPagina = doc.internal.pageSize.getHeight()
  const altoEtiqueta = (altoPagina - inicioY - margenInferior - separacionY * 3) / 4
  const cacheImagenes = new Map<string, Promise<Awaited<ReturnType<typeof cargarImagenPdf>> | null>>()
  const logo = await cargarImagenPdf(LOGO_LOCAL)

  const obtenerImagenProducto = (producto: Producto) => {
    const clave = producto.imagen_url || `sin-imagen:${producto.id}`
    const existente = cacheImagenes.get(clave)
    if (existente) return existente
    const carga = cargarImagenPdfOpcional(producto.imagen_url || '')
    cacheImagenes.set(clave, carga)
    return carga
  }

  let procesados = 0
  for (let indicePagina = 0; indicePagina < paginas.length; indicePagina += 1) {
    if (indicePagina > 0) doc.addPage('a4', 'portrait')
    agregarImagenContain(doc, logo, anchoPagina - 18, 3, 11, 11, 'JPEG')
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(24, 24, 24)
    doc.setFontSize(10)
    doc.text('FAST LOOK', margenX, 7)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text('Códigos de barras de productos', margenX, 11)

    for (let posicion = 0; posicion < paginas[indicePagina].length; posicion += 1) {
      const producto = paginas[indicePagina][posicion]
      const columna = posicion % 2
      const fila = Math.floor(posicion / 2)
      const x = margenX + columna * (anchoEtiqueta + separacionX)
      const y = inicioY + fila * (altoEtiqueta + separacionY)
      const padding = 3

      doc.setDrawColor(145, 145, 145)
      doc.setLineDashPattern([1.5, 1.2], 0)
      doc.rect(x, y, anchoEtiqueta, altoEtiqueta)
      doc.setLineDashPattern([], 0)

      const imagen = await obtenerImagenProducto(producto)
      const imagenX = x + padding
      const imagenY = y + padding
      const imagenAncho = anchoEtiqueta - padding * 2
      const imagenAlto = 22
      if (imagen) {
        agregarImagenContain(doc, imagen, imagenX, imagenY, imagenAncho, imagenAlto)
      } else {
        doc.setTextColor(115, 115, 115)
        doc.setFontSize(7)
        doc.text('Sin imagen', x + anchoEtiqueta / 2, imagenY + imagenAlto / 2, { align: 'center' })
      }

      doc.setTextColor(15, 15, 15)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      const lineasNombre = doc.splitTextToSize(producto.nombre || 'Producto sin nombre', anchoEtiqueta - padding * 2).slice(0, 2)
      doc.text(lineasNombre, x + padding, y + 29)

      const valor = obtenerValorBarcodeExacto(producto.codigo_barras as string)
      const barcode = generarBarcodeDataUrl(valor)
      doc.addImage(barcode, 'PNG', x + 5, y + 39, anchoEtiqueta - 10, 18)
      doc.setFont('courier', 'bold')
      doc.setFontSize(valor.length > 22 ? 7 : 8.5)
      doc.text(valor, x + anchoEtiqueta / 2, y + 61, { align: 'center', maxWidth: anchoEtiqueta - 8 })

      procesados += 1
      onProgreso?.(procesados, productos.length)
    }

    doc.setTextColor(85, 85, 85)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text(`Página ${indicePagina + 1} de ${paginas.length}`, anchoPagina / 2, altoPagina - 2.5, { align: 'center' })
  }

  doc.save(`FAST_LOOK_CODIGOS_BARRAS_PRODUCTOS_${obtenerFechaActualFastLook()}.pdf`)
}
