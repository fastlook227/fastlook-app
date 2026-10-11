import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node ejecuta las pruebas TypeScript nativas y necesita la extensión explícita.
import { contenidoTrabajoValido, fotoTrabajoVigente, rutasVencidasDelModulo } from './fotosTrabajosMecanicos.ts'
// @ts-expect-error Node ejecuta las pruebas TypeScript nativas y necesita la extensión explícita.
import { calcularComisionManoObra, totalPagoEstimado } from './checkin.ts'

test('calcula 60%, respeta el porcentaje histórico y suma la comisión una sola vez', () => {
  assert.equal(calcularComisionManoObra(1_000), 600)
  assert.equal(calcularComisionManoObra(1_000, 55), 550)
  assert.equal(totalPagoEstimado(700, 600), 1_300)
  assert.throws(() => calcularComisionManoObra(-1))
})

test('acepta descripción, foto o ambas, pero no un registro vacío', () => {
  assert.equal(contenidoTrabajoValido(' Ajuste de freno ', false), true)
  assert.equal(contenidoTrabajoValido('   ', true), true)
  assert.equal(contenidoTrabajoValido('Ajuste', true), true)
  assert.equal(contenidoTrabajoValido('   ', false), false)
})

test('oculta la foto exactamente al expirar aunque el archivo siga almacenado', () => {
  const expiracion = '2026-10-12T06:00:00.000Z'
  assert.equal(fotoTrabajoVigente(expiracion, null, new Date('2026-10-12T05:59:59.999Z')), true)
  assert.equal(fotoTrabajoVigente(expiracion, null, new Date(expiracion)), false)
  assert.equal(fotoTrabajoVigente(expiracion, '2026-10-12T06:01:00.000Z', new Date('2026-10-12T05:00:00.000Z')), false)
})

test('la limpieza solo selecciona rutas válidas del módulo y es idempotente', () => {
  const ruta = '2026-10-10/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp'
  assert.deepEqual(rutasVencidasDelModulo([ruta, ruta, 'productos/imagen.webp', '../secreto'], '2026-10-11'), [ruta])
  assert.deepEqual(rutasVencidasDelModulo([], '2026-10-11'), [])
})
