import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node ejecuta TypeScript nativo con extensión explícita.
import { cambiarMotivoPrecioLinea, cambiarPrecioLinea, construirPayloadVenta, crearLineaCatalogo, crearLineaInventario, lineasSinMotivoPrecio, obtenerPrecioLinea } from '../utils/carritoMixto.ts'
// @ts-expect-error Node ejecuta TypeScript nativo con extensión explícita.
import { construirMovimientosCompletos } from '../utils/movimientos.ts'
// @ts-expect-error Node ejecuta TypeScript nativo con extensión explícita.
import { agruparVentasPorTicket, detallesExternosDevolucion, lineasExternasDevolucion } from '../utils/devoluciones.ts'
// @ts-expect-error Node ejecuta TypeScript nativo con extensión explícita.
import { agregarProductoAVenta, cambiarCantidadEnVenta, crearEstadoVentasInicial } from '../utils/ventasPendientes.ts'
// @ts-expect-error Node ejecuta TypeScript nativo con extensión explícita.
import { consolidarCorte } from '../utils/corteConsolidado.ts'
import type { Producto } from '../types/index.ts'

const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8')
const sql = leer('fastlook_venta_flexible_proveedores.sql'), rollback = leer('fastlook_venta_flexible_proveedores_rollback.sql'), inventario = leer('fastlook_inventario_stock_negativo.sql')
const pagina = leer('app/page.tsx'), integracion = leer('tests/sql/integracion-venta-flexible.mjs')
const producto: Producto = { id: '11111111-1111-4111-8111-111111111111', codigo: 'A', nombre: 'Aceite', tipo: '', precio: 100, costo: 70, stock: 0, stock_minimo: 0, ubicacion: '', proveedor: '', imagen_url: '' }
const externo = () => crearLineaCatalogo({ idLocal: 'catalogo:c1', catalogoProductoId: 'c1', codigo: 'EXT', nombre: 'Externo', proveedor: 'CEDIS', precioLista: 130, precioUnitarioCobrado: 130 })

test('carrito sin cambios de precio envía exactamente el formato antiguo', () => {
  assert.deepEqual(construirPayloadVenta([crearLineaInventario(producto, 2)]).lineasNormales, [{ producto_id: producto.id, cantidad: 2 }])
  assert.deepEqual(construirPayloadVenta([externo()]).lineasNormales, [{ catalogo_producto_id: 'c1', cantidad: 1 }])
})

test('precio modificado viaja con su motivo y sin motivo bloquea el cobro', () => {
  const cambiada = cambiarPrecioLinea([crearLineaInventario(producto)], producto.id, 95)
  assert.equal(obtenerPrecioLinea(cambiada[0]), 95)
  assert.equal(lineasSinMotivoPrecio(cambiada).length, 1)
  const conMotivo = cambiarMotivoPrecioLinea(cambiada, producto.id, 'CANDIDATO_PRECIO_OFICIAL')
  assert.equal(lineasSinMotivoPrecio(conMotivo).length, 0)
  assert.deepEqual(construirPayloadVenta(conMotivo).lineasNormales, [{ producto_id: producto.id, cantidad: 1, precio_unitario: 95, motivo_precio: 'CANDIDATO_PRECIO_OFICIAL' }])
  assert.match(pagina, /if \(lineasSinMotivoPrecio\(carritoProcesado\)\.length\)/)
})

test('RPC acepta formato antiguo y nuevo con firmas públicas intactas', () => {
  assert.match(sql, /coalesce\(round\(\(x->>'precio_unitario'\)::numeric, 2\), p\.precio\)/)
  assert.match(sql, /coalesce\(round\(\(x->>'precio_unitario'\)::numeric, 2\), cp\.precio_venta_override, o\.precio_sugerido\)/)
  assert.match(sql, /create or replace function public\.procesar_venta\(p_idempotency_key uuid, p_metodo_pago text, p_lineas jsonb\)/)
  assert.match(sql, /create or replace function public\.procesar_venta_mixta\(p_idempotency_key uuid, p_metodo_pago text, p_lineas_normales jsonb, p_lineas_personalizadas jsonb\)/)
  assert.doesNotMatch(sql, /LINEAS_DUPLICADAS|STOCK_INSUFICIENTE/)
  assert.match(sql, /sum\(e\.cantidad\) as cantidad/)
  assert.match(sql, /MOTIVO_PRECIO_REQUERIDO/)
  assert.match(sql, /CATALOGO_VINCULADO/)
})

