import type { CarritoLinea } from '../types'
// @ts-expect-error Node ejecuta las pruebas TypeScript nativas y necesita la extensión explícita.
import { obtenerCantidadLinea, obtenerTotalLinea } from './carritoMixto.ts'

export const CLAVE_POSICION_CARRITO_MOBILE = 'fastlook_carrito_flotante_pos_mobile_v1'
export const CLAVE_POSICION_CARRITO_DESKTOP = 'fastlook_carrito_flotante_pos_desktop_v1'
export type ModoViewportCarrito = 'mobile' | 'desktop'
export const UMBRAL_ARRASTRE_PX = 8

export interface PosicionCarrito { x: number; y: number }
export interface EntornoCarrito {
  anchoViewport: number
  altoViewport: number
  anchoBurbuja: number
  altoBurbuja: number
  margen: number
  safeTop?: number
  safeRight?: number
  safeBottom?: number
  safeLeft?: number
  reservaIzquierda?: number
  reservaInferior?: number
}

export const obtenerModoViewportCarrito = (anchoViewport: number): ModoViewportCarrito => anchoViewport >= 1024 ? 'desktop' : 'mobile'
export const obtenerClavePosicionCarrito = (modo: ModoViewportCarrito) => modo === 'desktop' ? CLAVE_POSICION_CARRITO_DESKTOP : CLAVE_POSICION_CARRITO_MOBILE

export const resumirCarritoFlotante = (lineas: readonly CarritoLinea[]) => lineas.reduce(
  (resumen, linea) => ({ unidades: resumen.unidades + obtenerCantidadLinea(linea), total: resumen.total + obtenerTotalLinea(linea) }),
  { unidades: 0, total: 0 },
)

export function obtenerResumenVentaActiva<T extends { id: string; carrito: readonly CarritoLinea[] }>(ventas: readonly T[], activaId: string) {
  return resumirCarritoFlotante(ventas.find((venta) => venta.id === activaId)?.carrito || [])
}

export function limitarPosicionCarrito(posicion: PosicionCarrito, entorno: EntornoCarrito): PosicionCarrito {
  const minimoX = (entorno.safeLeft || 0) + (entorno.reservaIzquierda || 0) + entorno.margen
  const maximoX = Math.max(minimoX, entorno.anchoViewport - entorno.anchoBurbuja - (entorno.safeRight || 0) - entorno.margen)
  const minimoY = (entorno.safeTop || 0) + entorno.margen
  const maximoY = Math.max(minimoY, entorno.altoViewport - entorno.altoBurbuja - (entorno.safeBottom || 0) - (entorno.reservaInferior || 0) - entorno.margen)
  return { x: Math.min(Math.max(posicion.x, minimoX), maximoX), y: Math.min(Math.max(posicion.y, minimoY), maximoY) }
}

export function posicionInicialCarrito(entorno: EntornoCarrito) {
  return limitarPosicionCarrito({ x: entorno.anchoViewport, y: entorno.altoViewport - entorno.altoBurbuja - (entorno.reservaInferior || 0) - 92 }, entorno)
}

export const superoUmbralArrastre = (inicio: PosicionCarrito, actual: PosicionCarrito, umbral = UMBRAL_ARRASTRE_PX) => Math.hypot(actual.x - inicio.x, actual.y - inicio.y) >= umbral

export function ajustarAlBorde(posicion: PosicionCarrito, entorno: EntornoCarrito) {
  const limitada = limitarPosicionCarrito(posicion, entorno)
  const minimoX = (entorno.safeLeft || 0) + (entorno.reservaIzquierda || 0) + entorno.margen
  const maximoX = Math.max(minimoX, entorno.anchoViewport - entorno.anchoBurbuja - (entorno.safeRight || 0) - entorno.margen)
  return { x: limitada.x - minimoX <= maximoX - limitada.x ? minimoX : maximoX, y: limitada.y }
}

export const serializarPosicionCarrito = (posicion: PosicionCarrito) => JSON.stringify(posicion)
export function restaurarPosicionCarrito(valor: string | null, entorno: EntornoCarrito) {
  if (!valor) return posicionInicialCarrito(entorno)
  try {
    const posicion = JSON.parse(valor) as Partial<PosicionCarrito>
    if (!Number.isFinite(posicion.x) || !Number.isFinite(posicion.y)) return posicionInicialCarrito(entorno)
    return limitarPosicionCarrito({ x: posicion.x as number, y: posicion.y as number }, entorno)
  } catch { return posicionInicialCarrito(entorno) }
}
