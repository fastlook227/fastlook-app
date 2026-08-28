import JsBarcode from 'jsbarcode'

export const obtenerValorBarcodeExacto = (valor: string) => {
  if (typeof valor !== 'string' || valor.length === 0) {
    throw new Error('El producto no tiene un código de barras válido.')
  }
  return valor
}

export const generarBarcodeDataUrl = (valor: string) => {
  const exacto = obtenerValorBarcodeExacto(valor)
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, exacto, {
    format: 'CODE128',
    displayValue: false,
    background: '#ffffff',
    lineColor: '#000000',
    width: 2.5,
    height: 64,
    margin: 10,
  })
  return canvas.toDataURL('image/png')
}
