import type { CarritoItem, Producto, ResumenVentas, Venta } from '@/types'

export const agregarProductoAlCarrito = (carrito: CarritoItem[], producto: Producto): {
  carrito: CarritoItem[]
  ok: boolean
  cantidad?: number
  mensaje: string
} => {
  if (producto.archivado === true) return { carrito, ok: false, mensaje: 'Este producto fue eliminado y no está disponible para venta.' }
  if (Number(producto.stock) <= 0) return { carrito, ok: false, mensaje: 'Este producto no tiene stock disponible.' }
  const existente = carrito.find((item) => item.id === producto.id)
  if (existente && existente.cantidad >= Number(producto.stock)) {
    return { carrito, ok: false, mensaje: 'Ya alcanzaste el máximo disponible en el carrito.' }
  }
  const cantidad = (existente?.cantidad || 0) + 1
  const siguiente = existente
    ? carrito.map((item) => item.id === producto.id ? { ...item, cantidad } : item)
    : [...carrito, { ...producto, cantidad: 1 }]
  return { carrito: siguiente, ok: true, cantidad, mensaje: 'Producto añadido a la venta.' }
}

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
