// Configuración común de los scripts de staging. Aborta si cualquier dato apunta a producción.
// Producción se identifica por la URL y la llave pública fijas en lib/supabase.ts y por SUPABASE_SERVICE_ROLE_KEY de .env.local.
import { existsSync, readFileSync } from 'node:fs'

const leer = (ruta) => { const url = new URL(ruta, import.meta.url); return existsSync(url) ? readFileSync(url, 'utf8') : '' }
const configuracion = leer('../../lib/supabase.ts')
const PRODUCCION_URL = configuracion.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0]
const PRODUCCION_ANON = configuracion.match(/'(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9._-]+)'/)?.[1]
const PRODUCCION_SERVICE = leer('../../.env.local').match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim()

export const variable = (nombre, obligatoria = true) => {
  const valor = process.env[nombre]?.trim()
  if (!valor && obligatoria) { console.error(`Falta ${nombre}`); process.exit(2) }
  return valor || null
}

export function entornoStaging({ conServiceRole = false } = {}) {
  const url = variable('STAGING_SUPABASE_URL'), anon = variable('STAGING_SUPABASE_ANON_KEY')
  const serviceRole = conServiceRole ? variable('STAGING_SERVICE_ROLE_KEY') : null
  const bloqueos = [
    variable('STAGING_CONFIRMAR', false) !== 'staging' && 'falta STAGING_CONFIRMAR=staging',
    !PRODUCCION_URL && 'no se pudo leer la URL de producción de lib/supabase.ts',
    PRODUCCION_URL && new URL(url).host === new URL(PRODUCCION_URL).host && 'la URL es la de producción',
    PRODUCCION_ANON && anon === PRODUCCION_ANON && 'la llave pública es la de producción',
    serviceRole && PRODUCCION_SERVICE && serviceRole === PRODUCCION_SERVICE && 'la service_role es la de producción',
  ].filter(Boolean)
  if (bloqueos.length) { console.error(`BLOQUEADO: ${bloqueos.join('; ')}.`); process.exit(2) }
  return { url, anon, serviceRole }
}

let fallas = 0
export const resultado = (ok, nombre, detalle = '') => { if (!ok) fallas++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${nombre}${detalle ? ` — ${detalle}` : ''}`) }
export const info = (nombre, detalle) => console.log(`INFO  ${nombre} — ${detalle}`)
export const terminar = () => { console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : '\nTodas las pruebas pasaron en staging.'); process.exit(fallas ? 1 : 0) }
