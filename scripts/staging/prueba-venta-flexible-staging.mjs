// Prueba contra Supabase de STAGING (PostgREST + RLS + JWT reales, solicitudes en paralelo reales).
// Crea ventas, devoluciones y recepciones de prueba: NUNCA ejecutar contra producción (se bloquea abajo).
//
// Requisitos en staging: migraciones aplicadas, un Vendedor y un Admin de prueba, un producto de inventario
// de prueba y un artículo de catálogo publicado sin vínculo a inventario.
//   STAGING_SUPABASE_URL  STAGING_SUPABASE_ANON_KEY  STAGING_CONFIRMAR=staging
//   STAGING_VENDEDOR_EMAIL  STAGING_VENDEDOR_PASSWORD  STAGING_ADMIN_EMAIL  STAGING_ADMIN_PASSWORD
//   STAGING_PRODUCTO_ID  STAGING_CATALOGO_ID
// Ejecutar:  node scripts/staging/prueba-venta-flexible-staging.mjs
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { entornoStaging, info, resultado, terminar, variable } from './entorno.mjs'

const env = (nombre) => variable(nombre)
const { url, anon } = entornoStaging()
const PRODUCTO = env('STAGING_PRODUCTO_ID'), CATALOGO = env('STAGING_CATALOGO_ID')

const cliente = async (correo, clave) => {
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  if (correo) { const { error } = await c.auth.signInWithPassword({ email: correo, password: clave }); if (error) throw new Error(`Login ${correo}: ${error.message}`) }
  return c
}
const vendedor = await cliente(env('STAGING_VENDEDOR_EMAIL'), env('STAGING_VENDEDOR_PASSWORD'))
const admin = await cliente(env('STAGING_ADMIN_EMAIL'), env('STAGING_ADMIN_PASSWORD'))
const anonimo = await cliente()

const rpc = async (c, nombre, args) => { const { data, error } = await c.rpc(nombre, args); return { data, error: error?.message || null } }
const venta = (c, lineas, clave = randomUUID()) => rpc(c, 'procesar_venta', { p_idempotency_key: clave, p_metodo_pago: 'Efectivo', p_lineas: lineas })
const stock = async () => (await admin.from('productos').select('stock').eq('id', PRODUCTO).single()).data.stock
const recibir = (cantidad, clave = randomUUID()) => rpc(admin, 'recibir_mercancia_producto', { p_idempotency_key: clave, p_producto_id: PRODUCTO, p_cantidad: cantidad, p_motivo: 'Prueba staging' })

// 1. Contratos: formato antiguo, formato nuevo, POS y externo.
const s0 = await stock()
let r = await venta(vendedor, [{ producto_id: PRODUCTO, cantidad: 1 }])
resultado(!r.error && /^FLV-\d{8}-[0-9A-F]{12}$/.test(r.data?.folio), 'formato antiguo {producto_id,cantidad}', r.error || r.data?.folio)
r = await venta(vendedor, [{ producto_id: PRODUCTO, cantidad: 1, precio_unitario: 1 }])
resultado(/MOTIVO_PRECIO_REQUERIDO/.test(r.error || ''), 'precio manual sin motivo se rechaza', r.error)
r = await venta(vendedor, [{ producto_id: PRODUCTO, cantidad: 1, precio_unitario: 1, motivo_precio: 'PROMOCION', costo_unitario: 0, precio_lista: 1 }])
const lineaManual = r.data && (await vendedor.from('ventas').select('precio,precio_lista,motivo_precio,precio_modificado_por').eq('ticket_id', r.data.ticket_id).single()).data
resultado(!r.error && Number(lineaManual?.precio) === 1 && Number(lineaManual?.precio_lista) !== 1 && lineaManual?.motivo_precio === 'PROMOCION', 'precio manual con motivo, campos financieros del navegador ignorados', r.error || JSON.stringify(lineaManual))
r = await rpc(vendedor, 'procesar_venta_pos', { p_idempotency_key: randomUUID(), p_metodo_pago: 'Efectivo', p_lineas: [{ catalogo_producto_id: CATALOGO, cantidad: 1 }], p_efectivo_recibido: 100000 })
resultado(!r.error && Number(r.data?.cambio) === 100000 - Number(r.data?.total), 'POS con artículo externo', r.error)
const lecturaExterna = r.data && await vendedor.from('ventas_catalogo_proveedores').select('id,total').eq('ticket_id', r.data.ticket_id)
resultado(lecturaExterna?.data?.length === 1, 'Vendedor lee líneas externas de su ticket (PDF/reimpresión)', lecturaExterna?.error?.message)
resultado((await stock()) === s0 - 2, 'externo no descuenta inventario', `stock ${s0} → ${await stock()}`)

