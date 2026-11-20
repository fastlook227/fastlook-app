// Pruebas SQL integradas en Postgres real (PGlite, WASM) sobre un esquema de PRUEBA.
// Ejecutar:  npm i --no-save @electric-sql/pglite   y luego   node --test tests/sql/integracion-venta-flexible.mjs
// (o PGLITE_PATH=<ruta a node_modules/@electric-sql/pglite/dist/index.js>). Sin PGlite las pruebas se omiten.
// Límites: una sola conexión (sin concurrencia real) y RPC originales aproximados (ver esquema_base_prueba.sql).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
// Payloads reales del frontend (Node elimina los tipos al importar .ts).
import { cambiarMotivoPrecioLinea, cambiarPrecioLinea, construirPayloadVenta, crearLineaCatalogo, crearLineaInventario } from '../../utils/carritoMixto.ts'

const archivo = (ruta) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8')
const aplicar = async (ruta) => { try { await db.exec(archivo(ruta)) } catch (e) { e.message = `${ruta}: ${e.message}`; await db.exec('rollback').catch(() => {}); throw e } }
let PGlite = null
try { ({ PGlite } = await import(process.env.PGLITE_PATH ? pathToFileURL(process.env.PGLITE_PATH).href : '@electric-sql/pglite')) } catch { /* se omite */ }
const omitir = PGlite ? false : 'PGlite no instalado'

const ADMIN = '00000000-0000-4000-8000-00000000000a', VENDEDOR = '00000000-0000-4000-8000-00000000000b', INACTIVO = '00000000-0000-4000-8000-00000000000c'
const A = '10000000-0000-4000-8000-000000000001', B = '10000000-0000-4000-8000-000000000002', ARCH = '10000000-0000-4000-8000-000000000003'
const NEG1 = '10000000-0000-4000-8000-000000000004', NEG2 = '10000000-0000-4000-8000-000000000005', NEG3 = '10000000-0000-4000-8000-000000000006', VINC = '10000000-0000-4000-8000-000000000007', NEG4 = '10000000-0000-4000-8000-000000000008'
const EXT = '20000000-0000-4000-8000-000000000001', AMBIG = '20000000-0000-4000-8000-000000000002', EXT_VINC = '20000000-0000-4000-8000-000000000003', EXT_APR = '20000000-0000-4000-8000-000000000004', IMP = '30000000-0000-4000-8000-000000000001'
const k = (n) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let db
const DEPENDENCIAS = ['fastlook_ventas_tickets_estado.sql', 'fastlook_venta_rapida_voz.sql', 'fastlook_venta_voz_fix_inmutables.sql', 'fastlook_fase_pos_usb.sql', 'fastlook_fix_rls_productos_admin.sql', 'fastlook_fix_productos_historicos.sql', 'fastlook_devoluciones_personalizadas.sql', 'fastlook_catalogo_proveedores.sql']
const baseNueva = async (ajustarEsquema = (sql) => sql) => {
  const base = new PGlite()
  await base.exec(ajustarEsquema(archivo('tests/sql/esquema_base_prueba.sql')))
  for (const m of DEPENDENCIAS) await base.exec(archivo(m))
  return base
}

const q = async (sql, params = []) => (await db.query(sql, params)).rows
const uno = async (sql, params = []) => (await q(sql, params))[0]
const como = (usuario) => q(`select set_config('request.jwt.claim.sub', $1, false)`, [usuario ?? ''])
const rpc = async (sql, params) => (await uno(`select ${sql} as r`, params)).r
const falla = async (promesa, codigo) => { await assert.rejects(promesa, (e) => { assert.match(String(e.message), codigo); return true }) }
const venta = (clave, lineas, metodo = 'Efectivo') => rpc(`public.procesar_venta($1,$2,$3::jsonb)`, [clave, metodo, JSON.stringify(lineas)])
const mixta = (clave, normales, personales) => rpc(`public.procesar_venta_mixta($1,'Efectivo',$2::jsonb,$3::jsonb)`, [clave, JSON.stringify(normales), JSON.stringify(personales)])
const devolver = (clave, lineas, personales = []) => rpc(`public.procesar_devolucion_mixta($1,'Defecto',$2::jsonb,$3::jsonb,null)`, [clave, JSON.stringify(lineas), JSON.stringify(personales)])
const stock = async (id) => (await uno('select stock from public.productos where id=$1', [id])).stock
const contar = async (tabla, donde = 'true', params = []) => Number((await uno(`select count(*) n from ${tabla} where ${donde}`, params)).n)
// Ejecuta fn con el rol de la API (anon/authenticated) y el JWT indicado, como lo haría PostgREST.
const conRol = async (rol, usuario, fn) => { await como(usuario); await q(`set role ${rol}`); try { return await fn() } finally { await q('reset role') } }
const seguridadOk = async () => (await db.exec(archivo('consultas/verificacion_seguridad.sql'))).at(-1).rows

