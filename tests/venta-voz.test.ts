import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo y requiere la extensión explícita.
import { reconocerImporteVoz } from '../utils/ventaVoz.ts'

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
test('control global usa Shift sostenido sin capturar escritura ni combinaciones', () => {
  assert.match(componente, /evento\.key === 'Shift' && !evento\.repeat && !evento\.ctrlKey && !evento\.altKey && !evento\.metaKey && !esEdicion\(evento\.target\)/)
  assert.match(componente, /setTimeout\(iniciar, ESPERA_SHIFT_MS\)/)
  assert.match(componente, /evento\.key !== 'Shift' && \(shiftRef\.current \|\| temporizadorRef\.current !== null\)\) cancelar\(\)/)
  assert.match(componente, /contenteditable/)
})
test('soltar Shift espera el resultado final y cada captura se procesa una vez', () => {
  const keyup = componente.slice(componente.indexOf('const keyup'), componente.indexOf('const visibilidad'))
  assert.match(keyup, /reconocedor\.stop\(\)/)
  assert.match(componente, /continuous = true/)
  assert.match(componente, /interimResults = false/)
  assert.match(componente, /filter\(\(r\) => r\.isFinal\)/)
  assert.match(componente, /const vigente = \(\) => reconocedorRef\.current === reconocedor && !terminada/)
  assert.match(componente, /if \(!soltoRef\.current \|\| !texto\.trim\(\)\)/)
})
test('no se permite otra captura mientras se guarda, habla el aviso o el guardado es incierto', () => {
  assert.match(componente, /!ocupadaRef\.current && !hablandoRef\.current && !reconocedorRef\.current && estadoRef\.current !== 'incierto'/)
  assert.match(componente, /AbortSignal\.timeout\(TIMEOUT_RPC_MS\)/)
  assert.match(componente, /consultar\(capturaId\)/)
})
test('pérdida de foco, pestaña oculta y desmontaje cancelan micrófono sin borrar el aviso de éxito', () => {
  assert.match(componente, /window\.addEventListener\('blur', cancelar\)/)
  assert.match(componente, /document\.hidden/)
  assert.match(componente, /reconocedor\?\.abort\(\)/)
  assert.match(componente, /if \(habiaCaptura && !ocupadaRef\.current\)/)
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
  assert.match(componente, /p_idempotency_key: ultima\.deshacerKey/)
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
  assert.match(componente, /if \(!disponible\) return null/)
})
