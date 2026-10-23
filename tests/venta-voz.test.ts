import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { etiquetarVentasVoz, reconocerImporteVoz } from '../utils/ventaVoz.ts'

const componente = readFileSync(new URL('../components/VentaVozGlobal.tsx', import.meta.url), 'utf8')
const pagina = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../fastlook_venta_rapida_voz.sql', import.meta.url), 'utf8')

test('reconoce importes enteros y centavos en español de México', () => {
  const casos: Array<[string, number]> = [
    ['ciento cincuenta pesos', 150], ['doscientos', 200], ['noventa y nueve pesos con cincuenta centavos', 99.5],
    ['Ciento Cincuenta Pesos', 150], ['mil quinientos', 1500], ['dos mil trescientos cuarenta y cinco pesos', 2345],
    ['veintiún pesos', 21], ['un peso', 1], ['cien', 100], ['ciento cincuenta en efectivo', 150],
    ['150', 150], ['$150', 150], ['150 pesos', 150], ['$99.50', 99.5], ['1,250.75', 1250.75], ['150 pesos con 50 centavos', 150.5],
  ]
  for (const [frase, importe] of casos) assert.deepEqual(reconocerImporteVoz(frase), { ok: true, importe }, frase)
})
test('todo importe aceptado tiene como máximo 2 decimales al serializarse (regex del servidor)', () => {
  assert.deepEqual(reconocerImporteVoz('un peso con catorce centavos'), { ok: true, importe: 1.14 })
  for (const pesos of [1, 2, 9, 37, 150, 1999]) for (let c = 1; c < 100; c++) {
    const r = reconocerImporteVoz(`${pesos} pesos con ${c} centavos`)
    assert.ok(r.ok && /^[0-9]{1,12}([.][0-9]{1,2})?$/.test(JSON.stringify(r.importe)), `${pesos}.${c}`)
  }
})
test('rechaza frases ambiguas, varios importes, silencio y formatos no admitidos', () => {
  for (const frase of ['dos de cincuenta', 'cien o doscientos', 'pagó con quinientos y fueron ciento cincuenta', '', '   ', 'hola', 'cincuenta cincuenta', 'ciento cincuenta y doscientos', 'cien cincuenta', 'mil mil', 'cero pesos', 'cincuenta centavos', '99,50', '1,25', 'ciento cincuenta pesos con cincuenta', 'cien pesos con ciento veinte centavos'])
    assert.equal(reconocerImporteVoz(frase).ok, false, frase)
})
test('rechaza métodos distintos de efectivo', () => {
  for (const frase of ['ciento cincuenta con tarjeta', 'doscientos transferencia', 'cien por spei', 'trescientos con tarjeta de débito'])
    assert.deepEqual(reconocerImporteVoz(frase), { ok: false, motivo: 'metodo' }, frase)
})
test('un toque de Shift abre el overlay sin panel permanente, repetición ni campos de edición', () => {
  assert.match(componente, /evento\.key === 'Shift'/)
  assert.match(componente, /evento\.repeat \|\| evento\.ctrlKey \|\| evento\.altKey \|\| evento\.metaKey \|\| shiftPresionadoRef\.current \|\| esEdicion\(evento\.target\) \|\| hayModalAbierto\(\)/)
  assert.match(componente, /shiftPresionadoRef\.current = true; iniciar\(\)/)
  assert.match(componente, /estado !== 'oculto'[\s\S]*fl-voice-overlay/)
  assert.doesNotMatch(componente, /fl-voice-sale|Activar micrófono|Desactivar/)
  assert.match(componente, /contenteditable/)
})
test('Shift sostenido no repite y el reconocimiento termina solo después de un importe', () => {
  assert.match(componente, /evento\.repeat/)
  assert.match(componente, /continuous = false/)
  assert.match(componente, /interimResults = false/)
  assert.match(componente, /filter\(\(r\) => r\.isFinal\)/)
  assert.match(componente, /const vigente = \(\) => reconocedorRef\.current === reconocedor && !terminada/)
  assert.match(componente, /if \(!texto\.trim\(\)\)/)
})
test('combinaciones, Escape, formularios y otros modales no generan una venta', () => {
  assert.match(componente, /if \(shiftPresionadoRef\.current && capturaActivaRef\.current\) cancelar\(\)/)
  assert.match(componente, /evento\.key === 'Escape'.*cancelar\(true\)/)
  assert.match(componente, /HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement/)
  assert.match(componente, /\[aria-modal="true"\],dialog\[open\]/)
})
test('no se permite otra captura mientras se guarda o el guardado es incierto', () => {
  assert.match(componente, /ocupadaRef\.current \|\| capturaActivaRef\.current \|\| reconocedorRef\.current \|\| estadoRef\.current === 'incierto'/)
  assert.match(componente, /AbortSignal\.timeout\(TIMEOUT_RPC_MS\)/)
  assert.match(componente, /consultar\(capturaId\)/)
})
test('pérdida de foco, pestaña oculta y desmontaje cancelan el micrófono', () => {
  assert.match(componente, /window\.addEventListener\('blur', perderFoco\)/)
  assert.match(componente, /document\.hidden/)
  assert.match(componente, /reconocedor\?\.abort\(\)/)
})
test('móvil/táctil primario no consulta disponibilidad ni instala listeners', () => {
  const efecto = componente.slice(componente.indexOf('useEffect(() => {\n    if (esDispositivoMovil())'), componente.indexOf('useEffect(() => { if (estado'))
  assert.match(componente, /Android\|webOS\|iPhone\|iPad\|iPod/)
  assert.match(componente, /\(hover: none\) and \(pointer: coarse\)/)
  assert.match(efecto, /if \(esDispositivoMovil\(\)\) return/)
  assert.match(componente, /if \(!esEscritorio \|\| !Constructor \|\| !disponible\) return/)
})
test('éxito sólo aparece tras respuesta confirmada y se cierra automáticamente', () => {
  const guardado = componente.slice(componente.indexOf('const guardar'), componente.indexOf('const iniciar'))
  assert.match(guardado, /!error && respuesta\?\.ok && respuesta\.folio[\s\S]*confirmarExito/)
  assert.match(guardado, /verificada\?\.ok && verificada\.folio[\s\S]*confirmarExito/)
  assert.match(componente, /Venta registrada:/)
  assert.match(componente, /setTimeout\(\(\) =>[\s\S]*ocultarOverlay\(\)/)
})
test('guardado no usa carrito, impresión, PDF ni POS Bridge', () => {
  assert.match(componente, /registrar_venta_voz/)
  assert.doesNotMatch(componente, /carrito|imprimir|pdf|servicioPOSLocal|abrirCajon|ticketPOS|procesar_venta/i)
  assert.match(pagina, /<VentaVozGlobal/)
})
test('idempotencia, consulta incierta y deshacer viven en servidor', () => {
  assert.match(sql, /captura_id uuid primary key/)
  assert.match(sql, /procesar_venta_mixta\(\s*p_captura_id/)
  assert.match(sql, /consultar_venta_voz/)
  assert.match(sql, /deshacer_venta_voz/)
  assert.match(sql, /for update/)
  assert.match(sql, /set estado='Cancelado'/)
  assert.doesNotMatch(sql, /delete from public\./i)
})
test('la partida por voz no inventa costo y no toca inventario', () => {
  assert.match(sql, /'configuracion',jsonb_build_object\('nivel','Normal','precio_final',round\(p_importe,2\)\)/)
  assert.doesNotMatch(sql, /set[^;]*configuracion\s*=/i)
  assert.match(sql, /'\[\]'::jsonb/)
  assert.doesNotMatch(sql, /update public\.productos|movimientos_inventario/)
  assert.match(pagina, /fetchVentas\(true\), fetchMovimientos\(\)/)
})
test('migración de estado: default Cobrado, sin tocar filas y validada antes de la de voz', () => {
  const estado = readFileSync(new URL('../fastlook_ventas_tickets_estado.sql', import.meta.url), 'utf8')
  assert.match(estado, /^begin;/m); assert.match(estado, /^commit;/m)
  assert.match(estado, /add column if not exists estado text not null default 'Cobrado'/)
  assert.match(estado, /check \(estado in \('Cobrado', 'Cancelado'\)\) not valid/)
  assert.doesNotMatch(estado.replace(/--.*$/gm, ''), /\b(update|delete|truncate|drop)\b/i)
  assert.match(sql, /Aplica antes fastlook_ventas_tickets_estado\.sql/)
  assert.match(sql, /function public\.deshacer_venta_voz[\s\S]*?security definer/)
})
test('Movimientos marca tickets cancelados y la venta por voz se oculta sin migración', () => {
  const movimientos = readFileSync(new URL('../components/Movimientos.tsx', import.meta.url), 'utf8')
  assert.match(movimientos, /cancelada = esVenta && m\.estado === 'Cancelado'/)
  assert.match(movimientos, /'TICKET CANCELADO'/)
  assert.match(movimientos, /permitirReimpresion && !cancelada/)
  assert.match(pagina, /from\('ventas_tickets'\)\.select\('\*'\)\.order/)
  assert.match(componente, /error\?\.code !== 'PGRST202'/)
  assert.match(componente, /if \(!esEscritorio \|\| !disponible\) return null/)
})
test('registrar_venta_voz corregida no modifica ventas_personalizadas (trigger de inmutabilidad)', () => {
  const fix = readFileSync(new URL('../fastlook_venta_voz_fix_inmutables.sql', import.meta.url), 'utf8'), codigo = fix.replace(/--.*$/gm, '')
  assert.match(codigo, /^begin;/m); assert.match(codigo, /^commit;/m)
  assert.match(codigo, /create or replace function public\.registrar_venta_voz\(p_captura_id uuid, p_importe numeric\)[\s\S]*?security definer/)
  assert.doesNotMatch(codigo, /(update|delete from|insert into)\s+public\.ventas_personalizadas/i)
  assert.doesNotMatch(codigo, /(delete|truncate|drop|alter table)/i)
  assert.match(codigo, /'concepto',v_concepto/)
  assert.match(codigo, /jsonb_build_object\('nivel','Normal','precio_final',round\(p_importe,2\)\)/)
  const deshacer = sql.slice(sql.indexOf('function public.deshacer_venta_voz'), sql.indexOf('revoke all on function'))
  assert.doesNotMatch(deshacer, /ventas_personalizadas/)
  assert.match(deshacer, /update public\.ventas_tickets set estado='Cancelado'/)
})
test('lectura de ventas por voz: sólo SELECT de ticket_id para personal activo', () => {
  const lectura = readFileSync(new URL('../fastlook_venta_voz_lectura.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '')
  assert.match(lectura, /for select to authenticated using \(public\.es_personal_fastlook_activo\(\)\)/)
  assert.match(lectura, /grant select \(ticket_id\) on public\.ventas_voz_operaciones to authenticated/)
  assert.doesNotMatch(lectura, /grant (all|insert|update|delete)|(delete|truncate|drop)/i)
})
test('etiqueta como venta por voz sólo los tickets registrados en ventas_voz_operaciones', () => {
  const lineas = [{ ticket_id: 'v', nombre: 'Servicio de moto - Normal', total: 150 }, { ticket_id: 'm', nombre: 'Servicio de moto - Normal', total: 50 }]
  const r = etiquetarVentasVoz(lineas, new Set(['v']))
  assert.equal(r[0].nombre, 'Venta rápida por voz'); assert.equal(r[0].total, 150)
  assert.equal(r[1].nombre, 'Servicio de moto - Normal')
  assert.equal(etiquetarVentasVoz(lineas, new Set()), lineas)
  const ruta = readFileSync(new URL('../app/api/corte-caja/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /personalizadas: etiquetarVentasVoz\(personalizadas, ticketsVoz\)/)
  assert.match(pagina, /etiquetarVentasVoz\(personalizadas\.data \|\| \[\], new Set\(\(ventasVoz\.data/)
  assert.match(pagina, /etiquetarVentasVoz\(personalizadas\.data \|\| \[\], new Set\(ventaVoz\.data/)
})