test('instala esquema y migraciones en orden documentado', { skip: omitir }, async () => {
  db = new PGlite()
  await aplicar('tests/sql/esquema_base_prueba.sql')
  for (const m of DEPENDENCIAS) await aplicar(m)
  await db.exec(`
    insert into auth.users values ('${ADMIN}'),('${VENDEDOR}'),('${INACTIVO}');
    insert into public.usuarios (id,correo,nombre,rol,activo) values ('${ADMIN}','a@x','Kike','Admin',true),('${VENDEDOR}','v@x','Vende','Vendedor',true),('${INACTIVO}','i@x','Ex','Vendedor',false);
    insert into public.productos (id,codigo,nombre,precio,costo,stock,archivado) values
      ('${A}','A','Aceite',100,70,0,false),('${B}','B','Balata',200,120,50,false),('${ARCH}','C','Archivado',10,5,3,true),
      ('${NEG1}','N1','Neg uno',10,5,-10,false),('${NEG2}','N2','Neg dos',10,5,-10,false),('${NEG3}','N3','Neg tres',10,5,-10,false),('${VINC}','V','Vinculado',50,30,4,false),('${NEG4}','N4','Neg cuatro',10,5,-10,false);
    insert into public.catalogo_importaciones (id,proveedor_id,archivo_nombre,archivo_sha256,creado_por,estado) select '${IMP}',id,'cedis.xlsx',repeat('a',64),'${ADMIN}','PUBLICADA' from public.catalogo_proveedores where clave='CEDIS';
    insert into public.catalogo_productos (id,proveedor_id,codigo_original,nombre,origen_archivo,ultima_importacion_id,ambiguo)
      select x.id::uuid,p.id,x.codigo,x.nombre,'cedis.xlsx','${IMP}',x.ambiguo from public.catalogo_proveedores p,
      (values ('${EXT}','EXT-1','Espejo externo',false),('${AMBIG}','EXT-2','Familia ambigua',true),('${EXT_VINC}','EXT-3','Externo vinculado',false),('${EXT_APR}','EXT-4','Externo aprendizaje',false)) x(id,codigo,nombre,ambiguo) where p.clave='CEDIS';
    insert into public.catalogo_ofertas (catalogo_producto_id,importacion_id,nivel,descuento_porcentaje,costo_efectivo) select id,'${IMP}','BASE',0,100 from public.catalogo_productos;
    insert into public.catalogo_vinculos_inventario (catalogo_producto_id,producto_id,confirmado_por) values ('${EXT_VINC}','${VINC}','${ADMIN}');`)
  // Antes de la migración: la aplicación actual cobra con el RPC original.
  await como(VENDEDOR)
  assert.equal((await venta(k(900), [{ producto_id: B, cantidad: 1 }])).ok, true)
  await falla(venta(k(901), [{ producto_id: A, cantidad: 1 }]), /STOCK_INSUFICIENTE/)
  await falla(venta(k(902), [{ producto_id: B, cantidad: 1, precio_unitario: 1 }]), /LINEAS_INVALIDAS/)
  await como(ADMIN); await falla(rpc('public.cambiar_stock_producto($1,-10,0,null)', [NEG1]), /STOCK_INVALIDO/); await como(VENDEDOR)
  // La consulta de diagnóstico (sólo lectura) debe reportar todas las marcas que exige la compuerta de contrato.
  const diagnostico = JSON.parse((await db.exec(archivo('consultas/diagnostico_rpc_ventas_flexibles.sql'))).at(-1).rows[0].diagnostico)
  assert.ok(diagnostico.contrato_venta.length >= 20 && diagnostico.contrato_venta.every((f) => f.presente), JSON.stringify(diagnostico.contrato_venta.filter((f) => !f.presente)))
  assert.equal(diagnostico.devolucion_tiene_validacion_esperada, true)
  assert.deepEqual(diagnostico.funciones.map((f) => f.firma.split('(')[0]).filter((n) => ['procesar_venta', 'procesar_venta_mixta', 'procesar_devolucion', 'procesar_devolucion_mixta'].includes(n)).sort(), ['procesar_devolucion', 'procesar_devolucion_mixta', 'procesar_venta', 'procesar_venta_mixta'])
  assert.ok(diagnostico.llamadores.includes('procesar_venta_pos(uuid,text,jsonb,numeric)'))
  assert.ok(diagnostico.folios[0].forma.startsWith('FLV-99999999-') && diagnostico.movimientos_90_dias.some((m) => m.origen === 'SISTEMA'))
  assert.ok(diagnostico.rls.length === 10 && diagnostico.columnas.length > 50)
  // Endurecimiento primero: todo lo que sigue (ventas, devoluciones, recepciones, rollback) corre con RLS activa.
  const expuestas = JSON.parse((await db.exec(archivo('consultas/diagnostico_seguridad_supabase.sql'))).at(-1).rows[0].seguridad).tablas_expuestas.map((t) => t.tabla)
  assert.ok(['public.productos', 'public.ventas', 'public.movimientos_inventario'].every((t) => expuestas.includes(t)), JSON.stringify(expuestas))
  await aplicar('fastlook_seguridad_tablas_operativas.sql')
  assert.deepEqual((await seguridadOk()).filter((f) => !f.ok), [])
  assert.deepEqual(JSON.parse((await db.exec(archivo('consultas/diagnostico_seguridad_supabase.sql'))).at(-1).rows[0].seguridad).tablas_expuestas, [])
  await aplicar('fastlook_inventario_stock_negativo.sql')
  await aplicar('fastlook_venta_flexible_proveedores.sql')
  assert.equal(await contar('public.fastlook_migracion_respaldos', `migracion='venta_flexible_proveedores_v1'`), 4)
  assert.equal(await contar('public.fastlook_migracion_respaldos', `migracion='inventario_stock_negativo_v1'`), 2)
})

test('aplicación antigua + RPC nuevo: precio oficial, agrupación, stock negativo e idempotencia', { skip: omitir }, async () => {
  await como(VENDEDOR)
  const r = await venta(k(1), [{ producto_id: A, cantidad: 1 }, { producto_id: A, cantidad: 2 }])
  assert.equal(Number(r.total), 300)
  const filas = await q('select * from public.ventas where ticket_id=$1', [r.ticket_id])
  assert.equal(filas.length, 1); assert.equal(filas[0].cantidad, 3); assert.equal(Number(filas[0].precio), 100); assert.equal(filas[0].precio_modificado, false)
  assert.equal(await stock(A), -3)
  const mov = await uno('select * from public.movimientos_inventario where ticket_id=$1', [r.ticket_id])
  assert.deepEqual([mov.stock_anterior, mov.stock_nuevo], [0, -3])
  const otra = await venta(k(1), [{ producto_id: A, cantidad: 9 }])
  assert.equal(otra.idempotente, true); assert.equal(otra.ticket_id, r.ticket_id); assert.equal(await stock(A), -3)
})

