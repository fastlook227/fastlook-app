import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { obtenerLoteProgresivo, siguienteLimiteProgresivo, TAMANO_LOTE_PRODUCTOS } from '../utils/paginacion.ts'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { elegirFuentesImagen } from '../utils/fuenteImagen.ts'

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
  assert.deepEqual(elegirFuentesImagen('/p.webp', '/m.webp', false), { preferida: '/m.webp', alterna: '/p.webp' })
  assert.match(imagen, /loading="lazy"/)
  assert.match(imagen, /decoding="async"/)
  assert.match(imagen, /fetchPriority="low"/)
})

test('genera principal y miniatura sin transformaciones remotas', () => {
  assert.match(compresion, /ladoMaximo: 900/)
  assert.match(compresion, /ladoMaximo: 320/)
  assert.match(compresion, /image\/webp/)
  assert.match(compresion, /anchoOriginal \* escala/)
  assert.match(compresion, /altoOriginal \* escala/)
  assert.match(compresion, /drawImage\(imagen, .*anchoFinal, altoFinal\)/)
  assert.doesNotMatch(compresion, /render\/image|transform/)
})

test('las miniaturas nuevas contienen la foto completa sobre lienzo blanco', () => {
  assert.match(compresion, /lienzoCuadradoBlanco: true/)
  assert.match(compresion, /fillStyle = '#ffffff'/)
  assert.match(compresion, /\(canvas\.width - anchoFinal\) \/ 2/)
  assert.doesNotMatch(imagen, /proporcionMiniatura|naturalWidth/)
})

test('la migración conserva originales y la consulta de huérfanas es sólo lectura', () => {
  assert.match(migracion, /add column if not exists imagen_thumbnail_url/)
  assert.doesNotMatch(migracion, /delete|drop column/i)
  assert.match(huerfanas, /^-- SOLO LECTURA/)
  assert.doesNotMatch(huerfanas, /\b(delete|update|insert|truncate)\b/i)
  assert.match(huerfanas, /storage\.objects/)
})

const preferencia = readFileSync(new URL('../fastlook_preferencia_imagen_principal.sql', import.meta.url), 'utf8')
const pagina = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const formularioCasco = readFileSync(new URL('../components/cascos/FormularioCasco.tsx', import.meta.url), 'utf8')
const catalogoCascos = readFileSync(new URL('../components/cascos/CatalogoCascos.tsx', import.meta.url), 'utf8')
const rutaCascos = readFileSync(new URL('../app/api/cascos/route.ts', import.meta.url), 'utf8')
const estilos = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const tarjetaProducto = readFileSync(new URL('../components/TarjetaProducto.tsx', import.meta.url), 'utf8')
const usosImagen = ['../components/cascos/TarjetaCasco.tsx', '../components/cascos/SelectorPDFCascos.tsx', '../components/codigos-barras/SelectorPDFProductos.tsx']
  .map((ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8'))

test('la preferencia explícita descarga sólo la principal y nunca ambas', () => {
  assert.deepEqual(elegirFuentesImagen('/p.webp', '/m.webp', true), { preferida: '/p.webp', alterna: '/m.webp' })
  assert.deepEqual(elegirFuentesImagen('/p.webp', null, false), { preferida: '/p.webp', alterna: '' })
  assert.deepEqual(elegirFuentesImagen('/p.webp', '/p.webp', true), { preferida: '/p.webp', alterna: '' })
  assert.match(imagen, /src=\{fuente\}/)
  assert.doesNotMatch(imagen, /new Image\(|<link[^>]*preload|naturalWidth/)
  assert.match(imagen, /if \(fuente === fuentePreferida && fuenteAlterna\)/)
})

test('la principal elegida se muestra completa, centrada y sobre blanco en todas las tarjetas', () => {
  assert.match(imagen, /fuente === src \? 'fl-image-full'/)
  assert.match(estilos, /img\.fl-image-full \{ object-fit: contain; object-position: center; background: #fff; \}/)
  for (const codigo of usosImagen) assert.match(codigo, /usarPrincipal=\{(producto|casco)\.usar_imagen_principal\}/)
  assert.match(pagina, /usarPrincipal=\{item\.producto\.usar_imagen_principal\}/)
})

test('la opción es manual, sólo para Admin y con vista previa de ambas fuentes', () => {
  assert.match(pagina, /usuarioRol === 'Admin' && columnaFuenteImagen && form\.id && form\.imagen_url && form\.imagen_thumbnail_url && <fieldset className="fl-image-source-picker">/)
  assert.match(pagina, /Vista previa de la miniatura/)
  assert.match(pagina, /Vista previa de la imagen principal/)
  assert.match(formularioCasco, /preferenciaDisponible && !imagen && imagenUrl && imagenThumbnailUrl && <fieldset/)
  assert.match(catalogoCascos, /rol === 'Admin' && formularioCasco && <FormularioCasco/)
  assert.match(rutaCascos, /await exigirAdministrador\(request\)/)
})

test('sin migración aplicada no se envía la columna ni el parámetro nuevo', () => {
  assert.match(pagina, /productos\.some\(\(producto\) => 'usar_imagen_principal' in producto\)/)
  assert.match(pagina, /\.\.\.\(columnaFuenteImagen \? \{ usar_imagen_principal: Boolean\(form\.usar_imagen_principal\) \} : \{\}\)/)
  assert.match(rutaCascos, /usar_imagen_principal: z\.boolean\(\)\.optional\(\)/)
  assert.equal((rutaCascos.match(/datos\.usar_imagen_principal === undefined \? \{\} : \{ p_usar_imagen_principal/g) || []).length, 2)
})

test('la migración es mínima, no borra fotos ni cambia productos existentes', () => {
  assert.match(preferencia, /add column if not exists usar_imagen_principal boolean not null default false/)
  assert.doesNotMatch(preferencia, /\bdelete\b|drop |storage\.objects|update public\.productos set usar_imagen_principal = true/i)
  assert.equal((preferencia.match(/ROL_NO_PERMITIDO/g) || []).length, 2)
  assert.match(preferencia, /from public, anon;/)
})

test('tarjeta de producto usa la principal por defecto con el formato de la tarjeta de casco', () => {
  assert.match(tarjetaProducto, /<ImagenProducto src=\{producto\.imagen_url\} miniatura=\{producto\.imagen_thumbnail_url\} usarPrincipal alt=\{producto\.nombre\} \/>/)
  assert.doesNotMatch(tarjetaProducto, /usar_imagen_principal/)
  assert.match(estilos, /\.fl-product-card-media \{ width: 100%; aspect-ratio: 1 \/ \.86;[^}]*padding: 8px; background: #fff;/)
  assert.match(estilos, /\.fl-helmet-image-button \{[^}]*aspect-ratio: 1 \/ \.86;[^}]*padding: 8px; background: #fff;/)
  assert.doesNotMatch(estilos, /\.fl-product-card-media \{ height:/)
  assert.match(estilos, /\.fl-product-grid \{ grid-template-columns: 1fr; \}\n  \.fl-product-card-media \{ aspect-ratio: 1\.15 \/ 1; \}/)
})
