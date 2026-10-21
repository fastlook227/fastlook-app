import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { construirMensajeEntrega, filtrarEntregas, normalizarTelefonoMexicano, requiereConfirmacion, urlWhatsApp } from '../utils/entregas.ts'
import type { EntregaProxima } from '../types/entregas'

const sql = readFileSync(new URL('../fastlook_modulo_entregas_proximas.sql', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/entregas/route.ts', import.meta.url), 'utf8')
const vista = readFileSync(new URL('../components/entregas/EntregasProximas.tsx', import.meta.url), 'utf8')
const nav = readFileSync(new URL('../lib/navegacion/configuracion.ts', import.meta.url), 'utf8')
const entrega = (parcial: Partial<EntregaProxima> = {}): EntregaProxima => ({ id:'11111111-1111-4111-8111-111111111111',productos:'Casco rojo',cliente_nombre:'Ana',facebook_url:'https://facebook.com/a',telefono:'6141234567',fecha_entrega:'2026-10-21',hora_entrega:'18:00:00',fecha_hora_iso:'2026-10-22T00:00:00.000Z',ubicacion:'Plaza',maps_url:null,precio_acordado:null,anticipo:null,observaciones:null,acordada_por:'u1',acordada_por_nombre:'Luis',repartidor_id:'u2',repartidor_nombre:'Mario',asignacion_confirmada_at:null,estado:'Pendiente de confirmación',recordatorio_generado_at:null,confirmacion_estado:'No preparado',confirmacion_solicitada_at:null,created_at:'',updated_at:'',motivo_cancelacion:null,fecha_original:'2026-10-21',hora_original:'18:00:00',eventos:[],...parcial })

test('creación es idempotente, compartida y no toca inventario ni ventas', () => { assert.match(sql,/idempotency_key uuid not null unique/); assert.match(sql,/exception when unique_violation/); assert.doesNotMatch(sql,/(insert into|update|delete from) public\.(productos|ventas)/i); assert.match(api,/crear_entrega_proxima/) })
test('RLS y JWT bloquean anónimos', () => { assert.match(sql,/enable row level security/g); assert.match(sql,/revoke all .* from anon,authenticated/); assert.doesNotMatch(sql,/grant .* to anon/i); assert.match(api,/obtenerPerfilAutenticado/) })
test('asignación se confirma y sólo KIKEADMIN reasigna', () => { assert.match(sql,/Sólo KIKEADMIN puede reasignar/); assert.match(sql,/repartidor_id=v_actor or public\.es_kikeadmin_entregas/); assert.match(sql,/Asignación confirmada/) })
test('cancelación y reprogramación conservan historial', () => { assert.match(sql,/motivo de cancelación es obligatorio/i); assert.match(sql,/fecha_anterior/); assert.match(sql,/hora_anterior/); assert.match(sql,/recordatorio_generado_at=null/); assert.doesNotMatch(sql,/delete from public\.entregas/i) })
test('recordatorio aparece a 30 minutos y se deduplica', () => { const e=entrega({fecha_hora_iso:new Date(Date.now()+29*60_000).toISOString()}); assert.equal(requiereConfirmacion(e),true); assert.equal(requiereConfirmacion({...e,estado:'Confirmada'}),false); assert.match(sql,/coalesce\(recordatorio_generado_at,v_ahora\)/); assert.match(sql,/interval '30 minutes'/) })
test('reprogramada vuelve a calcular confirmación', () => { const e=entrega({estado:'Reprogramada',fecha_hora_iso:new Date(Date.now()+20*60_000).toISOString()}); assert.equal(requiereConfirmacion(e),true); assert.match(sql,/estado in \('Pendiente de confirmación','Reprogramada'\)/) })
test('normaliza teléfonos mexicanos sin duplicar 52', () => { assert.equal(normalizarTelefonoMexicano('614 123 4567'),'526141234567'); assert.equal(normalizarTelefonoMexicano('+52 614 123 4567'),'526141234567'); assert.equal(normalizarTelefonoMexicano('123'),null); assert.match(urlWhatsApp('6141234567','Hola')||'',/^https:\/\/wa\.me\/526141234567/) })
test('mensajes se personalizan y nunca se envían automáticamente', () => { const mensaje=construirMensajeEntrega('camino',entrega()); assert.match(mensaje,/Ana/); assert.match(mensaje,/Casco rojo/); assert.match(mensaje,/Mario/); assert.match(vista,/window\.open/); assert.match(vista,/navigator\.clipboard/); assert.doesNotMatch(api,/whatsapp|messenger/i) })
test('búsqueda y panel cubren listas compartidas e historial', () => { assert.equal(filtrarEntregas([entrega()], 'plaza').length,1); assert.match(sql,/estado not in \('Entregada','Cancelada'\)/); assert.match(sql,/estado in \('Entregada','Cancelada'\)/); assert.match(nav,/Entregas próximas/) })
