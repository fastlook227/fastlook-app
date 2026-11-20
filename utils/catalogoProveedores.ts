import type { ProductoCatalogoProveedor, RegistroImportacionProveedor } from '../types/catalogoProveedores.ts'

export const aCentavosProveedor = (valor: number) => Math.round((Number(valor) + Number.EPSILON) * 100)
export const desdeCentavosProveedor = (centavos: number) => centavos / 100
// Política decimal única con el servidor (numeric) y los scripts: centavos enteros, mitad hacia arriba (16.15 → 21.00, no 20.99).
export const precioSugeridoProveedor = (costo: number) => desdeCentavosProveedor(Math.floor((aCentavosProveedor(costo) * 130 + 50) / 100))
export const costoConDescuentoProveedor = (precioBase: number, descuento: number) =>
  desdeCentavosProveedor(Math.round(aCentavosProveedor(precioBase) * (100 - descuento) / 100))

export const normalizarCodigoProveedor = (codigo: string) => codigo.trim().toLocaleUpperCase('es-MX')
export const codigoProveedorAmbiguo = (codigo: string) => /\*|\([^)]*[/,][^)]*\)|\b(?:DESDE|VARIOS?)\b/i.test(codigo)
export const claveProveedorCodigo = (proveedor: string, codigo: string) => `${proveedor.trim().toLocaleUpperCase('es-MX')}::${normalizarCodigoProveedor(codigo)}`

export const validarRegistroImportacion = (registro: RegistroImportacionProveedor) => {
  const errores: string[] = []
  if (!registro.codigoOriginal.trim()) errores.push('Código original vacío')
  if (!registro.nombre.trim()) errores.push('Nombre vacío')
  if (!registro.escalas.length) errores.push('Sin escala de costo')
  registro.escalas.forEach((escala) => {
    if (!Number.isFinite(escala.costoEfectivo) || escala.costoEfectivo < 0) errores.push(`Costo inválido en ${escala.nivel}`)
    if (!Number.isFinite(escala.descuentoPorcentaje) || escala.descuentoPorcentaje < 0 || escala.descuentoPorcentaje > 100) errores.push(`Descuento inválido en ${escala.nivel}`)
  })
  return { valido: errores.length === 0, errores, ambiguo: Boolean(registro.ambiguo || codigoProveedorAmbiguo(registro.codigoOriginal)) }
}

export const resumirVistaPreviaImportacion = (registros: readonly RegistroImportacionProveedor[]) => {
  const claves = new Set<string>()
  let validos = 0; let ambiguos = 0; let duplicados = 0; let sinImagen = 0
  registros.forEach((registro) => {
    const validacion = validarRegistroImportacion(registro)
    if (validacion.valido) validos += 1
    if (validacion.ambiguo) ambiguos += 1
    if (!registro.imagenReferencia) sinImagen += 1
    const clave = normalizarCodigoProveedor(registro.codigoOriginal)
    if (claves.has(clave)) duplicados += 1
    else claves.add(clave)
  })
  return { encontrados: registros.length, validos, ambiguos, duplicados, sinImagen, conErrores: registros.length - validos }
}

export const agruparCatalogoComercial = (productos: readonly ProductoCatalogoProveedor[]) => {
  const grupos = new Map<string, ProductoCatalogoProveedor[]>()
  productos.forEach((producto) => {
    const clave = producto.inventario_producto_id
      ? `inventario:${producto.inventario_producto_id}`
      : `catalogo:${producto.proveedor_clave}:${normalizarCodigoProveedor(producto.codigo_original)}`
    grupos.set(clave, [...(grupos.get(clave) || []), producto])
  })
  return [...grupos.values()]
}

export const buscarCodigoCatalogoExacto = (productos: readonly ProductoCatalogoProveedor[], codigo: string) => {
  const buscado = normalizarCodigoProveedor(codigo)
  return productos.filter((producto) => !producto.ambiguo && [producto.codigo_barras, producto.codigo_original]
    .some((valor) => valor && normalizarCodigoProveedor(valor) === buscado))
}

// Columnas que el navegador puede leer (fastlook_catalogo_piloto_seguro.sql retira costo_unitario a authenticated).
// Nunca usar select('*') en estas tablas: con privilegios por columna PostgREST lo rechaza. El Corte lee costos en el servidor.
export const COLUMNAS_VENTA_EXTERNA = 'id,ticket_id,folio,created_at,catalogo_producto_id,proveedor_id,codigo,nombre,proveedor_nombre,precio_lista,precio,precio_modificado,motivo_precio,nota_precio,descuento_conjunto,cantidad,total,metodo_pago'
export const COLUMNAS_DEVOLUCION_EXTERNA = 'id,devolucion_id,ticket_id,venta_externa_id,catalogo_producto_id,codigo,nombre,cantidad,precio_unitario_original,subtotal_devuelto,usuario_id,created_at'

// Antes de aplicar la migración de venta flexible las tablas externas no existen: se tratan como vacías.
export const esTablaNoDisponible = (error: { code?: string } | null | undefined) => error?.code === 'PGRST205' || error?.code === '42P01'
