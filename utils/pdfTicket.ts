import { jsPDF } from 'jspdf'
import type { Venta } from '@/types'
import { formatearFechaHoraFastLook } from '@/utils/fechas'

const logoUrl = 'https://i.postimg.cc/T1KLqYXb/Chat-GPT-Image-4-dic-2025-11-34-20-p-m.png'

const cargarImagenBase64 = async (url: string) => {
  const respuesta = await fetch(url)
  if (!respuesta.ok) throw new Error('No fue posible cargar el logo.')
  const blob = await respuesta.blob()
  return await new Promise<string>((resolve, reject) => {
    const lector = new FileReader()
    lector.onloadend = () => resolve(lector.result as string)
    lector.onerror = () => reject(new Error('No fue posible leer el logo.'))
    lector.readAsDataURL(blob)
  })
}

export async function generarPdfTicketHistorico(lineas: Venta[]) {
  if (!lineas.length) throw new Error('La venta no contiene productos.')
  const ordenadas = [...lineas].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const primera = ordenadas[0]
  if (!primera.ticket_id || !primera.folio) throw new Error('La venta no tiene un ticket válido.')
  if (ordenadas.some((linea) => linea.ticket_id !== primera.ticket_id || linea.folio !== primera.folio)) throw new Error('Las líneas no pertenecen al mismo ticket.')

  const total = ordenadas.reduce((suma, linea) => suma + Number(linea.total || 0), 0)
  const altoTicket = Math.max(180, 120 + ordenadas.length * 14)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, altoTicket] })
  let y = 8

  try {
    doc.addImage(await cargarImagenBase64(logoUrl), 'PNG', 25, y, 30, 30)
    y += 34
  } catch {
    y += 4
  }

  doc.setFontSize(11); doc.text('FAST LOOK', 40, y, { align: 'center' }); y += 5
  doc.setFontSize(8); doc.text('Accesorios para moto', 40, y, { align: 'center' }); y += 7
  doc.text(`Folio: ${primera.folio}`, 5, y); y += 4
  doc.text(`Fecha: ${formatearFechaHoraFastLook(primera.created_at)}`, 5, y); y += 4
  doc.text(`Método de pago: ${primera.metodo_pago || 'Sin especificar'}`, 5, y); y += 6
  doc.line(5, y, 75, y); y += 5

  ordenadas.forEach((linea) => {
    const nombre = String(linea.nombre || 'Producto')
    const precio = Number(linea.precio || 0)
    const cantidad = Number(linea.cantidad || 0)
    doc.setFontSize(8)
    doc.text(nombre.length > 28 ? `${nombre.slice(0, 28)}...` : nombre, 5, y); y += 4
    doc.text(`${cantidad} x $${precio.toFixed(2)}`, 5, y)
    doc.text(`$${Number(linea.total || precio * cantidad).toFixed(2)}`, 75, y, { align: 'right' }); y += 5
  })

  doc.line(5, y, 75, y); y += 6
  doc.setFontSize(12); doc.text('TOTAL:', 5, y); doc.text(`$${total.toFixed(2)}`, 75, y, { align: 'right' }); y += 8
  doc.setFontSize(8); doc.text('Gracias por tu compra', 40, y, { align: 'center' }); y += 4
  doc.text('FAST LOOK', 40, y, { align: 'center' })
  doc.save(`ticket-fastlook-${primera.folio}.pdf`)
}
