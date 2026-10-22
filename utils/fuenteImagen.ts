export interface FuentesImagen { preferida: string; alterna: string }

// Devuelve la única fuente que debe descargarse y la reserva que sólo se usa si esa falla.
export const elegirFuentesImagen = (principal: string, miniatura?: string | null, usarPrincipal?: boolean | null): FuentesImagen => {
  const preferida = usarPrincipal || !miniatura ? principal : miniatura
  const alterna = preferida === principal ? miniatura || '' : principal
  return { preferida, alterna: alterna === preferida ? '' : alterna }
}