test('RPC conserva autenticación, idempotencia, bloqueo ordenado y validación previa', () => {
  assert.match(sql, /auth\.uid\(\)/)
  assert.match(sql, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(p_idempotency_key::text, 0\)\)/)
  assert.match(sql, /order by p\.id for update/)
  assert.match(sql, /exception when unique_violation then/)
  assert.match(sql, /set stock = stock - v_cantidad/)
  assert.match(sql, /DEPENDENCIA: faltan columnas/)
  assert.match(sql, /RESPALDO_INVALIDO/)
})

test('devolución externa: historial propio, acumulado parcial y sin inventario', () => {
  assert.match(sql, /create table if not exists public\.devoluciones_externas_detalle/)
  assert.match(sql, /from public\.devoluciones_externas_detalle ded where ded\.venta_externa_id = v_venta\.id/)
  const bloqueExterno = sql.slice(sql.indexOf('insert into public.devoluciones_externas_detalle'), sql.indexOf("select d.total_devuelto into v_total_devuelto"))
  assert.doesNotMatch(bloqueExterno, /public\.productos|movimientos_inventario/)
  assert.match(sql, /create or replace function public\.procesar_devolucion_mixta\(\s*p_idempotency_key uuid,\s*p_motivo text,\s*p_lineas jsonb,\s*p_lineas_personalizadas jsonb,\s*p_motivo_otro text default null\s*\)/)
})

