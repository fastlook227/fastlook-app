export const CORREO_CORTE_CAJA = 'enrique.reynaldo.vargas.227@gmail.com'

export function puedeAccederCorteCaja(correo?: string | null): boolean {
  return typeof correo === 'string'
    && correo.trim().toLowerCase() === CORREO_CORTE_CAJA
}
