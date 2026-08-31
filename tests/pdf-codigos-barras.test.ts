import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { obtenerValorBarcodeExacto } from '../utils/barcodeGrafico.ts'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { cargarImagenPdfOpcional } from '../utils/imagenesPdf.ts'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { agregarIdsSeleccionados, alternarIdSeleccionado, calcularGeometriaPDF, calcularPaginasEtiquetas, calcularPaginasPDF, dividirEtiquetasEnPaginas, quitarIdsSeleccionados, reconciliarIdsSeleccionados, seleccionarIdsConCodigoBarras, seleccionarIdsProductos, separarProductosPorCodigoBarras } from '../utils/seleccionCodigosBarras.ts'

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

test('modo etiquetas pagina en grupos máximos de 24', () => {
  assert.equal(calcularPaginasPDF(1, 'etiquetas'), 1)
  assert.equal(calcularPaginasPDF(24, 'etiquetas'), 1)
  assert.equal(calcularPaginasPDF(25, 'etiquetas'), 2)
  assert.equal(calcularPaginasPDF(48, 'etiquetas'), 2)
  assert.equal(calcularPaginasPDF(49, 'etiquetas'), 3)
  assert.deepEqual(dividirEtiquetasEnPaginas(Array.from({ length: 49 }, (_, i) => i), 'etiquetas').map((pagina) => pagina.length), [24, 24, 1])
})

test('seleccionar visibles agrega y deseleccionar visibles conserva lo no visible', () => {
  const seleccionInicial = new Set(['aceite', 'foco', 'punos'])
  const palancas = ['a', 'b', 'c', 'd'].map((id) => ({ id: `palanca-${id}` }))
  const ampliada = agregarIdsSeleccionados(seleccionInicial, palancas)
  assert.equal(ampliada.size, 7)
  assert.deepEqual([...quitarIdsSeleccionados(ampliada, palancas)], ['aceite', 'foco', 'punos'])
  assert.equal(new Set<string>().size, 0)
})

test('búsqueda y cambio de modo no alteran IDs; la reconciliación elimina inexistentes', () => {
  const seleccion = new Set(['1', '2', 'archivado'])
  assert.deepEqual([...seleccion], ['1', '2', 'archivado'])
  assert.equal(calcularPaginasPDF(seleccion.size, 'clasico'), 1)
  assert.equal(calcularPaginasPDF(seleccion.size, 'etiquetas'), 1)
  assert.deepEqual([...reconciliarIdsSeleccionados(seleccion, [{ id: '1' }, { id: '2' }])], ['1', '2'])
})

test('las geometrías 2×4 y 3×8 permanecen dentro del A4', () => {
  for (const modo of ['clasico', 'etiquetas'] as const) {
    const geometria = calcularGeometriaPDF(modo)
    const bordeDerecho = geometria.margenX + geometria.columnas * geometria.anchoEtiqueta + (geometria.columnas - 1) * geometria.separacionX
    const bordeInferior = geometria.inicioY + geometria.filas * geometria.altoEtiqueta + (geometria.filas - 1) * geometria.separacionY
    assert.ok(bordeDerecho <= 210)
    assert.ok(bordeInferior <= 297 - geometria.margenInferior + 1e-9)
  }
})
