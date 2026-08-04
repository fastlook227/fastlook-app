import type { SupabaseClient } from '@supabase/supabase-js'

export const normalizarCodigoProducto = (codigo: string) => codigo.trim().toUpperCase()

export const extraerNumeroCodigoFastLook = (codigo: string) => {
  const coincidencia = normalizarCodigoProducto(codigo).match(/^FL-(\d{4})$/)
  return coincidencia ? Number(coincidencia[1]) : null
}

export const calcularSiguienteCodigoFastLook = (codigos: string[]) => {
  const numeros = codigos
    .map(extraerNumeroCodigoFastLook)
    .filter((numero): numero is number => numero !== null)
  const siguiente = (numeros.length ? Math.max(...numeros) : 0) + 1
  if (siguiente > 9999) throw new Error('Se agotó la numeración disponible con formato FL-####.')
  return `FL-${String(siguiente).padStart(4, '0')}`
}

const obtenerCodigosProducto = async (cliente: SupabaseClient) => {
  const { data, error } = await cliente.from('productos').select('id,codigo')
  if (error) throw new Error('No fue posible consultar los códigos existentes: ' + error.message)
  return (data || []) as Array<{ id: string; codigo: string | null }>
}

export const comprobarCodigoProducto = async (
  cliente: SupabaseClient,
  codigo: string,
  productoIdExcluir?: string
) => {
  const buscado = normalizarCodigoProducto(codigo)
  const codigos = await obtenerCodigosProducto(cliente)
  return codigos.some((producto) => producto.id !== productoIdExcluir && normalizarCodigoProducto(producto.codigo || '') === buscado)
}

export const generarCodigoProductoDisponible = async (cliente: SupabaseClient) => {
  const productos = await obtenerCodigosProducto(cliente)
  const existentes = new Set(productos.map((producto) => normalizarCodigoProducto(producto.codigo || '')))
  let candidato = calcularSiguienteCodigoFastLook([...existentes])
  while (existentes.has(candidato)) {
    const numero = extraerNumeroCodigoFastLook(candidato)
    if (numero === null || numero >= 9999) throw new Error('No fue posible encontrar un código FL disponible.')
    candidato = `FL-${String(numero + 1).padStart(4, '0')}`
  }
  return candidato
}

export const esErrorCodigoDuplicado = (error: { code?: string; message?: string }) =>
  error.code === '23505' && /codigo|productos_codigo_key/i.test(error.message || '')
