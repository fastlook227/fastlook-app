import type { CarritoLinea } from '@/types'
import { obtenerNombreLinea, obtenerPrecioLinea } from '@/utils/carritoMixto'

export const generarTextoTicket = (
  carrito: CarritoLinea[],
  metodoPago: string,
  totalCarrito: number
) => {
  let texto = 'FAST LOOK\n'
  texto += 'Ticket de venta\n\n'

  carrito.forEach((item) => {
    texto += `${obtenerNombreLinea(item)}\n`
    texto += `Cantidad: ${item.cantidad}\n`
    texto += `Precio: $${obtenerPrecioLinea(item)}\n`
    texto += `Subtotal: $${obtenerPrecioLinea(item) * item.cantidad}\n\n`
  })

  texto += `Método de pago: ${metodoPago}\n`
  texto += `TOTAL: $${totalCarrito}\n`

  return texto
}
