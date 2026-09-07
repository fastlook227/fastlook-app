import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { actualizarPresencia, estadoPTTInicial, identificarHablante, iniciarPTT, normalizarVolumen, perderConexionPTT, puedeIniciarPTT, recepcionSilenciada, detenerPTT } from '../utils/interphone.ts'

const enrique = { id: '1', nombre: 'Enrique', rol: 'Admin' as const, hablando: false, onlineAt: '2026-01-01' }
const vanessa = { id: '2', nombre: 'Vanessa', rol: 'Vendedor' as const, hablando: false, onlineAt: '2026-01-01' }

test('estado inicial PTT apagado', () => assert.deepEqual(estadoPTTInicial(), { conectado: false, transmitiendo: false, usuarioHablandoId: null }))
test('inicio PTT habilita transmisión', () => assert.equal(iniciarPTT({ ...estadoPTTInicial(), conectado: true }, '1').transmitiendo, true))
test('stop PTT deshabilita transmisión', () => assert.equal(detenerPTT({ conectado: true, transmitiendo: true, usuarioHablandoId: '1' }).transmitiendo, false))
test('canal ocupado bloquea PTT', () => assert.equal(puedeIniciarPTT({ conectado: true, transmitiendo: false, usuarioHablandoId: '2' }, '1'), false))
test('pérdida de conexión fuerza stop', () => assert.deepEqual(perderConexionPTT({ conectado: true, transmitiendo: true, usuarioHablandoId: '1' }), estadoPTTInicial()))
test('limpieza fuerza micrófono apagado', () => assert.equal(detenerPTT(iniciarPTT({ ...estadoPTTInicial(), conectado: true }, '1')).transmitiendo, false))
test('presencia agrega usuario', () => assert.deepEqual(actualizarPresencia([], [enrique]), [enrique]))
test('presencia elimina usuario', () => assert.deepEqual(actualizarPresencia([enrique, vanessa], [], ['1']), [vanessa]))
test('usuario hablando se identifica', () => assert.equal(identificarHablante([enrique, vanessa], '2'), 'Vanessa'))
test('volumen normaliza 0–100 a 0–1', () => { assert.equal(normalizarVolumen(50), .5); assert.equal(normalizarVolumen(200), 1); assert.equal(normalizarVolumen(-2), 0) })
test('mute recepción', () => { assert.equal(recepcionSilenciada(true, 100), true); assert.equal(recepcionSilenciada(false, 100), false) })
test('estado reconexión detiene PTT', () => assert.equal(perderConexionPTT({ conectado: true, transmitiendo: true, usuarioHablandoId: '1' }).conectado, false))