test('aplicación nueva: precio modificado exige motivo y queda auditado; precios distintos no se mezclan', { skip: omitir }, async () => {
  await como(VENDEDOR)
  await falla(venta(k(2), [{ producto_id: B, cantidad: 1, precio_unitario: 180 }]), /MOTIVO_PRECIO_REQUERIDO/)
  assert.equal(await stock(B), 49)
  const r = await venta(k(3), [{ producto_id: B, cantidad: 1, precio_unitario: 180, motivo_precio: 'DESCUENTO_CLIENTE' }, { producto_id: B, cantidad: 2 }, { producto_id: B, cantidad: 1, precio_unitario: 200 }])
  const filas = await q('select * from public.ventas where ticket_id=$1 order by precio', [r.ticket_id])
  assert.equal(filas.length, 2)
  assert.deepEqual(filas.map((f) => [Number(f.precio), f.cantidad, f.precio_modificado, f.motivo_precio, f.precio_modificado_por]), [[180, 1, true, 'DESCUENTO_CLIENTE', VENDEDOR], [200, 3, false, null, null]])
  assert.equal(Number(r.total), 780); assert.equal(await stock(B), 45)
})

test('validaciones originales y nuevas fallan limpias, sin escribir', { skip: omitir }, async () => {
  const antes = await contar('public.ventas_tickets')
  await como(VENDEDOR)
  await falla(venta(k(4), [{ producto_id: A, cantidad: '1.5' }]), /LINEAS_INVALIDAS/)
  await falla(venta(k(5), [{ producto_id: 'no-uuid', cantidad: 1 }]), /LINEAS_INVALIDAS/)
  await falla(venta(k(6), [{ producto_id: A, cantidad: 1, precio_unitario: -1, motivo_precio: 'PROMOCION' }]), /LINEAS_INVALIDAS/)
  await falla(venta(k(7), [{ producto_id: A, catalogo_producto_id: EXT, cantidad: 1 }]), /LINEAS_INVALIDAS/)
  await falla(venta(k(8), [{ producto_id: ARCH, cantidad: 1 }]), /PRODUCTO_ARCHIVADO/)
  await falla(venta(k(9), [{ producto_id: '10000000-0000-4000-8000-0000000000ff', cantidad: 1 }]), /PRODUCTO_INEXISTENTE/)
  await falla(venta(k(10), [{ catalogo_producto_id: AMBIG, cantidad: 1 }]), /CATALOGO_INEXISTENTE/)
  await falla(venta(k(11), [{ catalogo_producto_id: EXT_VINC, cantidad: 1 }]), /CATALOGO_VINCULADO/)
  await falla(venta(k(12), []), /CARRITO_VACIO/)
  await falla(venta(k(13), [{ producto_id: A, cantidad: 1 }], 'Cheque'), /METODO_INVALIDO/)
  await como(INACTIVO); await falla(venta(k(14), [{ producto_id: A, cantidad: 1 }]), /USUARIO_INACTIVO/)
  await como(null); await falla(venta(k(15), [{ producto_id: A, cantidad: 1 }]), /SIN_SESION/)
  assert.equal(await contar('public.ventas_tickets'), antes)
})

test('ticket exclusivamente externo: precio de oferta o validado, sin tocar inventario', { skip: omitir }, async () => {
  await como(VENDEDOR)
  const movs = await contar('public.movimientos_inventario'), productos = JSON.stringify(await q('select id,stock,precio from public.productos order by id'))
  const r = await venta(k(20), [{ catalogo_producto_id: EXT, cantidad: 2 }, { catalogo_producto_id: EXT, cantidad: 1, precio_unitario: 125, motivo_precio: 'PROMOCION' }])
  assert.equal(Number(r.total), 385); assert.equal(Number(r.total_externo), 385)
  const filas = await q('select * from public.ventas_catalogo_proveedores where ticket_id=$1 order by precio', [r.ticket_id])
  assert.deepEqual(filas.map((f) => [Number(f.precio), Number(f.precio_lista), f.cantidad, Number(f.costo_unitario)]), [[125, 130, 1, 100], [130, 130, 2, 100]])
  assert.equal(await contar('public.ventas', 'ticket_id=$1', [r.ticket_id]), 0)
  assert.equal(await contar('public.movimientos_inventario'), movs)
  assert.equal(JSON.stringify(await q('select id,stock,precio from public.productos order by id')), productos)
})

test('ticket mixto (inventario + externo + personalizado) y venta por voz por la firma mixta', { skip: omitir }, async () => {
  await como(VENDEDOR)
  const r = await mixta(k(30), [{ producto_id: B, cantidad: 1 }, { catalogo_producto_id: EXT, cantidad: 2 }], [{ tipo_personalizado: 'SERVICIO_MOTO', cantidad: 1, configuracion: { nivel: 'Normal', precio_final: 70 } }])
  assert.equal(Number(r.total), 200 + 260 + 70)
  assert.equal(Number((await uno('select total from public.ventas_tickets where ticket_id=$1', [r.ticket_id])).total), 530)
  const voz = await mixta(k(31), [], [{ tipo_personalizado: 'SERVICIO_MOTO', cantidad: 1, configuracion: { nivel: 'Normal', precio_final: 55 } }])
  assert.equal(Number(voz.total), 55)
})

test('POS calcula cambio sobre el total del RPC nuevo', { skip: omitir }, async () => {
  await como(VENDEDOR)
  const r = await rpc(`public.procesar_venta_pos($1,'Efectivo',$2::jsonb,500)`, [k(40), JSON.stringify([{ catalogo_producto_id: EXT, cantidad: 1 }])])
  assert.equal(Number(r.cambio), 370)
})

