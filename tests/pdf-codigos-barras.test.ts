import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { obtenerValorBarcodeExacto } from '../utils/barcodeGrafico.ts'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { cargarImagenPdfOpcional } from '../utils/imagenesPdf.ts'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { alternarIdSeleccionado, calcularPaginasEtiquetas, dividirEtiquetasEnPaginas, seleccionarIdsConCodigoBarras, seleccionarIdsProductos, separarProductosPorCodigoBarras } from '../utils/seleccionCodigosBarras.ts'

test('calcula páginas con un máximo exacto de ocho etiquetas', () => {
  assert.equal(calcularPaginasEtiquetas(1), 1)
  assert.equal(calcularPaginasEtiquetas(8), 1)
  assert.equal(calcularPaginasEtiquetas(9), 2)
  assert.equal(calcularPaginasEtiquetas(16), 2)
  assert.equal(calcularPaginasEtiquetas(17), 3)
  assert.deepEqual(dividirEtiquetasEnPaginas(Array.from({ length: 17 }, (_, i) => i)).map((pagina) => pagina.length), [8, 8, 1])
})

test('selecciona, deselecciona y limita la selección a productos con barcode', () => {
  const productos = [{ id: '1', codigo_barras: 'FL-0448' }, { id: '2', codigo_barras: null }]
  assert.deepEqual([...seleccionarIdsProductos(productos)], ['1', '2'])
  assert.deepEqual([...seleccionarIdsConCodigoBarras(productos)], ['1'])
  assert.deepEqual([...alternarIdSeleccionado(new Set(['1']), '1')], [])
  assert.deepEqual([...alternarIdSeleccionado(new Set<string>(), '2')], ['2'])
  assert.equal(separarProductosPorCodigoBarras(productos).sinCodigo.length, 1)
})

test('CODE128 recibe exactamente el barcode original', () => {
  assert.equal(obtenerValorBarcodeExacto('FL-0448'), 'FL-0448')
  assert.equal(obtenerValorBarcodeExacto('0123456789012'), '0123456789012')
  assert.equal(obtenerValorBarcodeExacto('7501234567890'), '7501234567890')
  assert.throws(() => obtenerValorBarcodeExacto(''))
})

test('nombres largos, productos sin imagen y barcodes no se alteran al paginar', () => {
  const producto = { nombre: 'NOMBRE MUY LARGO '.repeat(12), imagen_url: '', codigo_barras: 'FL-0448' }
  const paginas = dividirEtiquetasEnPaginas([producto])
  assert.equal(paginas[0][0].nombre, producto.nombre)
  assert.equal(paginas[0][0].imagen_url, '')
  assert.equal(paginas[0][0].codigo_barras, 'FL-0448')
})

test('una imagen fallida se convierte en ausencia opcional sin cancelar el lote', async () => {
  const resultado = await cargarImagenPdfOpcional('https://invalida.test/imagen.jpg', async () => {
    throw new Error('CORS')
  })
  assert.equal(resultado, null)
})
