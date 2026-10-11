import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { accionDisponible, calcularComisionManoObra, calcularJornada, crearContenidoQrCheckIn, resolverQrCheckIn, resumirPanelCheckIn, totalPagoEstimado } from '../utils/checkin.ts'
import type { EmpleadoCheckIn } from '../types/checkin'

const inicio = '2026-09-10T15:00:00.000Z'
const calcularHoras = (horas: number) => calcularJornada(inicio, new Date(new Date(inicio).getTime() + horas * 3_600_000))

test('8h exactas: 8 normales, 0 extra y $280', () => { const r = calcularHoras(8); assert.equal(r.minutosNormales, 480); assert.equal(r.minutosExtra, 0); assert.equal(r.pagoTotalCentavos, 28000) })
test('10h generan $370', () => assert.equal(calcularHoras(10).pagoTotalCentavos, 37000))
test('8h30 generan $302.50 sin redondear a horas completas', () => { const r = calcularHoras(8.5); assert.equal(r.minutosExtra, 30); assert.equal(r.pagoTotalCentavos, 30250) })
test('4h generan $140', () => assert.equal(calcularHoras(4).pagoTotalCentavos, 14000))
test('rechaza salida anterior a entrada', () => assert.throws(() => calcularJornada(new Date(10), new Date(9))))
test('QR válido identifica UUID y QR inválido se rechaza', () => { const id = '550e8400-e29b-41d4-a716-446655440000'; assert.equal(resolverQrCheckIn(crearContenidoQrCheckIn(id)), id); assert.equal(resolverQrCheckIn('FASTLOOK-CHECKIN:Kike'), null) })
test('la acción disponible evita entrada y salida duplicadas en cliente', () => { assert.equal(accionDisponible(null), 'entrada'); assert.equal(accionDisponible({ id: '1', fecha: '2026-09-10', entrada: inicio, salida: null, tarifa_normal: 35, tarifa_extra: 45, limite_horas_normales: 8 }), 'salida'); assert.equal(accionDisponible({ id: '1', fecha: '2026-09-10', entrada: inicio, salida: inicio, tarifa_normal: 35, tarifa_extra: 45, limite_horas_normales: 8 }), null) })
test('resumen suma jornadas e historial correctamente', () => { const empleados: EmpleadoCheckIn[] = [{ id: '1', nombre: 'A', rol: 'Vendedor', activo: true, jornada: { id: 'j1', fecha: '2026-09-10', entrada: inicio, salida: new Date(new Date(inicio).getTime() + 10 * 3_600_000).toISOString(), tarifa_normal: 35, tarifa_extra: 45, limite_horas_normales: 8 } }]; const r = resumirPanelCheckIn(empleados); assert.deepEqual(r, { registrados: 1, trabajando: 0, cerradas: 1, minutosNormales: 480, minutosExtra: 120, pagoCentavos: 37000 }) })
test('una jornada anterior abierta no infla el resumen del día', () => { const empleados: EmpleadoCheckIn[] = [{ id: '1', nombre: 'Brandon', rol: 'Vendedor', activo: true, jornada: { id: 'vieja', fecha: '2026-09-09', entrada: inicio, salida: null, tarifa_normal: 35, tarifa_extra: 45, limite_horas_normales: 8, es_anterior: true } }]; assert.deepEqual(resumirPanelCheckIn(empleados), { registrados: 0, trabajando: 0, cerradas: 0, minutosNormales: 0, minutosExtra: 0, pagoCentavos: 0 }) })
test('comisión inicial aplica 60% sólo al importe de mano de obra', () => { assert.equal(calcularComisionManoObra(1000), 600); assert.equal(calcularComisionManoObra(125.50), 75.30) })
test('cambiar porcentaje sólo cambia cálculos futuros', () => { assert.equal(calcularComisionManoObra(1000, 60), 600); assert.equal(calcularComisionManoObra(1000, 55), 550) })
test('rechaza importes negativos y porcentajes fuera de rango', () => { assert.throws(() => calcularComisionManoObra(-1)); assert.throws(() => calcularComisionManoObra(10, 101)) })
test('total estimado distingue salario por horas y comisiones pendientes', () => { assert.equal(totalPagoEstimado(280, 600), 880) })

const sql = readFileSync(new URL('../fastlook_fase1_checkin.sql', import.meta.url), 'utf8')
test('SQL rechaza usuario inactivo y limita operación a Admin', () => { assert.match(sql, /u\.activo = true and u\.rol = 'Admin'/) })
test('SQL rechaza salida sin entrada', () => { assert.match(sql, /No existe una entrada para cerrar hoy/) })
test('SQL rechaza entrada duplicada', () => { assert.match(sql, /ya tiene una jornada registrada hoy/) })
test('SQL rechaza salida duplicada', () => { assert.match(sql, /La salida ya fue registrada/) })
test('Vendedor no recibe privilegios de escritura directa', () => { assert.match(sql, /revoke all on table public\.asistencias from anon, authenticated/) })
test('Admin opera mediante autoridad SECURITY DEFINER', () => { assert.match(sql, /registrar_entrada_empleado[\s\S]*security definer/) })
test('timezone comercial se resuelve en America\/Mexico_City', () => { assert.match(sql, /America\/Mexico_City/) })
test('SQL serializa concurrencia para impedir doble toque', () => { assert.match(sql, /pg_advisory_xact_lock/) })

const fase2 = readFileSync(new URL('../fastlook_fase2_asistencias_comisiones.sql', import.meta.url), 'utf8')
test('panel consulta jornadas abiertas aunque sean de un día anterior', () => { assert.match(fase2, /asistencia\.fecha = v_fecha or asistencia\.salida is null/); assert.match(fase2, /es_anterior/) })
test('entrada consulta y bloquea una jornada abierta antes del insert', () => { assert.match(fase2, /where a\.usuario_id = p_usuario_id and a\.salida is null[\s\S]*JORNADA_ABIERTA_EXISTENTE[\s\S]*insert into public\.asistencias/) })
test('cierre antiguo exige confirmación y deja auditoría', () => { assert.match(fase2, /cerrar_jornada_abierta_admin/); assert.match(fase2, /insert into public\.asistencias_correcciones/); assert.match(fase2, /p_salida > clock_timestamp\(\)/) })
test('trabajos guardan snapshot de porcentaje y sólo importe de mano de obra', () => { assert.match(fase2, /porcentaje_aplicado/); assert.match(fase2, /importe_mano_obra/); assert.doesNotMatch(fase2, /refaccion_id|producto_id|accesorio_id/) })
test('idempotencia evita trabajos duplicados', () => { assert.match(fase2, /idempotency_key uuid not null unique/); assert.match(fase2, /exception when unique_violation/) })
test('comisión pagada no puede volver a pendiente ni pagarse dos veces', () => { assert.match(fase2, /v_anterior\.estado = 'Pagada' and p_estado = 'Pendiente'/); assert.match(fase2, /coalesce\(pagada_at, clock_timestamp\(\)\)/) })