test('devolución externa parcial, acumulada y total sin inventario; mixta con inventario negativo', { skip: omitir }, async () => {
  await como(VENDEDOR)
  const t = await venta(k(50), [{ catalogo_producto_id: EXT, cantidad: 2 }, { producto_id: A, cantidad: 1 }])
  const ext = await uno('select id from public.ventas_catalogo_proveedores where ticket_id=$1', [t.ticket_id])
  const inv = await uno('select id from public.ventas where ticket_id=$1', [t.ticket_id])
  const movs = await contar('public.movimientos_inventario'), stockA = await stock(A)
  const d1 = await devolver(k(51), [{ venta_externa_id: ext.id, cantidad: 1 }])
  assert.equal(Number(d1.total_devuelto), 130); assert.equal(d1.externas, 1)
  const cab = await uno('select * from public.devoluciones where id=$1', [d1.devolucion_id])
  assert.deepEqual([Number(cab.costo_revertido), Number(cab.utilidad_revertida), cab.usuario_id, cab.motivo], [100, 30, VENDEDOR, 'Defecto'])
  assert.equal(await contar('public.movimientos_inventario'), movs); assert.equal(await stock(A), stockA)
  assert.equal((await devolver(k(51), [{ venta_externa_id: ext.id, cantidad: 1 }])).idempotente, true)
  assert.equal(await contar('public.devoluciones_externas_detalle', 'venta_externa_id=$1', [ext.id]), 1)
  // Mixta: la última unidad externa + inventario que se repone desde saldo negativo.
  const d2 = await devolver(k(52), [{ venta_externa_id: ext.id, cantidad: 1 }, { venta_id: inv.id, cantidad: 1 }])
  assert.equal(Number(d2.total_devuelto), 230); assert.equal(await stock(A), stockA + 1)
  const cab2 = await uno('select * from public.devoluciones where id=$1', [d2.devolucion_id])
  assert.deepEqual([Number(cab2.costo_revertido), Number(cab2.utilidad_revertida)], [170, 60])
  await falla(devolver(k(53), [{ venta_externa_id: ext.id, cantidad: 1 }]), /CANTIDAD_EXCEDIDA/)
  await falla(devolver(k(54), [{ venta_externa_id: ext.id, venta_id: inv.id, cantidad: 1 }]), /LINEAS_INVALIDAS/)
  const historial = await uno('select ded.*, d.motivo, d.usuario_id from public.devoluciones_externas_detalle ded join public.devoluciones d on d.id=ded.devolucion_id where ded.devolucion_id=$1', [d1.devolucion_id])
  assert.deepEqual([historial.ticket_id, historial.venta_externa_id, historial.cantidad, Number(historial.subtotal_devuelto), historial.usuario_id], [t.ticket_id, ext.id, 1, 130, VENDEDOR])
})

test('aprendizaje: sólo 4 tickets CANDIDATO válidos generan sugerencia; aprobación exclusiva de Admin', { skip: omitir }, async () => {
  await como(VENDEDOR)
  const cand = (n, extra = {}) => venta(k(n), [{ producto_id: B, cantidad: 1, precio_unitario: 210, motivo_precio: 'CANDIDATO_PRECIO_OFICIAL', ...extra }])
  for (const n of [60, 61, 62]) await cand(n)
  await venta(k(63), [{ producto_id: B, cantidad: 1, precio_unitario: 210, motivo_precio: 'PROMOCION' }])
  await cand(64, { descuento_conjunto: true })
  const cancelado = await cand(65)
  const devuelto = await cand(66)
  await q(`update public.ventas_tickets set estado='Cancelado' where ticket_id=$1`, [cancelado.ticket_id])
  const lineaDev = await uno('select id from public.ventas where ticket_id=$1', [devuelto.ticket_id])
  await devolver(k(67), [{ venta_id: lineaDev.id, cantidad: 1 }])
  await como(ADMIN)
  assert.deepEqual(await rpc('public.obtener_sugerencias_precio_admin()'), [])
  await como(VENDEDOR); await cand(68)
  await falla(rpc('public.obtener_sugerencias_precio_admin()'), /ROL_NO_PERMITIDO/)
  await falla(rpc('public.aprobar_sugerencia_precio($1,210)', [B]), /ROL_NO_PERMITIDO/)
  await como(ADMIN)
  const [s] = await rpc('public.obtener_sugerencias_precio_admin()')
  assert.deepEqual([s.tickets, Number(s.precio_anterior), Number(s.precio_candidato), Number(s.margen_estimado_pct), s.evidencia.length], [4, 200, 210, 42.9, 4])
  assert.equal(Number((await uno('select precio from public.productos where id=$1', [B])).precio), 200)
  const ok = await rpc('public.aprobar_sugerencia_precio($1,210)', [B])
  assert.equal(ok.tickets, 4)
  assert.equal(Number((await uno('select precio from public.productos where id=$1', [B])).precio), 210)
  assert.equal(await contar('public.historial_precios_productos', 'producto_id=$1', [B]), 1)
  await falla(rpc('public.aprobar_sugerencia_precio($1,210)', [B]), /EVIDENCIA_INSUFICIENTE/)
  assert.deepEqual(await rpc('public.obtener_sugerencias_precio_admin()'), [])
})

