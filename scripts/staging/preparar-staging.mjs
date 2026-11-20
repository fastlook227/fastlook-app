// Prepara datos SINTÉTICOS en un proyecto Supabase de STAGING ya migrado: usuarios de prueba (Admin, Vendedor,
// Vendedor inactivo), productos de prueba y un artículo de catálogo con oferta. No usa ni copia datos de producción.
// Requiere STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, STAGING_SERVICE_ROLE_KEY (de staging) y STAGING_CONFIRMAR=staging.
// La service_role se usa sólo en esta terminal; nunca va al frontend. Repetible: reutiliza lo que ya existe.
// Ejecutar:  node scripts/staging/preparar-staging.mjs
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { entornoStaging } from './entorno.mjs'

const { url, anon, serviceRole } = entornoStaging({ conServiceRole: true })
const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
const falla = (paso, error) => { if (error) { console.error(`${paso}: ${error.message}`); process.exit(1) } }
const clave = () => `Stg-${randomBytes(9).toString('base64url')}`

const usuarios = [
  { correo: 'admin.staging@fastlook.test', nombre: 'Admin Staging', rol: 'Admin', activo: true },
  { correo: 'vendedor.staging@fastlook.test', nombre: 'Vendedor Staging', rol: 'Vendedor', activo: true },
  { correo: 'inactivo.staging@fastlook.test', nombre: 'Inactivo Staging', rol: 'Vendedor', activo: false },
]
const existentes = await admin.auth.admin.listUsers({ perPage: 1000 })
falla('listar usuarios', existentes.error)
const credenciales = {}
for (const u of usuarios) {
  const password = clave()
  let id = existentes.data.users.find((x) => x.email === u.correo)?.id
  if (id) falla(`contraseña ${u.correo}`, (await admin.auth.admin.updateUserById(id, { password })).error)
  else { const creado = await admin.auth.admin.createUser({ email: u.correo, password, email_confirm: true }); falla(`crear ${u.correo}`, creado.error); id = creado.data.user.id }
  falla(`perfil ${u.correo}`, (await admin.from('usuarios').upsert({ id, correo: u.correo, nombre: u.nombre, rol: u.rol, activo: u.activo })).error)
  credenciales[u.rol + (u.activo ? '' : '_INACTIVO')] = { correo: u.correo, password }
}

const producto = async (codigo, nombre, stock) => {
  const actual = await admin.from('productos').select('id').eq('codigo', codigo).maybeSingle()
  falla(`buscar ${codigo}`, actual.error)
  if (actual.data) return actual.data.id
  const nuevo = await admin.from('productos').insert({ codigo, nombre, tipo: 'OTROS', precio: 100, costo: 70, stock, stock_minimo: 1 }).select('id').single()
  falla(`crear ${codigo}`, nuevo.error)
  return nuevo.data.id
}
const productoId = await producto('STG-PRUEBA', 'Producto de prueba staging', 50)
const borrarId = await producto('STG-BORRAR', 'Producto sin historial staging', 0)

const proveedor = await admin.from('catalogo_proveedores').select('id').eq('clave', 'CEDIS').single()
falla('proveedor CEDIS (aplica fastlook_catalogo_proveedores.sql)', proveedor.error)
const adminId = (await admin.from('usuarios').select('id').eq('correo', usuarios[0].correo).single()).data.id
const importacion = await admin.from('catalogo_importaciones').upsert({ proveedor_id: proveedor.data.id, archivo_nombre: 'staging-sintetico.json', archivo_sha256: 'f'.repeat(64), estado: 'PUBLICADA', creado_por: adminId }, { onConflict: 'proveedor_id,archivo_sha256' }).select('id').single()
falla('importación sintética', importacion.error)
const catalogo = await admin.from('catalogo_productos').upsert({ proveedor_id: proveedor.data.id, codigo_original: 'STG-EXT-1', nombre: 'Artículo externo de prueba', origen_archivo: 'staging-sintetico.json', ultima_importacion_id: importacion.data.id }, { onConflict: 'proveedor_id,codigo_original' }).select('id').single()
falla('artículo de catálogo', catalogo.error)
falla('oferta', (await admin.from('catalogo_ofertas').upsert({ catalogo_producto_id: catalogo.data.id, importacion_id: importacion.data.id, nivel: 'BASE', descuento_porcentaje: 0, costo_efectivo: 100 }, { onConflict: 'catalogo_producto_id,importacion_id,nivel' })).error)

console.log('# Variables para los scripts de prueba (no las guardes en el repositorio):')
console.log(`$env:STAGING_SUPABASE_URL="${url}"; $env:STAGING_SUPABASE_ANON_KEY="${anon}"; $env:STAGING_CONFIRMAR="staging"`)
console.log(`$env:STAGING_ADMIN_EMAIL="${credenciales.Admin.correo}"; $env:STAGING_ADMIN_PASSWORD="${credenciales.Admin.password}"`)
console.log(`$env:STAGING_VENDEDOR_EMAIL="${credenciales.Vendedor.correo}"; $env:STAGING_VENDEDOR_PASSWORD="${credenciales.Vendedor.password}"`)
console.log(`$env:STAGING_INACTIVO_EMAIL="${credenciales.Vendedor_INACTIVO.correo}"; $env:STAGING_INACTIVO_PASSWORD="${credenciales.Vendedor_INACTIVO.password}"`)
console.log(`$env:STAGING_PRODUCTO_ID="${productoId}"; $env:STAGING_PRODUCTO_BORRAR_ID="${borrarId}"; $env:STAGING_CATALOGO_ID="${catalogo.data.id}"`)
