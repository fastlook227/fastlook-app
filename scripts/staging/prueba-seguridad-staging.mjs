// Pruebas de seguridad contra Supabase de STAGING con la API real (PostgREST + RLS + JWT).
// Crea un abono y operaciones de prueba; nunca ejecutar contra producción (lo bloquea entorno.mjs).
// Variables: las que imprime preparar-staging.mjs. Opcional: STAGING_JWT_VENCIDO (un access_token de staging
// guardado hace más de una hora) para probar el rechazo de un JWT expirado.
// Ejecutar:  node scripts/staging/prueba-seguridad-staging.mjs
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { entornoStaging, info, resultado, terminar, variable } from './entorno.mjs'

const { url, anon } = entornoStaging()
const PRODUCTO = variable('STAGING_PRODUCTO_ID'), BORRAR = variable('STAGING_PRODUCTO_BORRAR_ID', false)
const sesion = async (correo, clave) => {
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  if (correo) { const { error } = await c.auth.signInWithPassword({ email: correo, password: clave }); if (error) throw new Error(`Login ${correo}: ${error.message}`) }
  return c
}
const anonimo = await sesion()
const vendedor = await sesion(variable('STAGING_VENDEDOR_EMAIL'), variable('STAGING_VENDEDOR_PASSWORD'))
const admin = await sesion(variable('STAGING_ADMIN_EMAIL'), variable('STAGING_ADMIN_PASSWORD'))
const correoInactivo = variable('STAGING_INACTIVO_EMAIL', false)
const rechazo = ({ error }) => Boolean(error)
const filas = ({ data }) => (Array.isArray(data) ? data.length : data ? 1 : 0)
const precioActual = async () => (await admin.from('productos').select('precio,stock').eq('id', PRODUCTO).single()).data

// 1. Cliente sin sesión (sólo la llave pública).
for (const tabla of ['productos', 'ventas', 'movimientos_inventario']) {
  const lectura = await anonimo.from(tabla).select('id').limit(1)
  resultado(rechazo(lectura) || filas(lectura) === 0, `anon no lee ${tabla}`, lectura.error?.message)
}
const antes = await precioActual()
resultado(rechazo(await anonimo.from('productos').update({ precio: 0 }).eq('id', PRODUCTO)), 'anon no cambia precios')
resultado(rechazo(await anonimo.from('ventas').insert({ codigo: 'X', nombre: 'X', precio: 1, total: 1 })), 'anon no inserta ventas')
resultado(rechazo(await anonimo.from('ventas').delete().neq('codigo', '')), 'anon no borra ventas')
resultado(rechazo(await anonimo.from('movimientos_inventario').insert({ nombre: 'X' })), 'anon no inserta movimientos')
resultado(rechazo(await anonimo.rpc('procesar_venta', { p_idempotency_key: randomUUID(), p_metodo_pago: 'Efectivo', p_lineas: [{ producto_id: PRODUCTO, cantidad: 1 }] })), 'anon no vende por RPC')

// 2. JWT inválido y vencido directamente contra la API REST.
const rest = (token, ruta, opciones = {}) => fetch(`${url}/rest/v1/${ruta}`, { ...opciones, headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opciones.headers } })
const falso = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.firma-invalida'
resultado((await rest(falso, 'productos?select=id&limit=1')).status === 401, 'JWT con firma inválida → 401')
resultado((await rest(falso, 'rpc/procesar_venta', { method: 'POST', body: JSON.stringify({ p_idempotency_key: randomUUID(), p_metodo_pago: 'Efectivo', p_lineas: [] }) })).status === 401, 'RPC con JWT inválido → 401')
const vencido = variable('STAGING_JWT_VENCIDO', false)
if (vencido) resultado((await rest(vencido, 'productos?select=id&limit=1')).status === 401, 'JWT vencido → 401')
else info('JWT vencido', 'omitida: define STAGING_JWT_VENCIDO con un access_token de más de una hora')

