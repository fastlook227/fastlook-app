import type { CarritoItem, Producto } from '../types/index.ts'
// @ts-expect-error Node ejecuta pruebas TypeScript nativas y requiere extensión explícita.
import { agregarProductoAlCarrito } from './ventas.ts'

export interface VentaPendiente {
  id: string
  nombre: string
  carrito: CarritoItem[]
  metodoPago: string
  createdAt: number
  updatedAt: number
}

export interface EstadoVentasPendientes {
  ventas: VentaPendiente[]
  activaId: string
}

export const crearVentaPendiente = (id: string, indice: number, ahora = Date.now()): VentaPendiente => ({
  id,
  nombre: `Cliente ${indice}`,
  carrito: [],
  metodoPago: 'Efectivo',
  createdAt: ahora,
  updatedAt: ahora,
})

export const crearEstadoVentasInicial = (): EstadoVentasPendientes => {
  const venta = crearVentaPendiente('venta-inicial', 1, 0)
  return { ventas: [venta], activaId: venta.id }
}

export const obtenerVentaActiva = (estado: EstadoVentasPendientes) =>
  estado.ventas.find((venta) => venta.id === estado.activaId) ?? estado.ventas[0]

export const actualizarVenta = (
  estado: EstadoVentasPendientes,
  ventaId: string,
  cambio: (venta: VentaPendiente) => VentaPendiente
): EstadoVentasPendientes => ({ ...estado, ventas: estado.ventas.map((venta) => venta.id === ventaId ? cambio(venta) : venta) })

export const cantidadComprometidaOtros = (estado: EstadoVentasPendientes, ventaId: string, productoId: string) =>
  estado.ventas.reduce((total, venta) => total + (venta.id === ventaId ? 0 : venta.carrito.find((item) => item.id === productoId)?.cantidad ?? 0), 0)

export const disponibleParaVenta = (estado: EstadoVentasPendientes, ventaId: string, producto: Pick<Producto, 'id' | 'stock'>) =>
  Math.max(0, Number(producto.stock) - cantidadComprometidaOtros(estado, ventaId, producto.id))

export const agregarProductoAVenta = (estado: EstadoVentasPendientes, ventaId: string, producto: Producto, ahora = Date.now()) => {
  const venta = estado.ventas.find((item) => item.id === ventaId)
  if (!venta) return { estado, ok: false, mensaje: 'La venta activa ya no existe.' }
  const disponible = disponibleParaVenta(estado, ventaId, producto)
  const resultado = agregarProductoAlCarrito(venta.carrito, { ...producto, stock: disponible })
  if (!resultado.ok) return { estado, ok: false, mensaje: disponible <= 0 ? 'No hay unidades disponibles para esta venta.' : `Disponibles para esta venta: ${disponible}` }
  return {
    estado: actualizarVenta(estado, ventaId, (actual) => ({ ...actual, carrito: resultado.carrito, updatedAt: ahora })),
    ok: true,
    mensaje: resultado.mensaje,
    cantidad: resultado.cantidad,
    disponible,
  }
}

export const cambiarCantidadEnVenta = (estado: EstadoVentasPendientes, ventaId: string, productoId: string, cantidad: number, stockTotal: number, ahora = Date.now()) => {
  const venta = estado.ventas.find((item) => item.id === ventaId)
  const item = venta?.carrito.find((producto) => producto.id === productoId)
  if (!venta || !item) return { estado, cantidad: 0, disponible: 0 }
  const productoBase = { id: item.id, stock: stockTotal }
  const disponible = disponibleParaVenta(estado, ventaId, productoBase)
  const segura = Math.max(1, Math.min(Number.isFinite(cantidad) ? Math.trunc(cantidad) : 1, disponible))
  return {
    estado: actualizarVenta(estado, ventaId, (actual) => ({ ...actual, carrito: actual.carrito.map((producto) => producto.id === productoId ? { ...producto, cantidad: segura, stock: disponible } : producto), updatedAt: ahora })),
    cantidad: segura,
    disponible,
  }
}

export const eliminarProductoDeVenta = (estado: EstadoVentasPendientes, ventaId: string, productoId: string, ahora = Date.now()) =>
  actualizarVenta(estado, ventaId, (venta) => ({ ...venta, carrito: venta.carrito.filter((item) => item.id !== productoId), updatedAt: ahora }))

