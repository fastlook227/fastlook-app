import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pagina = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const checkin = readFileSync(new URL('../components/checkin/CheckIn.tsx', import.meta.url), 'utf8')

test('venta libera confirmación antes de reconciliar catálogos en segundo plano', () => {
  const confirmacion = pagina.indexOf('Venta registrada. Folio')
  const segundoPlano = pagina.indexOf('void Promise.allSettled([fetchProductos(true), fetchVentas(true), fetchMovimientos()])')
  assert.ok(confirmacion >= 0 && segundoPlano > confirmacion)
  assert.match(pagina, /cantidadesVendidas/)
})

test('Check-in aplica la respuesta confirmada al empleado antes del refresco silencioso', () => {
  assert.match(checkin, /const \{ data, error: errorRpc \} = await supabase\.rpc/)
  assert.match(checkin, /setEmpleados\(\(actuales\) => actuales\.map/)
  assert.match(checkin, /void cargar\(true\)/)
})

test('producto guardado actualiza sólo el registro devuelto y conserva protección de doble envío', () => {
  assert.match(pagina, /\.select\('\*'\)\s*\.single\(\)/)
  assert.match(pagina, /setProductos\(\(actuales\) =>/)
  assert.match(pagina, /if \(guardandoProductoRef\.current\) return/)
  assert.doesNotMatch(pagina, /limpiarFormulario\(\)\s*fetchProductos\(\)/)
})
