import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const configuracion = readFileSync(new URL('../lib/navegacion/configuracion.ts', import.meta.url), 'utf8')
const pagina = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const navegacion = readFileSync(new URL('../components/Navegacion.tsx', import.meta.url), 'utf8')
const movil = readFileSync(new URL('../components/MobileBottomNav.tsx', import.meta.url), 'utf8')

const posicion = (texto: string) => configuracion.indexOf(`label: '${texto}'`)
test('orden comercial comienza Venta, Personalizados, Cascos, Devoluciones', () => { const orden = ['Generar venta', 'Productos personalizados', 'Cascos', 'Devoluciones'].map(posicion); assert.ok(orden.every((valor) => valor >= 0)); assert.deepEqual([...orden].sort((a, b) => a - b), orden) })
test('módulos archivados no forman parte de la navegación visible', () => { for (const modulo of ['Asistente', 'Lista de precios', 'Dashboard', 'Lista de compras', 'Proveedores', 'Stock bajo']) assert.equal(posicion(modulo), -1) })
test('módulos archivados conservan implementación', () => { for (const tab of ["tab === 'ia'", "tab === 'precios'", "tab === 'dashboard'", "tab === 'compras'", "tab === 'proveedores'", "tab === 'stock'"]) assert.ok(pagina.includes(tab)) })
test('desktop y móvil derivan su orden del mismo arreglo', () => { assert.match(navegacion, /items=\{items\}/); assert.match(navegacion, /primaryItems = items\.slice/); assert.match(navegacion, /quickItems = items/); assert.doesNotMatch(navegacion, /itemsGenerales|itemsAdmin/) })
test('móvil conserva icono real del primer módulo', () => { assert.doesNotMatch(movil, /index === 0/); assert.match(movil, /<Icon size=\{22\}/) })
test('lupa navega a Venta y solicita foco sin setTimeout', () => { assert.match(pagina, /onBuscarProductos=\{\(\) => \{ setModoVenta\('normal'\); setTab\('venta'\); setSolicitudFocoVenta/); assert.match(pagina, /buscadorVentaRef\.current\?\.focus\(\)/); assert.doesNotMatch(navegacion, /onCambiarTab\('precios'\)/) })
test('configuración POS sólo se ofrece a Admin desktop', () => { assert.match(configuracion, /tab: 'pos-config'.*roles: \['Admin'\].*soloDesktopPOS: true/); assert.match(pagina, /usuarioRol === 'Admin' && esDesktopPOS && <ConfiguracionPOS/) })
test('Faltantes está disponible para Admin y Vendedor', () => { assert.match(configuracion, /tab: 'faltantes'.*roles: \['Admin', 'Vendedor'\]/); assert.match(pagina, /tab === 'faltantes' && <Faltantes/) })