test('aplicación nueva con interruptor apagado y encendido: payloads reales del carrito', { skip: omitir }, async () => {
  await como(VENDEDOR)
  const producto = await uno('select * from public.productos where id=$1', [B])
  producto.precio = Number(producto.precio)
  // Apagado: el carrito no permite cambiar precios, así que el payload es el formato antiguo.
  const apagado = construirPayloadVenta([crearLineaInventario(producto, 2)])
  assert.deepEqual(Object.keys(apagado.lineasNormales[0]).sort(), ['cantidad', 'producto_id'])
  assert.equal(Number((await venta(k(100), apagado.lineasNormales)).total), producto.precio * 2)
  // Encendido: precio manual con motivo, más artículo externo sin modificar.
  let carrito = cambiarPrecioLinea([crearLineaInventario(producto, 1)], B, producto.precio - 10)
  carrito = cambiarMotivoPrecioLinea(carrito, B, 'PROMOCION')
  carrito.push(crearLineaCatalogo({ idLocal: 'catalogo:x', catalogoProductoId: EXT, codigo: 'EXT-1', nombre: 'Espejo', proveedor: 'CEDIS', precioLista: 130, precioUnitarioCobrado: 130 }))
  const r = await venta(k(101), construirPayloadVenta(carrito).lineasNormales)
  assert.equal(Number(r.total), producto.precio - 10 + 130)
  const fila = await uno('select * from public.ventas where ticket_id=$1', [r.ticket_id])
  assert.deepEqual([Number(fila.precio), Number(fila.precio_lista), fila.motivo_precio, fila.precio_modificado_por], [producto.precio - 10, producto.precio, 'PROMOCION', VENDEDOR])
})

test('campos financieros enviados por el navegador se rechazan, como en el original', { skip: omitir }, async () => {
  await como(VENDEDOR)
  const antes = await contar('public.ventas_tickets')
  for (const extra of [{ costo_unitario: 0 }, { precio_lista: 1 }, { total: 1 }, { ticket_id: k(999) }, { precio_modificado_por: ADMIN }, { stock: 999 }]) {
    await falla(venta(k(102), [{ producto_id: B, cantidad: 1, ...extra }]), /LINEAS_INVALIDAS/)
    await falla(venta(k(102), [{ catalogo_producto_id: EXT, cantidad: 1, ...extra }]), /LINEAS_INVALIDAS/)
  }
  await falla(mixta(k(102), [], [{ tipo_personalizado: 'SERVICIO_MOTO', cantidad: 1, configuracion: { nivel: 'Normal', precio_final: 70 }, precio_unitario: 1 }]), /LINEAS_PERSONALIZADAS_INVALIDAS/)
  assert.equal(await contar('public.ventas_tickets'), antes)
  const r = await venta(k(104), [{ producto_id: B, cantidad: 1 }], ' Efectivo ') // el original recorta el método
  assert.equal(r.metodo_pago, 'Efectivo')
  const v = await uno('select * from public.ventas where ticket_id=$1', [r.ticket_id]), p = await uno('select precio, costo from public.productos where id=$1', [B])
  assert.deepEqual([Number(v.costo_unitario), Number(v.precio_lista), Number(v.total), v.precio_modificado_por], [Number(p.costo), Number(p.precio), Number(p.precio), null])
})

test('venta por voz real (registrar_venta_voz) sobre el RPC nuevo, deshacer y devolución bloqueada', { skip: omitir }, async () => {
  await como(VENDEDOR)
  const captura = k(105)
  const r = await rpc('public.registrar_venta_voz($1,55)', [captura])
  assert.deepEqual([Number(r.total), r.idempotente, r.metodo_pago], [55, false, 'Efectivo'])
  assert.equal((await rpc('public.registrar_venta_voz($1,55)', [captura])).idempotente, true)
  const linea = await uno('select nombre, precio_unitario from public.ventas_personalizadas where ticket_id=$1', [r.ticket_id])
  assert.deepEqual([linea.nombre, Number(linea.precio_unitario)], ['Servicio de moto - Normal', 55])
  assert.equal((await rpc('public.deshacer_venta_voz($1,$2)', [captura, k(106)])).deshecha, true)
  assert.equal((await uno('select estado from public.ventas_tickets where ticket_id=$1', [r.ticket_id])).estado, 'Cancelado')
})

test('stock negativo en venta: -10 vender 5 = -15 con movimiento auditable', { skip: omitir }, async () => {
  await como(VENDEDOR)
  const r = await venta(k(103), [{ producto_id: NEG4, cantidad: 5 }])
  assert.equal(await stock(NEG4), -15)
  const mov = await uno('select * from public.movimientos_inventario where ticket_id=$1', [r.ticket_id])
  assert.deepEqual([mov.stock_anterior, mov.cantidad, mov.stock_nuevo, mov.tipo_movimiento, mov.nota, mov.origen], [-10, 5, -15, 'Venta', 'Salida por venta', 'SISTEMA'])
  assert.match(r.folio, /^FLV-\d{8}-[0-9A-F]{12}$/)
})

