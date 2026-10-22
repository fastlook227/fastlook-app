import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere extensión explícita.
import { resumirNominaEmpleado } from '../utils/checkin.ts'
import type { JornadaCheckIn, TrabajoMecanico } from '../types/checkin'

const sql = readFileSync(new URL('../fastlook_reorganizacion_checkin_nomina.sql', import.meta.url), 'utf8')
const vista = readFileSync(new URL('../components/checkin/CheckInNomina.tsx', import.meta.url), 'utf8')
const navegacion = readFileSync(new URL('../lib/navegacion/configuracion.ts', import.meta.url), 'utf8')
const fotos = readFileSync(new URL('../app/api/trabajos-mecanicos/fotos/route.ts', import.meta.url), 'utf8')

const jornada = (horas: number): JornadaCheckIn => ({ id: crypto.randomUUID(), fecha: '2026-10-21', entrada: '2026-10-21T15:00:00.000Z', salida: new Date(Date.parse('2026-10-21T15:00:00.000Z') + horas * 3_600_000).toISOString(), tarifa_normal: 35, tarifa_extra: 45, limite_horas_normales: 8 })
const trabajo = (estado: TrabajoMecanico['estado'], comision: number): TrabajoMecanico => ({ id: crypto.randomUUID(), empleado_id: 'u1', empleado_nombre: 'Empleado', descripcion: 'Mano de obra', fecha: '2026-10-21', importe_mano_obra: 1000, porcentaje_aplicado: 60, comision, estado, created_at: new Date().toISOString(), foto_ruta: null, foto_expira_at: null, foto_eliminada_at: null })

test('nómina combina horas y únicamente comisiones pendientes', () => {
  const resumen = resumirNominaEmpleado([jornada(10)], [trabajo('Pendiente', 600), trabajo('Pagada', 500), trabajo('Cancelada', 400)])
  assert.equal(resumen.pagoNormalCentavos, 28000)
  assert.equal(resumen.pagoExtraCentavos, 9000)
  assert.equal(resumen.comisionesPendientes, 600)
  assert.equal(resumen.comisionesPagadas, 500)
  assert.equal(resumen.comisionesCanceladas, 400)
  assert.equal(resumen.totalEstimado, 970)
})

test('jornada abierta con reloj adelantado no rompe nómina', () => {
  const abierta = { ...jornada(0), entrada: '2026-10-21T15:00:05.000Z', salida: null }
  assert.doesNotThrow(() => resumirNominaEmpleado([abierta], [], new Date('2026-10-21T15:00:00.000Z')))
})

test('KIKEADMIN se autoriza por UUID configurado y Admin activo', () => {
  assert.match(sql, /configuracion_kikeadmin[\s\S]*usuario_id uuid not null unique/)
  assert.match(sql, /c\.usuario_id = auth\.uid\(\)[\s\S]*u\.rol = 'Admin'/)
  assert.match(sql, /SOLO_KIKEADMIN/)
  assert.doesNotMatch(sql, /correo\s*=|nombre\s*=\s*'KIKEADMIN'/i)
})

test('empleado sólo recibe su propia nómina y sólo opera su asistencia', () => {
  assert.match(sql, /and \(v_es_admin or u\.id = v_actor\)/)
  assert.match(sql, /p_usuario_id <> v_actor and not public\.es_kikeadmin_nomina\(\)/)
  assert.match(sql, /ASISTENCIA_AJENA/)
})

test('RPC no abre tablas ni permisos anónimos', () => {
  assert.match(sql, /enable row level security/)
  assert.doesNotMatch(sql, /disable row level security|grant .* on (table )?public\.(asistencias|trabajos_mecanicos)/i)
  assert.doesNotMatch(sql, /grant execute .* to anon/i)
})

test('tarjetas están plegadas inicialmente y no transforman datos', () => {
  assert.match(vista, /useState<Set<string>>\(new Set\(\)\)/)
  assert.match(vista, /totales\.map\(\(\{ empleado, resumen \}\)/)
  assert.match(vista, /empleado\.jornadas \|\| \[\]/)
})

test('trabajos quedan asociados y preseleccionados por empleado', () => {
  assert.match(sql, /t\.empleado_id = u\.id/)
  assert.match(vista, /empleadoFijo=\{empleado\}/)
})

test('fotos privadas y administración mecánica son exclusivas de KIKEADMIN', () => {
  assert.match(fotos, /exigirKikeadminNomina/)
  assert.match(sql, /es_admin_fotos_trabajos[\s\S]*es_kikeadmin_nomina/)
})

test('Check In queda visible para Admin y Vendedor', () => {
  assert.match(navegacion, /tab: 'check-in'[\s\S]*roles: \['Admin', 'Vendedor'\]/)
})

test('índices y bloqueos existentes siguen evitando asistencia duplicada', () => {
  const fase1 = readFileSync(new URL('../fastlook_fase1_checkin.sql', import.meta.url), 'utf8')
  assert.match(fase1, /asistencias_una_abierta_por_usuario_uidx/)
  assert.match(sql, /pg_advisory_xact_lock/)
})

test('el filtro de nómina abre en el día de hoy (hora de México) e incluye el día completo', () => {
  assert.match(vista, /const hoy = \(\) => new Intl\.DateTimeFormat\('en-CA', \{ timeZone: 'America\/Mexico_City' \}\)/)
  assert.match(vista, /useState\(hoy\); const \[hasta, setHasta\] = useState\(hoy\)/)
  assert.doesNotMatch(vista, /toISOString\(\)\.slice\(0, 10\)/)
  // p_hasta es date y se compara con BETWEEN sobre columnas date: incluye todo el día
  assert.match(sql, /obtener_nomina_checkin\(p_desde date, p_hasta date\)/)
  assert.match(sql, /a\.fecha between p_desde and p_hasta/)
  assert.match(sql, /t\.fecha between p_desde and p_hasta/)
})
