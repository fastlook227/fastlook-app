import type { Producto, ResumenVentas, Venta } from '@/types'

export const calcularGananciaVentas = (
  listaVentas: Venta[],
  productos: Producto[]
) => {
  let ganancia = 0

  listaVentas.forEach((v) => {
    const producto = productos.find((p) => p.id === v.producto_id)

    if (producto) {
      const costo = Number(producto.costo || 0)
      const precio = Number(v.precio || 0)

      ganancia += (precio - costo) * Number(v.cantidad || 0)
    }
  })

  return ganancia
}

export const calcularResumenVentas = (
  listaVentas: Venta[],
  productos: Producto[]
): ResumenVentas => {
  const total = listaVentas.reduce(
    (acc, v) => acc + Number(v.total || 0),
    0
  )

  const productosVendidos = listaVentas.reduce(
    (acc, v) => {
      if (v.codigo === 'ABONO') return acc
      return acc + Number(v.cantidad || 0)
    },
    0
  )

  const metodos = listaVentas.reduce((acc: Record<string, number>, v) => {
    const metodo = v.metodo_pago || 'Efectivo'
    acc[metodo] = (acc[metodo] || 0) + Number(v.total || 0)
    return acc
  }, {})

  const ganancia = calcularGananciaVentas(listaVentas, productos)

  return {
    total,
    productosVendidos,
    numeroVentas: listaVentas.length,
    ganancia,
    metodos,
  }
}