// 3. Vendedor activo.
const lecturaVendedor = await vendedor.from('productos').select('id').limit(5)
resultado(!lecturaVendedor.error && filas(lecturaVendedor) > 0, 'Vendedor lee productos', lecturaVendedor.error?.message)
resultado(rechazo(await vendedor.from('productos').update({ precio: 0, stock: 999 }).eq('id', PRODUCTO)), 'Vendedor no cambia precio ni stock directamente')
if (BORRAR) {
  const borrado = await vendedor.from('productos').delete().eq('id', BORRAR).select('id')
  resultado(filas(borrado) === 0, 'Vendedor no borra productos (RLS)', borrado.error?.message)
}
resultado(rechazo(await vendedor.from('ventas').insert({ codigo: 'X', nombre: 'Venta directa', precio: 1, cantidad: 1, total: 1, metodo_pago: 'Efectivo' })), 'Vendedor no inserta ventas fuera de RPC')
const abono = await vendedor.from('ventas').insert({ ticket_id: null, folio: null, producto_id: null, codigo: 'ABONO', nombre: 'ABONO - Cliente staging', precio: 10, costo_unitario: null, cantidad: 1, total: 10, metodo_pago: 'Abono' })
resultado(!abono.error, 'Vendedor registra abono (compatibilidad de Clientes)', abono.error?.message)
resultado(rechazo(await vendedor.from('ventas').update({ total: 0 }).eq('codigo', 'ABONO')), 'Vendedor no modifica ventas')
resultado(rechazo(await vendedor.from('ventas').delete().eq('codigo', 'ABONO')), 'Vendedor no borra ventas')
resultado(rechazo(await vendedor.from('movimientos_inventario').insert({ nombre: 'X' })), 'Vendedor no inserta movimientos')
const operacionVendedor = await vendedor.rpc('operar_producto_admin', { p_idempotency_key: randomUUID(), p_producto_id: PRODUCTO, p_operacion: 'SUMAR_STOCK', p_cantidad: 1 })
resultado(/ROL_NO_PERMITIDO/.test(operacionVendedor.error?.message || ''), 'Vendedor no opera productos por RPC administrativo')
const ventaVendedor = await vendedor.rpc('procesar_venta', { p_idempotency_key: randomUUID(), p_metodo_pago: 'Efectivo', p_lineas: [{ producto_id: PRODUCTO, cantidad: 1 }] })
resultado(!ventaVendedor.error, 'Vendedor sigue cobrando por RPC con RLS activa', ventaVendedor.error?.message)

// 4. Usuario inactivo (opcional).
if (correoInactivo) {
  const inactivo = await sesion(correoInactivo, variable('STAGING_INACTIVO_PASSWORD'))
  resultado(filas(await inactivo.from('productos').select('id').limit(1)) === 0, 'Usuario inactivo no lee productos')
  resultado(rechazo(await inactivo.rpc('procesar_venta', { p_idempotency_key: randomUUID(), p_metodo_pago: 'Efectivo', p_lineas: [{ producto_id: PRODUCTO, cantidad: 1 }] })), 'Usuario inactivo no vende')
}

// 5. Admin.
resultado(rechazo(await admin.from('productos').update({ precio: 0 }).eq('id', PRODUCTO)), 'Admin tampoco cambia precios sin RPC auditado')
const stockAntes = (await precioActual()).stock
const suma = await admin.rpc('operar_producto_admin', { p_idempotency_key: randomUUID(), p_producto_id: PRODUCTO, p_operacion: 'SUMAR_STOCK', p_cantidad: 2, p_origen: 'CASCOS', p_nota: 'Prueba staging' })
resultado(!suma.error && suma.data?.stock_nuevo === stockAntes + 2, 'Admin suma stock por RPC con movimiento', suma.error?.message)
if (BORRAR) {
  const borrado = await admin.from('productos').delete().eq('id', BORRAR).select('id')
  resultado(!borrado.error && filas(borrado) === 1, 'Admin elimina producto sin historial (política Admin)', borrado.error?.message)
}
const despues = await precioActual()
resultado(Number(despues.precio) === Number(antes.precio), 'el precio no cambió por ninguna vía directa')

terminar()
