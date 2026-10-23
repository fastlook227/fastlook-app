import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pagina = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const filtros = readFileSync(new URL('../components/FiltrosProductos.tsx', import.meta.url), 'utf8')
const movimientos = readFileSync(new URL('../components/Movimientos.tsx', import.meta.url), 'utf8')
const navegacion = readFileSync(new URL('../hooks/useNavegacionPOS.ts', import.meta.url), 'utf8')
const calculadoras = readFileSync(new URL('../components/CalculadorasPersonalizadas.tsx', import.meta.url), 'utf8')
const estilos = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

test('flechas navegan controles POS sin capturar campos de edición', () => { assert.match(navegacion, /ArrowUp/); assert.match(navegacion, /ArrowDown/); assert.match(navegacion, /esCampoEdicion\(evento\.target\)/) })
test('Enter desde el panel del carrito abre o avanza el cobro', () => { assert.match(pagina, /evento\.key === 'Enter'.*solicitarFinalizarVenta\(\)/) })
test('producto personalizado aparece como acceso principal de venta', () => { assert.match(pagina, /fl-custom-product-shortcut/); assert.match(pagina, />Producto personalizado<\/button>/) })
test('buscador comparte fila compacta con acciones y conserva filtros debajo', () => { assert.match(filtros, /fl-product-search-row/); assert.match(filtros, /fl-sale-search-actions/); assert.ok(filtros.indexOf('fl-product-search-row') < filtros.indexOf('fl-filter-quick')) })
test('movimientos usan tarjetas ticket con datos y acciones principales', () => { for (const texto of ['fl-movement-card', 'folio', 'created_at', 'efectivo_recibido', 'cambio', 'Ticket PDF', 'Reimprimir ticket']) assert.match(movimientos, new RegExp(texto)) })
test('cabecera POS compacta mantiene tres filas funcionales en escritorio', () => { const venta=pagina.slice(pagina.indexOf("{tab === 'venta'"),pagina.indexOf("{tab === 'inventario'")); assert.match(estilos, /\.fl-pending-sales \{ margin: 4px 0 6px/); assert.match(estilos, /\.fl-sale-pos \.fl-product-filters \{ margin: 4px 0 8px/); assert.match(filtros, /accionesFiltros/); assert.doesNotMatch(venta, /className="fl-scanner-actions"/) })
test('Enter en Precio final agrega una vez y no inicia cobro', () => { const servicio=calculadoras.slice(calculadoras.indexOf('function Servicio')); assert.match(servicio,/onSubmit=/); assert.match(servicio,/enterBloqueado\.current/); assert.match(servicio,/e\.repeat/); assert.match(servicio,/crearServicioPersonalizado/); assert.doesNotMatch(servicio,/solicitarFinalizarVenta|finalizarVenta|Cobrar/) })
