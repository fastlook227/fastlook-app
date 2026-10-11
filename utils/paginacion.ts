export const TAMANO_LOTE_PRODUCTOS = 30

export function obtenerLoteProgresivo<T>(elementos: T[], limite: number) {
  return elementos.slice(0, Math.max(0, limite))
}

export function siguienteLimiteProgresivo(actual: number, total: number, tamanoLote = TAMANO_LOTE_PRODUCTOS) {
  return Math.min(Math.max(0, actual) + tamanoLote, Math.max(0, total))
}
