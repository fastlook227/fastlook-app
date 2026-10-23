import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const configuracion = readFileSync(new URL('../lib/navegacion/configuracion.ts', import.meta.url), 'utf8')
const pagina = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const navegacion = readFileSync(new URL('../components/Navegacion.tsx', import.meta.url), 'utf8')
const menu = readFileSync(new URL('../components/MenuModulos.tsx', import.meta.url), 'utf8')

const posicion = (texto: string) => configuracion.indexOf(`label: '${texto}'`)
test('orden comercial comienza Venta, Personalizados, Cascos, Devoluciones', () => { const orden = ['Generar venta', 'Productos personalizados', 'Cascos', 'Devoluciones'].map(posicion); assert.ok(orden.every((valor) => valor >= 0)); assert.deepEqual([...orden].sort((a, b) => a - b), orden) })
test('módulos archivados no forman parte de la navegación visible', () => { for (const modulo of ['Asistente', 'Lista de precios', 'Dashboard', 'Lista de compras', 'Proveedores', 'Stock bajo']) assert.equal(posicion(modulo), -1) })
test('módulos archivados conservan implementación', () => { for (const tab of ["tab === 'ia'", "tab === 'precios'", "tab === 'dashboard'", "tab === 'compras'", "tab === 'proveedores'", "tab === 'stock'"]) assert.ok(pagina.includes(tab)) })
test('desktop y móvil usan un único menú derivado del arreglo autorizado', () => { assert.match(navegacion, /items=\{items\}/); assert.match(navegacion, /<MenuModulos/); assert.doesNotMatch(navegacion, /<Sidebar|<MobileBottomNav|itemsGenerales|itemsAdmin/) })
test('menú recupera la isla compacta con iconos, estado activo y cierre accesible', () => { assert.match(menu, /fl-module-menu-island/); assert.doesNotMatch(menu, />Menú de secciones</); assert.match(menu, /const Icon = item\.icon/); assert.match(menu, /aria-current=\{activo \? 'page'/); assert.match(menu, /evento\.key === 'Escape'/); assert.match(menu, /aria-modal="true"/) })
test('la isla recibe todas las secciones visibles del arreglo autorizado', () => { assert.match(navegacion, /items=\{items\}/); assert.match(menu, /items\.map/); for (const modulo of ['Generar venta', 'Productos personalizados', 'Cascos', 'Devoluciones', 'Interphone', 'Faltantes', 'Entregas próximas', 'Clientes', 'Inventario', 'Corte de caja', 'Movimientos', 'Check In', 'Usuarios', 'Configuración POS', 'Cajas del tianguis']) assert.ok(configuracion.includes(`label: '${modulo}'`), modulo) })
test('lupa navega a Venta y solicita foco sin setTimeout', () => { assert.match(pagina, /onBuscarProductos=\{\(\) => \{ setModoVenta\('normal'\); setTab\('venta'\); setSolicitudFocoVenta/); assert.match(pagina, /buscadorVentaRef\.current\?\.focus\(\)/); assert.doesNotMatch(navegacion, /onCambiarTab\('precios'\)/) })
test('configuración POS sólo se ofrece a Admin desktop', () => { assert.match(configuracion, /tab: 'pos-config'.*roles: \['Admin'\].*soloDesktopPOS: true/); assert.match(pagina, /usuarioRol === 'Admin' && esDesktopPOS && <ConfiguracionPOS/) })
test('Faltantes está disponible para Admin y Vendedor', () => { assert.match(configuracion, /tab: 'faltantes'.*roles: \['Admin', 'Vendedor'\]/); assert.match(pagina, /tab === 'faltantes' && <Faltantes/) })