test('aprendizaje sólo usa CANDIDATO_PRECIO_OFICIAL válido y nunca cambia el precio solo', () => {
  const evidencia = sql.slice(sql.indexOf('function public._evidencia_precio_candidato'), sql.indexOf('function public.obtener_sugerencias_precio_admin'))
  for (const regla of [/motivo_precio = 'CANDIDATO_PRECIO_OFICIAL'/, /not v\.descuento_conjunto/, /v\.precio_lista = p\.precio/, /'cancelado','cancelada'/, /not exists \(select 1 from public\.devoluciones_detalle/]) assert.match(evidencia, regla)
  assert.match(sql, /having count\(distinct e\.ticket_id\) >= 4/)
  assert.equal((sql.match(/update public\.productos set precio/g) || []).length, 1)
  assert.match(sql, /EVIDENCIA_INSUFICIENTE/)
  assert.match(sql, /rol = 'Admin'/)
})

test('RLS activa, núcleo interno sin permisos y lectura externa sólo personal activo', () => {
  assert.doesNotMatch(sql + rollback + inventario, /disable row level security|service_role/i)
  assert.match(sql, /revoke all on function public\._procesar_venta_flexible\(uuid,text,jsonb,jsonb\) from public, anon, authenticated/)
  assert.match(sql, /u\.activo = true and u\.rol in \('Admin','Vendedor'\)/)
})

test('rollback restaura originales, bloquea formato nuevo y conserva historia', () => {
  assert.match(rollback, /RESPALDO_INCOMPLETO/)
  assert.match(rollback, /_procesar_venta_original_v0/)
  assert.match(rollback, /VERSION_INCOMPATIBLE/)
  assert.equal((rollback.match(/security invoker/g) || []).length, 2)
  assert.doesNotMatch(rollback, /drop table|delete from|truncate|revoke select|drop policy/i)
  assert.match(pagina, /const VENTA_FLEXIBLE = process\.env\.NEXT_PUBLIC_VENTA_FLEXIBLE === '1'/)
})

test('stock negativo: edición no toca existencias y la entrada usa RPC transaccional', () => {
  assert.match(inventario, /STOCK_SOLO_POR_AJUSTE/)
  assert.doesNotMatch(inventario.slice(inventario.indexOf('update public.productos set'), inventario.indexOf('where id = p_producto_id returning *')), /stock =/)
  assert.match(inventario, /set stock = stock \+ p_cantidad/)
  assert.match(pagina, /rpc\('recibir_mercancia_producto'/)
  assert.doesNotMatch(pagina, /\.update\(\{ stock/)
  assert.doesNotMatch(pagina, /from\('movimientos_inventario'\)\.insert/)
})

test('Movimientos muestra tickets mixtos con líneas externas y devoluciones sin duplicar', () => {
  const r = construirMovimientosCompletos([], [{ ticket_id: 't', folio: 'F', created_at: '2026-11-01T10:00:00Z', total: 500 }], [{ id: 'n', ticket_id: 't', nombre: 'Normal', cantidad: 1 }], [{ id: 'p', ticket_id: 't', nombre: 'Pers', cantidad: 1 }], [{ id: 'e', ticket_id: 't', nombre: 'Espejo', codigo: 'EXT', cantidad: 2 }], [{ id: 'd1', ticket_id: 't', total_devuelto: 130 }, { id: 'd2', ticket_id: 't', total_devuelto: 20 }])
  assert.equal(r.length, 1)
  assert.equal(r[0].total, 500)
  assert.deepEqual(r[0].lineas_ticket?.map((l) => [l.nombre, l.personalizada, Boolean(l.externa)]), [['Normal', false, false], ['Pers', true, false], ['Espejo', false, true]])
  assert.deepEqual(r[0].devoluciones_ticket, { total: 150, operaciones: 2 })
})

test('Devoluciones ofrece líneas externas con cantidades disponibles acumuladas', () => {
  const lineas = lineasExternasDevolucion([{ id: 'x', ticket_id: 't', folio: 'F', created_at: '2026-11-01T10:00:00Z', codigo: 'EXT', nombre: 'Espejo', proveedor_nombre: 'CEDIS', precio: 130, cantidad: 3, total: 390, metodo_pago: 'Efectivo' }])
  const detalles = detallesExternosDevolucion([{ id: 'd', devolucion_id: 'dv', venta_externa_id: 'x', catalogo_producto_id: 'c', codigo: 'EXT', nombre: 'Espejo', cantidad: 2, precio_unitario_original: 130, subtotal_devuelto: 260, created_at: '2026-11-01T11:00:00Z' }])
  const [ticket] = agruparVentasPorTicket(lineas, detalles).tickets
  assert.equal(ticket.lineas[0].id, 'e:x')
  assert.equal(ticket.lineas[0].disponibles, 1)
  assert.equal(ticket.estado, 'parcial')
})

test('PDF y reimpresión incluyen líneas externas y el PDF refleja devoluciones', () => {
  assert.match(pagina, /from\('ventas_catalogo_proveedores'\)\.select\('\*'\)\.eq\('ticket_id', ticketId\)/)
  assert.match(pagina, /personalizada: !linea\.producto_id && !linea\.catalogo_producto_id/)
  assert.match(pagina, /generarPdfTicketHistorico\(lineas, devuelto\)/)
  assert.match(leer('utils/pdfTicket.ts'), /DEVUELTO:/)
})

test('la suite SQL integrada cubre los riesgos de la auditoría', () => {
  for (const caso of ['aplicación antigua + RPC nuevo', 'aplicación nueva', 'exclusivamente externo', 'ticket mixto', 'devolución externa parcial', 'aprendizaje', 'stock negativo', 'permisos', 'rollback', 'POS']) assert.ok(integracion.includes(caso), caso)
})

test('interruptor apagado conserva el tope de stock del RPC original; encendido permite negativo', () => {
  const inicial = crearEstadoVentasInicial(), id = inicial.activaId, sinStock = { ...producto, stock: 0 }, conDos = { ...producto, stock: 2 }
  assert.equal(agregarProductoAVenta(inicial, id, sinStock, 1, true).ok, false)
  assert.equal(agregarProductoAVenta(inicial, id, sinStock, 1, false).ok, true)
  const uno = agregarProductoAVenta(inicial, id, conDos, 1, true).estado
  assert.equal(cambiarCantidadEnVenta(uno, id, producto.id, 5, 2, 1, true).cantidad, 2)
  assert.equal(cambiarCantidadEnVenta(uno, id, producto.id, 5, 2, 1, false).cantidad, 5)
  assert.match(pagina, /agregarProductoAVenta\(estadoVentasRef\.current, ventaId, producto, Date\.now\(\), !VENTA_FLEXIBLE\)/)
  assert.equal((pagina.match(/stockTotal, Date\.now\(\), !VENTA_FLEXIBLE\)/g) || []).length, 3)
})

test('Corte: externos suman a ventas y utilidad; su devolución reduce neto y utilidad sin tocar inventario', () => {
  const fecha = '2026-11-01T18:00:00.000Z'
  const r = consolidarCorte({
    tickets: [{ ticket_id: 't', folio: 'F', total: 230, metodo_pago: 'Efectivo', created_at: fecha }],
    ventas: [{ id: 'n', ticket_id: 't', nombre: 'Normal', codigo: 'N', precio: 100, cantidad: 1, total: 100, costo_unitario: 70, created_at: fecha }],
    personalizadas: [], externas: [{ id: 'e', ticket_id: 't', nombre: 'Espejo', codigo: 'EXT', precio: 130, cantidad: 1, total: 130, costo_unitario: 100, created_at: fecha }],
    devoluciones: [{ id: 'd', ticket_id: 't', folio: 'F', total_devuelto: 130, utilidad_revertida: 30, metodo_pago: 'Efectivo', motivo: 'Defecto', usuario_nombre: 'A', created_at: fecha }] as never[],
    inicio: '2026-11-01', fin: '2026-11-01',
  })
  assert.deepEqual([r.resumen.ventasInventario, r.resumen.ventasExternas, r.resumen.ajustesTicket, r.resumen.ventasBrutas, r.resumen.ventasNetas, r.resumen.gananciaBruta, r.resumen.gananciaNeta], [100, 130, 0, 230, 100, 60, 30])
  assert.equal(r.tickets[0].lineasExternas.length, 1)
})

test('reimpresión térmica envía lo devuelto y el catálogo cobra el mismo precio que muestra', () => {
  assert.match(pagina, /imprimirTicket\(devuelto > 0 \? \{ \.\.\.ticket, devuelto: Math\.round\(devuelto \* 100\) \/ 100 \} : ticket\)/)
  assert.match(pagina, /const precio = producto\.precio_venta \?\? producto\.precio_venta_sugerido/)
  assert.equal((sql.match(/public\._oferta_vigente_catalogo\(/g) || []).length >= 5, true)
  assert.match(sql, /'precio_venta',coalesce\(p\.precio_venta_override,o\.precio_sugerido\)/)
  assert.match(pagina, /fl-cart-line\$\{esLineaCatalogo\(item\) \? ' is-supplier' : ''\}/)
})

test('compuerta de contrato y restricciones antes de reemplazar RPC productivos', () => {
  for (const marca of ["'''FLV-'''", "'''Salida por venta'''", "'''SISTEMA'''", 'CONTRATO_RPC_DISTINTO', 'RESTRICCION_INCOMPATIBLE', 'TRIGGER_POR_REVISAR']) assert.ok(sql.includes(marca), marca)
  assert.ok(sql.indexOf('CONTRATO_RPC_DISTINTO') < sql.indexOf('create or replace function public._procesar_venta_flexible'))
  const diagnostico = leer('consultas/diagnostico_rpc_ventas_flexibles.sql')
  assert.doesNotMatch(diagnostico, /\b(insert|update|delete|alter|create|drop|grant|revoke|truncate)\b\s/i)
})

test('descarte de sugerencias y aprendizaje externo sólo por Admin', () => {
  for (const f of ['descartar_sugerencia_precio', 'aprobar_sugerencia_precio_externo', 'sugerencias_precio_descartadas', 'historial_precios_catalogo']) assert.ok(sql.includes(f), f)
  assert.match(sql, /e\.precio between e\.lista \* \(1 - cfg\.v\) and e\.lista \* \(1 \+ cfg\.v\)/)
  // La variación sólo filtra sugerencias: el RPC de venta no la consulta.
  const venta = sql.slice(sql.indexOf('function public._procesar_venta_flexible'), sql.indexOf('create or replace function public.procesar_venta('))
  assert.doesNotMatch(venta, /fastlook_parametros_precios|variacion/)
  assert.match(rollback, /revoke all on function public\.descartar_sugerencia_precio/)
  assert.match(leer('components/SugerenciasPrecio.tsx'), /rpc\('descartar_sugerencia_precio'/)
})

test('staging: script bloquea producción y Supabase sin variables sigue apuntando a producción', () => {
  const guardia = leer('scripts/staging/entorno.mjs')
  for (const motivo of ['la URL es la de producción', 'la llave pública es la de producción', 'la service_role es la de producción', 'falta STAGING_CONFIRMAR=staging']) assert.ok(guardia.includes(motivo), motivo)
  for (const script of ['prueba-venta-flexible-staging.mjs', 'prueba-seguridad-staging.mjs', 'preparar-staging.mjs']) assert.match(leer(`scripts/staging/${script}`), /entornoStaging\(/, script)
  assert.match(leer('lib/supabase.ts'), /process\.env\.NEXT_PUBLIC_SUPABASE_URL \|\| 'https:\/\/bvgrhvmrkorycrqvynjk\.supabase\.co'/)
})