test('aprendizaje externo: errores de captura excluidos, descarte consume evidencia y aprobación fija el precio', { skip: omitir }, async () => {
  const cand = async (n, precio = 140) => { await como(VENDEDOR); return venta(k(n), [{ catalogo_producto_id: EXT_APR, cantidad: 1, precio_unitario: precio, motivo_precio: 'CANDIDATO_PRECIO_OFICIAL' }]) }
  const externas = async () => { await como(ADMIN); return (await rpc('public.obtener_sugerencias_precio_admin()')).filter((x) => x.tipo === 'externo') }
  for (const n of [110, 111, 112]) await cand(n)
  const fuera = await cand(113, 300) // fuera de ±50 %: se vende igual, pero no cuenta como evidencia
  assert.equal(Number(fuera.total), 300)
  assert.equal((await externas()).length, 0)
  const evidencia300 = async () => Number((await uno(`select count(*) n from public._evidencia_precio_candidato() where articulo_id=$1 and precio=300`, [EXT_APR])).n)
  assert.equal(await evidencia300(), 0)
  await como(VENDEDOR); await falla(rpc('public.configurar_variacion_sugerencias_precio(200)'), /ROL_NO_PERMITIDO/)
  await como(ADMIN); await rpc('public.configurar_variacion_sugerencias_precio(200)')
  assert.equal(await evidencia300(), 1)
  await falla(rpc('public.configurar_variacion_sugerencias_precio(0)'), /PORCENTAJE_INVALIDO/)
  await rpc('public.configurar_variacion_sugerencias_precio(50)')
  await cand(114)
  const [s] = await externas()
  assert.deepEqual([s.articulo_id, s.tickets, Number(s.precio_anterior), Number(s.precio_candidato), s.proveedor, Number(s.margen_estimado_pct)], [EXT_APR, 4, 130, 140, 'CEDIS', 28.6])
  await falla(rpc(`public.descartar_sugerencia_precio('externo',$1,140,'')`, [EXT_APR]), /DATOS_INVALIDOS/)
  await como(VENDEDOR); await falla(rpc(`public.descartar_sugerencia_precio('externo',$1,140,'x')`, [EXT_APR]), /ROL_NO_PERMITIDO/)
  await como(ADMIN)
  assert.equal((await rpc(`public.descartar_sugerencia_precio('externo',$1,140,'Precio de temporada')`, [EXT_APR])).tickets_descartados, 4)
  assert.equal((await externas()).length, 0)
  await falla(rpc('public.aprobar_sugerencia_precio_externo($1,140)', [EXT_APR]), /EVIDENCIA_INSUFICIENTE/)
  for (const n of [115, 116, 117, 118]) await cand(n)
  assert.equal((await externas())[0].tickets, 4)
  await como(VENDEDOR); await falla(rpc('public.aprobar_sugerencia_precio_externo($1,140)', [EXT_APR]), /ROL_NO_PERMITIDO/)
  await como(ADMIN)
  assert.equal(Number((await rpc('public.aprobar_sugerencia_precio_externo($1,140)', [EXT_APR])).precio_anterior), 130)
  assert.equal(await contar('public.historial_precios_catalogo', 'catalogo_producto_id=$1', [EXT_APR]), 1)
  assert.equal((await externas()).length, 0)
  const catalogo = await rpc(`public.obtener_catalogo_proveedores('EXT-4')`)
  assert.deepEqual([Number(catalogo.productos[0].precio_venta), Number(catalogo.productos[0].precio_venta_sugerido)], [140, 130])
  await como(VENDEDOR)
  assert.equal(Number((await venta(k(119), [{ catalogo_producto_id: EXT_APR, cantidad: 1 }])).total), 140)
})

test('stock negativo: edición sin tocar existencias y recepciones -10+4, -10+10, -10+15', { skip: omitir }, async () => {
  await como(ADMIN)
  const editar = (stockEnviado) => rpc(`public.actualizar_producto_admin($1,'N1','Nombre nuevo','OTROS',12,null,$2,null,null,null,'/foto.webp',null,null)`, [NEG1, stockEnviado])
  assert.equal((await editar(null)).stock, -10)
  assert.equal((await editar(-10)).nombre, 'Nombre nuevo')
  await falla(editar(0), /STOCK_SOLO_POR_AJUSTE/)
  assert.equal(await stock(NEG1), -10)
  const recibir = (clave, id, cantidad) => rpc('public.recibir_mercancia_producto($1,$2,$3,$4)', [clave, id, cantidad, 'Factura 123'])
  assert.equal((await recibir(k(70), NEG1, 4)).stock_nuevo, -6)
  assert.equal((await recibir(k(71), NEG2, 10)).stock_nuevo, 0)
  const r = await recibir(k(72), NEG3, 15)
  assert.deepEqual([r.stock_anterior, r.diferencia, r.stock_nuevo], [-10, 15, 5])
  assert.equal((await recibir(k(72), NEG3, 15)).idempotente, true); assert.equal(await stock(NEG3), 5)
  await falla(recibir(k(72), NEG3, 3), /IDEMPOTENCIA_CONFLICTO/)
  const mov = await uno(`select * from public.movimientos_inventario where producto_id=$1 and tipo_movimiento='Entrada'`, [NEG3])
  assert.deepEqual([mov.stock_anterior, mov.cantidad, mov.stock_nuevo], [-10, 15, 5]); assert.match(mov.nota, /Factura 123 · Kike/)
  assert.equal((await uno('select usuario_id from public.inventario_recepciones where idempotency_key=$1', [k(72)])).usuario_id, ADMIN)
  await falla(recibir(k(73), NEG1, 0), /CANTIDAD_INVALIDA/)
  // cambiar_stock_producto de producción, parcheado: ajusta desde saldo negativo y deja AJUSTE_STOCK.
  const ajuste = await rpc(`public.cambiar_stock_producto($1,-6,2,'Conteo físico')`, [NEG1])
  assert.deepEqual([ajuste.codigo, ajuste.stock_anterior, ajuste.stock_nuevo, ajuste.diferencia], ['STOCK_ACTUALIZADO', -6, 2, 8])
  assert.equal((await rpc('public.cambiar_stock_producto($1,2,-1,null)', [NEG1]).catch((e) => ({ error: e.message }))).error?.includes('STOCK_INVALIDO'), true)
  assert.equal((await uno(`select nota from public.movimientos_inventario where producto_id=$1 and tipo_movimiento='AJUSTE_STOCK'`, [NEG1])).nota, 'Cambio manual de stock: Conteo físico')
  await como(VENDEDOR); await falla(recibir(k(74), NEG1, 1), /ROL_NO_PERMITIDO/)
})

test('permisos: núcleo interno inaccesible, anon sin venta, lectura externa sólo personal activo', { skip: omitir }, async () => {
  await como(VENDEDOR)
  await q('set role authenticated')
  try {
    await falla(q(`select public._procesar_venta_flexible($1,'Efectivo','[]','[]')`, [k(80)]), /permission denied/)
    await falla(q('select * from public._evidencia_precio_candidato()'), /permission denied/)
    assert.ok(await contar('public.ventas_catalogo_proveedores') > 0)
    await falla(q('insert into public.ventas_catalogo_proveedores (ticket_id) values (null)'), /permission denied/)
    await como(INACTIVO); assert.equal(await contar('public.ventas_catalogo_proveedores'), 0)
  } finally { await q('reset role') }
  await q('set role anon')
  try { await falla(q(`select public.procesar_venta($1,'Efectivo','[]')`, [k(81)]), /permission denied/) } finally { await q('reset role') }
})