export const agregarVentaPendiente = (estado: EstadoVentasPendientes, id: string, ahora = Date.now()): EstadoVentasPendientes => {
  const nueva = crearVentaPendiente(id, estado.ventas.length + 1, ahora)
  return { ventas: [...estado.ventas, nueva], activaId: nueva.id }
}

export const cerrarVentaPendiente = (estado: EstadoVentasPendientes, ventaId: string, nuevoId: string, ahora = Date.now()): EstadoVentasPendientes => {
  const restantes = estado.ventas.filter((venta) => venta.id !== ventaId)
  if (!restantes.length) {
    const nueva = crearVentaPendiente(nuevoId, 1, ahora)
    return { ventas: [nueva], activaId: nueva.id }
  }
  const indiceCerrado = estado.ventas.findIndex((venta) => venta.id === ventaId)
  const activa = estado.activaId === ventaId ? restantes[Math.min(indiceCerrado, restantes.length - 1)].id : estado.activaId
  return { ventas: restantes.map((venta, indice) => ({ ...venta, nombre: `Cliente ${indice + 1}` })), activaId: activa }
}

export const reconciliarVentasPendientes = (estado: EstadoVentasPendientes, productos: readonly Producto[], ahora = Date.now()) => {
  const activos = new Map(productos.filter((producto) => producto.archivado !== true).map((producto) => [producto.id, producto]))
  const comprometido = new Map<string, number>()
  let retirados = 0
  let ajustados = 0
  const ventasAjustadas = estado.ventas.map((venta) => {
    const carrito = venta.carrito.flatMap((item) => {
      const actual = activos.get(item.id)
      if (!actual || Number(actual.stock) <= 0) { retirados += 1; return [] }
      const restante = Math.max(0, Number(actual.stock) - (comprometido.get(item.id) ?? 0))
      if (restante <= 0) { retirados += 1; return [] }
      const cantidad = Math.min(Math.max(1, Math.trunc(Number(item.cantidad) || 1)), restante)
      if (cantidad !== Number(item.cantidad)) ajustados += 1
      comprometido.set(item.id, (comprometido.get(item.id) ?? 0) + cantidad)
      return [{ ...actual, cantidad, stock: restante } as CarritoItem]
    })
    return { ...venta, carrito, updatedAt: carrito.length === venta.carrito.length && !ajustados ? venta.updatedAt : ahora }
  })
  const totalesComprometidos = new Map<string, number>()
  ventasAjustadas.forEach((venta) => venta.carrito.forEach((item) => totalesComprometidos.set(item.id, (totalesComprometidos.get(item.id) ?? 0) + item.cantidad)))
  const ventas = ventasAjustadas.map((venta) => ({ ...venta, carrito: venta.carrito.map((item) => {
    const stockTotal = Number(activos.get(item.id)?.stock ?? 0)
    const otros = (totalesComprometidos.get(item.id) ?? 0) - item.cantidad
    return { ...item, stock: Math.max(0, stockTotal - otros) }
  }) }))
  const activaId = ventas.some((venta) => venta.id === estado.activaId) ? estado.activaId : ventas[0]?.id
  return { estado: ventas.length ? { ventas, activaId } : crearEstadoVentasInicial(), retirados, ajustados }
}

const esVentaValida = (valor: unknown): valor is VentaPendiente => {
  if (!valor || typeof valor !== 'object') return false
  const venta = valor as Partial<VentaPendiente>
  return typeof venta.id === 'string' && typeof venta.nombre === 'string' && Array.isArray(venta.carrito)
    && venta.carrito.every((item) => item && typeof item.id === 'string' && Number.isFinite(Number(item.cantidad)))
}

export const restaurarVentasPendientes = (texto: string | null): EstadoVentasPendientes | null => {
  if (!texto) return null
  try {
    const valor = JSON.parse(texto) as Partial<EstadoVentasPendientes>
    if (!Array.isArray(valor.ventas) || !valor.ventas.length || !valor.ventas.every(esVentaValida) || typeof valor.activaId !== 'string') return null
    if (!valor.ventas.some((venta) => venta.id === valor.activaId)) return null
    return { ventas: valor.ventas.map((venta) => ({ ...venta, metodoPago: ['Efectivo', 'Transferencia', 'Tarjeta'].includes(venta.metodoPago) ? venta.metodoPago : 'Efectivo', createdAt: Number.isFinite(Number(venta.createdAt)) ? Number(venta.createdAt) : Date.now(), updatedAt: Number.isFinite(Number(venta.updatedAt)) ? Number(venta.updatedAt) : Date.now() })), activaId: valor.activaId }
  } catch { return null }
}