// 2. Concurrencia de ventas: 8 solicitudes simultáneas del mismo producto.
const antes = await stock()
const paralelas = await Promise.all(Array.from({ length: 8 }, () => venta(vendedor, [{ producto_id: PRODUCTO, cantidad: 1 }])))
const tickets = paralelas.filter((x) => !x.error).map((x) => x.data.ticket_id)
const movs = (await admin.from('movimientos_inventario').select('stock_anterior,stock_nuevo').in('ticket_id', tickets)).data || []
const cadena = new Set(movs.map((m) => m.stock_anterior)).size === movs.length && movs.every((m) => m.stock_nuevo === m.stock_anterior - 1)
resultado(tickets.length === 8 && (await stock()) === antes - 8 && cadena, 'ventas concurrentes sin pérdidas de actualización', `stock ${antes} → ${await stock()}, errores ${paralelas.filter((x) => x.error).length}`)

// 3. Idempotencia concurrente: misma clave seis veces a la vez.
const clave = randomUUID(), antesIdem = await stock()
const repetidas = await Promise.all(Array.from({ length: 6 }, () => venta(vendedor, [{ producto_id: PRODUCTO, cantidad: 1 }], clave)))
resultado(new Set(repetidas.map((x) => x.data?.ticket_id)).size === 1 && repetidas.every((x) => !x.error) && (await stock()) === antesIdem - 1, 'misma idempotency_key concurrente = un solo ticket', repetidas.map((x) => x.error).filter(Boolean).join('; '))

// 4. Stock negativo y recepción concurrente.
const actual = await stock()
r = await venta(vendedor, [{ producto_id: PRODUCTO, cantidad: actual + 10 }])
resultado(!r.error && (await stock()) === -10, 'venta deja stock en -10', r.error || String(await stock()))
const recepciones = await Promise.all([4, 4, 2].map((n) => recibir(n)))
resultado(recepciones.every((x) => !x.error) && (await stock()) === 0, 'recepciones concurrentes -10 + 4 + 4 + 2 = 0', recepciones.map((x) => x.error).filter(Boolean).join('; '))
const claveRecepcion = randomUUID()
const recepcionRepetida = await Promise.all(Array.from({ length: 4 }, () => recibir(5, claveRecepcion)))
resultado(recepcionRepetida.every((x) => !x.error) && (await stock()) === 5, 'recepción repetida concurrente se aplica una vez', String(await stock()))

// 5. Devolución externa concurrente: 5 intentos de devolver la única unidad.
r = await venta(vendedor, [{ catalogo_producto_id: CATALOGO, cantidad: 1 }])
const lineaExterna = (await vendedor.from('ventas_catalogo_proveedores').select('id').eq('ticket_id', r.data.ticket_id).single()).data
const stockDev = await stock()
const devoluciones = await Promise.all(Array.from({ length: 5 }, () => rpc(vendedor, 'procesar_devolucion_mixta', { p_idempotency_key: randomUUID(), p_motivo: 'Defecto', p_lineas: [{ venta_externa_id: lineaExterna.id, cantidad: 1 }], p_lineas_personalizadas: [], p_motivo_otro: null })))
resultado(devoluciones.filter((x) => !x.error).length === 1 && devoluciones.filter((x) => /CANTIDAD_EXCEDIDA/.test(x.error || '')).length === 4 && (await stock()) === stockDev, 'devolución externa concurrente no excede lo vendido ni toca inventario', devoluciones.map((x) => x.error || 'ok').join(' | '))

// 6. RLS y permisos reales.
const insercion = await vendedor.from('ventas_catalogo_proveedores').insert({ ticket_id: r.data.ticket_id })
resultado(Boolean(insercion.error), 'Vendedor no puede escribir líneas externas', insercion.error?.message)
resultado(Boolean((await rpc(vendedor, '_procesar_venta_flexible', { p_idempotency_key: randomUUID(), p_metodo_pago: 'Efectivo', p_lineas: [], p_lineas_personalizadas: [] })).error), 'núcleo interno no expuesto')
resultado(/ROL_NO_PERMITIDO/.test((await rpc(vendedor, 'obtener_sugerencias_precio_admin', {})).error || ''), 'Vendedor no consulta sugerencias')
resultado(Boolean((await venta(anonimo, [{ producto_id: PRODUCTO, cantidad: 1 }])).error), 'anon no puede vender')
resultado(/ROL_NO_PERMITIDO/.test((await rpc(vendedor, 'recibir_mercancia_producto', { p_idempotency_key: randomUUID(), p_producto_id: PRODUCTO, p_cantidad: 1, p_motivo: null })).error || ''), 'Vendedor no recibe mercancía')

// 7. cambiar_stock_producto con saldo negativo (definición original no disponible en el repositorio: se informa).
await venta(vendedor, [{ producto_id: PRODUCTO, cantidad: (await stock()) + 3 }])
const negativo = await stock()
r = await rpc(admin, 'cambiar_stock_producto', { p_producto_id: PRODUCTO, p_stock_esperado: negativo, p_stock_nuevo: 0, p_motivo: 'Prueba staging' })
info('cambiar_stock_producto desde saldo negativo', r.error ? `RECHAZA: ${r.error} (usar "Añadir stock" para recepciones)` : `acepta: ${negativo} → ${await stock()}`)

terminar()