test('seguridad: anon sin acceso; Vendedor sólo lee y vende por RPC; Admin opera productos por RPC auditado', { skip: omitir }, async () => {
  const precioB = Number((await uno('select precio from public.productos where id=$1', [B])).precio)
  // Cliente sin sesión (llave pública): nada de lectura ni escritura directa en tablas operativas.
  await conRol('anon', null, async () => {
    for (const sql of ['select * from public.productos', 'select * from public.ventas', 'select * from public.movimientos_inventario',
      `update public.productos set precio = 0`, `delete from public.ventas`, `insert into public.movimientos_inventario (nombre) values ('x')`,
      `insert into public.ventas (codigo,nombre,precio,total) values ('X','X',1,1)`, 'truncate public.ventas']) await falla(q(sql), /permission denied/)
    await falla(rpc(`public.operar_producto_admin($1,$2,'SUMAR_STOCK',1)`, [k(130), B]), /permission denied/)
  })
  // Vendedor activo: lee, cobra por RPC, registra abonos; no altera precios, stock, ventas ni historial.
  await conRol('authenticated', VENDEDOR, async () => {
    assert.ok(await contar('public.productos') > 0); assert.ok(await contar('public.ventas') > 0); assert.ok(await contar('public.movimientos_inventario') > 0)
    await falla(q('update public.productos set precio = 0 where id=$1', [B]), /permission denied/)
    await q('delete from public.productos where id=$1', [VINC]) // política Admin: no borra nada
    await falla(q(`insert into public.ventas (codigo,nombre,precio,cantidad,total,metodo_pago) values ('B','Balata',1,1,1,'Efectivo')`), /row-level security/)
    await q(`insert into public.ventas (codigo,nombre,precio,cantidad,total,metodo_pago) values ('ABONO','ABONO - Cliente',50,1,50,'Abono')`)
    await falla(q(`insert into public.ventas (codigo,nombre,precio,cantidad,total,metodo_pago,producto_id) values ('ABONO','x',50,1,50,'Abono',$1)`, [B]), /row-level security/)
    await falla(q(`update public.ventas set total = 0`), /permission denied/)
    await falla(q('delete from public.ventas'), /permission denied/)
    await falla(q(`insert into public.movimientos_inventario (nombre) values ('x')`), /permission denied/)
    await falla(q('truncate public.ventas'), /permission denied/)
    await falla(rpc(`public.operar_producto_admin($1,$2,'SUMAR_STOCK',1)`, [k(131), B]), /ROL_NO_PERMITIDO/)
    assert.equal((await venta(k(132), [{ producto_id: B, cantidad: 1 }])).ok, true) // las ventas siguen por RPC SECURITY DEFINER
  })
  assert.equal(await contar('public.productos', 'id=$1', [VINC]), 1)
  assert.equal(Number((await uno('select precio from public.productos where id=$1', [B])).precio), precioB)
  // Vendedor inactivo: RLS no le muestra nada.
  await conRol('authenticated', INACTIVO, async () => { assert.equal(await contar('public.productos'), 0); assert.equal(await contar('public.ventas'), 0) })
  await q(`insert into public.productos (id,codigo,nombre,precio,stock) values ($1,'TMP-1','Casco sin historial',1,0)`, [k(138)])
  // Admin: operaciones de Cascos/Asistente por RPC con movimiento en la misma transacción; DELETE sólo por política Admin.
  await conRol('authenticated', ADMIN, async () => {
    const stock0 = await stock(B)
    const r = await rpc(`public.operar_producto_admin($1,$2,'SUMAR_STOCK',3,null,'CASCOS','Reposición de casco')`, [k(133), B])
    assert.deepEqual([r.stock_anterior, r.stock_nuevo], [stock0, stock0 + 3])
    assert.equal((await rpc(`public.operar_producto_admin($1,$2,'SUMAR_STOCK',3,null,'CASCOS','Reposición de casco')`, [k(133), B])).idempotente, true)
    await falla(rpc(`public.operar_producto_admin($1,$2,'RESTAR_STOCK',100000)`, [k(134), B]), /CANTIDAD_INVALIDA/)
    await falla(rpc(`public.operar_producto_admin($1,$2,'RESTAR_STOCK',9999)`, [k(135), B]), /STOCK_INSUFICIENTE/)
    await rpc(`public.operar_producto_admin($1,$2,'CAMBIAR_UBICACION',null,'Pasillo 9','ASISTENTE',null,$3)`, [k(136), B, k(137)])
    assert.equal((await uno('select ubicacion from public.productos where id=$1', [B])).ubicacion, 'Pasillo 9')
    const mov = await uno(`select * from public.movimientos_inventario where producto_id=$1 and tipo_movimiento='CAMBIO_UBICACION'`, [B])
    assert.deepEqual([mov.origen, mov.usuario_rol, mov.accion_asistente_id, mov.valor_nuevo], ['ASISTENTE', 'Admin', k(137), 'Pasillo 9'])
    await falla(q('update public.productos set stock = 0 where id=$1', [B]), /permission denied/)
    await q('delete from public.productos where id=$1', [k(138)])
    assert.equal(await contar('public.productos', 'id=$1', [k(138)]), 0)
    await rpc(`public.operar_producto_admin($1,$2,'ARCHIVAR',null,null,'CASCOS','Casco archivado')`, [k(139), ARCH]).catch((e) => assert.match(e.message, /PRODUCTO_ARCHIVADO/))
  })
})

