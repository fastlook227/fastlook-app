export type InterpretacionStock = {
  texto: string
  numero: number
  valido: boolean
}

export const interpretarStockNuevo = (valor: string): InterpretacionStock => {
  const texto = valor.trim()
  const numero = texto !== '' ? Number(texto) : Number.NaN
  const valido = texto !== '' && Number.isInteger(numero) && numero >= 0
  return { texto, numero, valido }
}

export const crearArgumentosCambioStock = ({
  productoId,
  stockEsperado,
  stockNuevoTexto,
  motivo,
}: {
  productoId: string
  stockEsperado: number
  stockNuevoTexto: string
  motivo: string
}) => {
  const interpretacion = interpretarStockNuevo(stockNuevoTexto)
  if (!interpretacion.valido) return null
  return {
    p_producto_id: productoId,
    p_stock_esperado: stockEsperado,
    p_stock_nuevo: interpretacion.numero,
    p_motivo: motivo.trim() || null,
  }
}
