import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Las pruebas nativas usan la extensión TypeScript explícita.
import { bytesCajon, bytesTicket58, textoTicket58 } from '../src/escpos.ts'
// @ts-expect-error Las pruebas nativas usan la extensión TypeScript explícita.
import { validarTicket } from '../src/validation.ts'
// @ts-expect-error Las pruebas nativas usan la extensión TypeScript explícita.
import { validarConfig } from '../src/config.ts'

const config = validarConfig({ port: 17891, token: '123456789012345678901234', allowedOrigins: ['https://fastlook.example'], printer: { name: 'POS-58', widthMm: 58, charactersPerLine: 32, encoding: 'windows-1252', profile: 'escpos-generic' }, drawer: { enabled: true, pin: 0, pulseOnMs: 100, pulseOffMs: 200 } })
const ticket = validarTicket({ ticketId: 't1', folio: 'FLV-1', fecha: '2026-09-10', cajero: 'Ana', metodoPago: 'Efectivo', total: 300, efectivoRecibido: 500, cambio: 200, lineas: [{ nombre: 'Cadena personalizada muy larga para el ticket', cantidad: 2, precio: 150, subtotal: 300, personalizada: true }] })

test('ticket 58 mm contiene folio total recibido cambio y personalizado', () => { const texto = textoTicket58(ticket, 32); for (const valor of ['FLV-1', 'TOTAL', '$300.00', 'RECIBIDO', '$500.00', 'CAMBIO', '$200.00', 'Cadena personalizada']) assert.match(texto, new RegExp(valor.replace('$', '\\$'))); assert.ok(texto.split('\n').every((linea) => linea.length <= 32)) })
test('ticket genera comandos ESC/POS de inicio y corte', () => { const bytes = bytesTicket58(ticket, config); assert.deepEqual([...bytes.subarray(0, 2)], [0x1b, 0x40]); assert.deepEqual([...bytes.subarray(-3)], [0x1d, 0x56, 0]) })
test('cajón usa pin y pulsos configurados', () => assert.deepEqual([...bytesCajon(config)], [0x1b, 0x70, 0, 50, 100]))
test('cajón deshabilitado no manda pulso', () => assert.throws(() => bytesCajon({ ...config, drawer: { ...config.drawer, enabled: false } }), /DRAWER_NO_CONFIGURADO/))
test('payload inválido se rechaza', () => assert.throws(() => validarTicket({ folio: 'x' }), /TICKET_/))
test('config exige token largo y origen explícito', () => assert.throws(() => validarConfig({}), /CONFIG_TOKEN_INVALIDO/))
