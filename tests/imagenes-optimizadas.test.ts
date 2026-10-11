import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { obtenerLoteProgresivo, siguienteLimiteProgresivo, TAMANO_LOTE_PRODUCTOS } from '../utils/paginacion.ts'

test('la lista inicial limita a 30 productos sin alterar el arreglo original', () => {
  const productos = Array.from({ length: 775 }, (_, indice) => indice)
  assert.equal(TAMANO_LOTE_PRODUCTOS, 30)
  assert.deepEqual(obtenerLoteProgresivo(productos, 30), productos.slice(0, 30))
  assert.equal(productos.length, 775)
})

test('la carga progresiva llega al total sin excederlo', () => {
  assert.equal(siguienteLimiteProgresivo(30, 775), 60)
  assert.equal(siguienteLimiteProgresivo(750, 775), 775)
  assert.equal(siguienteLimiteProgresivo(775, 775), 775)
})

const imagen = readFileSync(new URL('../components/ImagenProducto.tsx', import.meta.url), 'utf8')
const compresion = readFileSync(new URL('../utils/imagenes.ts', import.meta.url), 'utf8')
const migracion = readFileSync(new URL('../fastlook_fase_imagenes_optimizadas.sql', import.meta.url), 'utf8')
const huerfanas = readFileSync(new URL('../consultas/imagenes_storage_sin_referencia.sql', import.meta.url), 'utf8')

test('las imágenes de lista son diferidas, asíncronas y prefieren miniatura', () => {
  assert.match(imagen, /miniatura \|\| src/)
  assert.match(imagen, /loading="lazy"/)
  assert.match(imagen, /decoding="async"/)
  assert.match(imagen, /fetchPriority="low"/)
})

test('genera principal y miniatura sin transformaciones remotas', () => {
  assert.match(compresion, /ladoMaximo: 900/)
  assert.match(compresion, /ladoMaximo: 320/)
  assert.match(compresion, /image\/webp/)
  assert.doesNotMatch(compresion, /render\/image|transform/)
})

test('la migración conserva originales y la consulta de huérfanas es sólo lectura', () => {
  assert.match(migracion, /add column if not exists imagen_thumbnail_url/)
  assert.doesNotMatch(migracion, /delete|drop column/i)
  assert.match(huerfanas, /^-- SOLO LECTURA/)
  assert.doesNotMatch(huerfanas, /\b(delete|update|insert|truncate)\b/i)
  assert.match(huerfanas, /storage\.objects/)
})
