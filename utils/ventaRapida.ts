import type { Producto, Venta } from '../types/index.ts'

const cantidadVenta = (venta: Venta) => {
  const cantidad = Number(venta.cantidad ?? 0)
  return Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 0
}

export const obtenerProductosFrecuentes = (
  productos: readonly Producto[],
  ventas: readonly Venta[],
  limite = 10
) => {
  const activos = new Map(productos.filter((producto) => producto.archivado !== true).map((producto) => [producto.id, producto]))
  const cantidades = new Map<string, number>()
  ventas.forEach((venta) => {
    if (!venta.producto_id || !activos.has(venta.producto_id)) return
    cantidades.set(venta.producto_id, (cantidades.get(venta.producto_id) ?? 0) + cantidadVenta(venta))
  })
  return [...cantidades.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([id]) => activos.get(id)!)
}

export const obtenerUltimosProductosVendidos = (
  productos: readonly Producto[],
  ventas: readonly Venta[],
  limite = 8
) => {
  const activos = new Map(productos.filter((producto) => producto.archivado !== true).map((producto) => [producto.id, producto]))
  const vistos = new Set<string>()
  return [...ventas]
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    .flatMap((venta) => {
      const id = venta.producto_id
      if (!id || vistos.has(id) || !activos.has(id)) return []
      vistos.add(id)
      return [activos.get(id)!]
    })
    .slice(0, limite)
}

export const limitarCantidadAStock = (cantidad: number, stock: number) => {
  if (!Number.isFinite(cantidad)) return 1
  return Math.max(1, Math.min(Math.trunc(cantidad), Math.max(1, Math.trunc(stock))))
}

export const resumirCarritoVenta = (carrito: readonly { cantidad: number; precio: number }[]) => ({
  unidades: carrito.reduce((total, item) => total + item.cantidad, 0),
  total: carrito.reduce((total, item) => total + Number(item.precio) * item.cantidad, 0),
})

export const intentarBloquearCobro = (control: { current: boolean }) => {
  if (control.current) return false
  control.current = true
  return true
}

export const liberarBloqueoCobro = (control: { current: boolean }) => { control.current = false }

export const crearIntentoCobro = (
  carrito: readonly { id: string; cantidad: number }[],
  metodoPago: string,
  idempotencyKey: string
) => ({
  idempotencyKey,
  metodoPago,
  lineas: carrito.map((item) => ({ producto_id: item.id, cantidad: item.cantidad })),
})

export const carritoDespuesDeCobro = <T>(carrito: readonly T[], exitoso: boolean): T[] =>
  exitoso ? [] : [...carrito]
