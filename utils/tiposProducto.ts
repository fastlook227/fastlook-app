export const TIPOS_PRODUCTO_APROBADOS = [
  'ACCESORIOS', 'ACEITES', 'BALEROS', 'BATERÍAS', 'BOMBAS DE FRENO', 'CÁMARAS',
  'CADENAS', 'CASCOS', 'CHICOTES', 'DIRECCIONALES', 'ELÉCTRICO', 'ESPEJOS',
  'FAROS', 'FRENOS', 'GUANTES', 'HERRAMIENTAS', 'LLANTAS', 'LUCES', 'MANUBRIOS',
  'MOTOPARTES', 'PALANCAS', 'PLÁSTICOS', 'PUÑOS', 'REFACCIONES', 'SLIDERS',
  'SPROCKS', 'TRANSMISIÓN', 'OTROS',
] as const

export const normalizarTipoProducto = (tipo: string) => tipo.trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-MX')

export const claveSemanticaTipoProducto = (tipo: string) => normalizarTipoProducto(tipo)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')

export const obtenerTiposProducto = (tiposReales: Array<string | null | undefined>) => {
  const porClave = new Map<string, string>()
  TIPOS_PRODUCTO_APROBADOS.forEach((tipo) => porClave.set(claveSemanticaTipoProducto(tipo), tipo))
  tiposReales.forEach((tipo) => {
    const normalizado = normalizarTipoProducto(tipo || '')
    if (!normalizado) return
    const clave = claveSemanticaTipoProducto(normalizado)
    if (!porClave.has(clave)) porClave.set(clave, normalizado)
  })
  return [...porClave.values()].sort((a, b) => a.localeCompare(b, 'es-MX'))
}
