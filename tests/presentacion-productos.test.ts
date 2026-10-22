import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pagina = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const rapida = readFileSync(new URL('../components/VentaRapida.tsx', import.meta.url), 'utf8')
const tarjeta = readFileSync(new URL('../components/TarjetaProducto.tsx', import.meta.url), 'utf8')
const precios = readFileSync(new URL('../components/ListaPrecios.tsx', import.meta.url), 'utf8')
const estilos = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const carrito = readFileSync(new URL('../components/CarritoFlotanteGlobal.tsx', import.meta.url), 'utf8')

test('Ventas abre en modo rápido y mantiene un solo estado de carrito', () => {
  assert.match(pagina, /useState<'normal' \| 'rapida'>\('rapida'\)/)
  assert.equal((pagina.match(/const \[modoVenta/g) || []).length, 1)
  assert.match(pagina, /carrito=\{carrito\}/)
})

test('ventas, inventario y lista de precios reutilizan tarjetas de producto', () => {
  assert.ok((pagina.match(/<TarjetaProducto/g) || []).length >= 2)
  assert.match(rapida, /<TarjetaProducto/)
  assert.match(precios, /<TarjetaProducto/)
})

test('tarjeta usa miniatura, imagen completa como respaldo y placeholder', () => {
  assert.match(tarjeta, /miniatura=\{producto\.imagen_thumbnail_url\}/)
  assert.match(tarjeta, /src=\{producto\.imagen_url\}/)
  assert.match(tarjeta, /Sin imagen/)
})

test('resultados completos conservan carga progresiva', () => {
  assert.match(rapida, /useListaProgresiva\(resultados\)/)
  assert.match(rapida, /<CargarMasProductos/)
})

test('detalle ampliado espera, se ancla al viewport y no expone costo', () => {
  assert.match(tarjeta, /setTimeout\(abrir, 900\)/)
  assert.match(tarjeta, /createPortal/)
  assert.match(tarjeta, /window\.innerWidth - ancho/)
  assert.match(tarjeta, /evento\.key === 'Escape'/)
  assert.doesNotMatch(tarjeta, /producto\.costo/)
})

test('tarjetas contienen imágenes completas y recortan textos sólo visualmente', () => {
  assert.match(estilos, /fl-product-card-media > img[^}]*object-fit: contain/)
  assert.match(estilos, /-webkit-line-clamp: 2/)
  assert.match(estilos, /overflow-wrap: anywhere/)
  assert.doesNotMatch(estilos, /\.fl-quick-products button \{/)
})

test('carrito flotante se minimiza, persiste en sesión y tiene controles accesibles', () => {
  assert.match(carrito, /sessionStorage\.setItem\(CLAVE_MINIMIZADO/)
  assert.match(carrito, /is-minimized/)
  assert.match(carrito, /aria-label="Mover carrito"/)
  assert.match(carrito, /aria-label="Restablecer posición del carrito"/)
})
