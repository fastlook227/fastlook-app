import type { CarritoItem } from '@/types'

export const generarTextoTicket = (
  carrito: CarritoItem[],
  metodoPago: string,
  totalCarrito: number
) => {
  let texto = 'FAST LOOK\n'
  texto += 'Ticket de venta\n\n'

  carrito.forEach((item) => {
    texto += `${item.nombre}\n`
    texto += `Cantidad: ${item.cantidad}\n`
    texto += `Precio: $${item.precio}\n`
    texto += `Subtotal: $${Number(item.precio) * item.cantidad}\n\n`
  })

  texto += `Método de pago: ${metodoPago}\n`
  texto += `TOTAL: $${totalCarrito}\n`

  return texto
}