test('verificación post-instalación: funciones, permisos, RLS e integridad de stock y totales', { skip: omitir }, async () => {
  const resultados = await db.exec(archivo('consultas/verificacion_staging_venta_flexible.sql'))
  const fallidas = resultados.flatMap((r) => r.rows).filter((f) => f.ok !== true)
  assert.equal(resultados.flatMap((r) => r.rows).length > 20, true)
  assert.deepEqual(fallidas, [])
})

test('rollback: originales restaurados, formato nuevo bloqueado, historial legible; repetible', { skip: omitir }, async () => {
  const externas = await contar('public.ventas_catalogo_proveedores'), devExt = await contar('public.devoluciones_externas_detalle')
  await aplicar('fastlook_venta_flexible_proveedores_rollback.sql')
  await como(VENDEDOR)
  await q('set role authenticated')
  try {
    assert.equal((await venta(k(90), [{ producto_id: B, cantidad: 1 }])).ok, true)
    // Vuelve la regla original: un producto que quedó en negativo no se vende hasta recibir mercancía.
    assert.ok((await stock(A)) < 0)
    await falla(venta(k(91), [{ producto_id: A, cantidad: 1 }]), /STOCK_INVALIDO/)
    await falla(venta(k(92), [{ catalogo_producto_id: EXT, cantidad: 1 }]), /VERSION_INCOMPATIBLE/)
    await falla(venta(k(93), [{ producto_id: B, cantidad: 1, precio_unitario: 1 }]), /VERSION_INCOMPATIBLE/)
    await falla(mixta(k(94), [{ producto_id: B, cantidad: 1, precio_unitario: 1 }], []), /VERSION_INCOMPATIBLE/)
    assert.equal(await contar('public.ventas_catalogo_proveedores'), externas)
    assert.equal(await contar('public.devoluciones_externas_detalle'), devExt)
    await falla(q('select public.obtener_sugerencias_precio_admin()'), /permission denied/)
  } finally { await q('reset role') }
  const ext = await uno('select id from public.ventas_catalogo_proveedores order by created_at limit 1')
  await falla(devolver(k(95), [{ venta_externa_id: ext.id, cantidad: 1 }]), /LINEAS_INVALIDAS/)
  // Reaplicar y revertir otra vez: los respaldos siguen siendo los originales.
  await aplicar('fastlook_venta_flexible_proveedores.sql')
  assert.equal(Number((await venta(k(96), [{ catalogo_producto_id: EXT, cantidad: 1 }])).total), 130)
  await aplicar('fastlook_venta_flexible_proveedores_rollback.sql')
  await falla(venta(k(97), [{ catalogo_producto_id: EXT, cantidad: 1 }]), /VERSION_INCOMPATIBLE/)
})

test('compuerta de contrato: un original distinto aborta sin reemplazar nada', { skip: omitir }, async () => {
  const base = await baseNueva((sql) => sql.replaceAll("'FLV-'", "'FL-'").replaceAll('^FLV-', '^FL-'))
  await assert.rejects(base.exec(archivo('fastlook_venta_flexible_proveedores.sql')), /CONTRATO_RPC_DISTINTO: .*'FLV-'/)
  await base.exec('rollback').catch(() => {})
  assert.match((await base.query(`select prosrc from pg_proc where proname='procesar_venta'`)).rows[0].prosrc, /STOCK_INSUFICIENTE/)
  assert.equal((await base.query(`select to_regclass('public.fastlook_migracion_respaldos') t`)).rows[0].t, null)
})

test('compuerta de restricciones: CHECK stock >= 0 aborta sin reemplazar nada', { skip: omitir }, async () => {
  const base = await baseNueva()
  await base.exec('alter table public.productos add constraint productos_stock_chk check (stock >= 0)')
  await assert.rejects(base.exec(archivo('fastlook_venta_flexible_proveedores.sql')), /RESTRICCION_INCOMPATIBLE: .*stock >= 0/)
  await base.exec('rollback').catch(() => {})
  assert.match((await base.query(`select prosrc from pg_proc where proname='procesar_venta'`)).rows[0].prosrc, /STOCK_INSUFICIENTE/)
})

// No cubierto aquí: concurrencia real (PGlite usa una sola conexión). Ver scripts/staging/prueba-venta-flexible-staging.mjs.

test('reversión de inventario: restaura actualizar_producto_admin y cambiar_stock_producto originales', { skip: omitir }, async () => {
  await aplicar('fastlook_inventario_stock_negativo_rollback.sql')
  await como(ADMIN)
  await falla(rpc('public.cambiar_stock_producto($1,-15,0,null)', [NEG4]), /STOCK_INVALIDO/)
  await falla(rpc('public.recibir_mercancia_producto($1,$2,1,null)', [k(120), NEG4]).then(() => q('set role authenticated')).then(() => rpc('public.recibir_mercancia_producto($1,$2,1,null)', [k(121), NEG4])), /permission denied/)
  await q('reset role')
  assert.ok(await contar('public.inventario_recepciones') >= 3)
})

test('rollback de seguridad restaura el estado previo exacto y la fase A puede reaplicarse', { skip: omitir }, async () => {
  await aplicar('fastlook_seguridad_tablas_operativas_rollback.sql')
  const rls = (await q(`select relname, relrowsecurity from pg_class where relname in ('productos','ventas','movimientos_inventario') and relnamespace='public'::regnamespace order by 1`)).map((r) => r.relrowsecurity)
  assert.deepEqual(rls, [false, false, false])
  assert.equal((await uno(`select has_table_privilege('anon','public.productos','UPDATE') v`)).v, true)
  assert.equal(Number((await uno(`select count(*) n from pg_policies where policyname like 'productos_%' or policyname like 'ventas_select%' or policyname like 'movimientos_select%'`)).n), 0)
  await aplicar('fastlook_seguridad_tablas_operativas.sql')
  assert.deepEqual((await seguridadOk()).filter((f) => !f.ok), [])
})
